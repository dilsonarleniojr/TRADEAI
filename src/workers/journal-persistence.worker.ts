/**
 * Journal Persistence Web Worker (IndexedDB + SQLite /api/journal/sync)
 *
 * Executa fora da Main Thread:
 * 1. Persistência transacional em lote (readwrite transaction) no IndexedDB
 *    (`tradeai_institutional_journal_db`, objectStore `journal_records`).
 * 2. Sincronização assíncrona em lote com o endpoint SQLite WAL (`/api/journal/sync`).
 * 3. Recuperação paginada/ordenada de históricos > 1.000+ execuções sem bloquear a UI.
 */

import type { TradeJournalRecord } from "@/lib/journal/trade-journal-engine";

export const JOURNAL_IDB_NAME = "tradeai_institutional_journal_db";
export const JOURNAL_IDB_VERSION = 1;
export const JOURNAL_IDB_STORE = "journal_records";

export type JournalWorkerInboundMessage =
  | {
      type: "FLUSH_BATCH";
      requestId: string;
      records: TradeJournalRecord[];
      syncSqlite?: boolean;
      apiEndpoint?: string;
    }
  | {
      type: "LOAD_ALL";
      requestId: string;
      limit?: number;
      syncSqlite?: boolean;
      apiEndpoint?: string;
    }
  | {
      type: "CLEAR_ALL";
      requestId: string;
      syncSqlite?: boolean;
      apiEndpoint?: string;
    };

export type JournalWorkerOutboundMessage =
  | {
      type: "FLUSH_COMPLETE";
      requestId: string;
      persistedIndexedDb: number;
      persistedSqlite: number;
      durationMs: number;
      indexedDbAvailable: boolean;
      sqliteSynced: boolean;
    }
  | {
      type: "LOAD_COMPLETE";
      requestId: string;
      records: TradeJournalRecord[];
      source: "INDEXED_DB" | "SQLITE_API" | "MERGED" | "EMPTY";
      durationMs: number;
    }
  | {
      type: "CLEAR_COMPLETE";
      requestId: string;
      cleared: boolean;
    }
  | {
      type: "WORKER_ERROR";
      requestId?: string;
      error: string;
    };

/**
 * Código fonte embutido para criação de Worker via Blob URL (compatível com Next.js Turbopack/Webpack e Browser)
 */
export function getJournalPersistenceWorkerSource(): string {
  return `
    var DB_NAME = "${JOURNAL_IDB_NAME}";
    var DB_VERSION = ${JOURNAL_IDB_VERSION};
    var STORE_NAME = "${JOURNAL_IDB_STORE}";
    var dbPromise = null;

    function openJournalDb() {
      if (typeof indexedDB === "undefined") {
        return Promise.resolve(null);
      }
      if (dbPromise) return dbPromise;

      dbPromise = new Promise(function(resolve) {
        try {
          var req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function(event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              var store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
              store.createIndex("exitTimestampMs", "exitTimestampMs", { unique: false });
              store.createIndex("symbol", "symbol", { unique: false });
              store.createIndex("mode", "mode", { unique: false });
              store.createIndex("source", "source", { unique: false });
            }
          };
          req.onsuccess = function(event) {
            resolve(event.target.result);
          };
          req.onerror = function() {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });

      return dbPromise;
    }

    function writeBatchToIndexedDb(records) {
      return openJournalDb().then(function(db) {
        if (!db || !Array.isArray(records) || records.length === 0) {
          return { count: 0, available: !!db };
        }
        return new Promise(function(resolve) {
          try {
            var tx = db.transaction([STORE_NAME], "readwrite");
            var store = tx.objectStore(STORE_NAME);
            for (var i = 0; i < records.length; i++) {
              store.put(records[i]);
            }
            tx.oncomplete = function() {
              resolve({ count: records.length, available: true });
            };
            tx.onerror = function() {
              resolve({ count: 0, available: true });
            };
          } catch (e) {
            resolve({ count: 0, available: false });
          }
        });
      });
    }

    function readAllFromIndexedDb(limit) {
      return openJournalDb().then(function(db) {
        if (!db) return [];
        return new Promise(function(resolve) {
          try {
            var tx = db.transaction([STORE_NAME], "readonly");
            var store = tx.objectStore(STORE_NAME);
            var req = store.getAll();
            req.onsuccess = function(event) {
              var list = event.target.result || [];
              list.sort(function(a, b) {
                return (b.exitTimestampMs || 0) - (a.exitTimestampMs || 0);
              });
              if (limit && list.length > limit) {
                list = list.slice(0, limit);
              }
              resolve(list);
            };
            req.onerror = function() {
              resolve([]);
            };
          } catch (e) {
            resolve([]);
          }
        });
      });
    }

    function clearIndexedDb() {
      return openJournalDb().then(function(db) {
        if (!db) return false;
        return new Promise(function(resolve) {
          try {
            var tx = db.transaction([STORE_NAME], "readwrite");
            var store = tx.objectStore(STORE_NAME);
            var req = store.clear();
            req.onsuccess = function() { resolve(true); };
            req.onerror = function() { resolve(false); };
          } catch (e) {
            resolve(false);
          }
        });
      });
    }

    function syncBatchToSqliteApi(records, endpoint) {
      if (typeof fetch !== "function" || !Array.isArray(records) || records.length === 0) {
        return Promise.resolve({ synced: false, count: 0 });
      }
      var url = endpoint || "/api/journal/sync";
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: records })
      })
        .then(function(res) { return res.json(); })
        .then(function(json) {
          return {
            synced: !!(json && json.success),
            count: (json && json.persistedCount) || 0
          };
        })
        .catch(function() {
          return { synced: false, count: 0 };
        });
    }

    function loadFromSqliteApi(limit, endpoint) {
      if (typeof fetch !== "function") {
        return Promise.resolve([]);
      }
      var url = (endpoint || "/api/journal/sync") + "?limit=" + (limit || 5000);
      return fetch(url, { method: "GET" })
        .then(function(res) { return res.json(); })
        .then(function(json) {
          return (json && json.success && Array.isArray(json.records)) ? json.records : [];
        })
        .catch(function() {
          return [];
        });
    }

    function clearSqliteApi(endpoint) {
      if (typeof fetch !== "function") {
        return Promise.resolve(false);
      }
      var url = endpoint || "/api/journal/sync";
      return fetch(url, { method: "DELETE" })
        .then(function(res) { return res.ok; })
        .catch(function() { return false; });
    }

    self.onmessage = function(e) {
      var msg = e.data;
      if (!msg || !msg.type) return;

      var start = typeof performance !== "undefined" ? performance.now() : Date.now();

      if (msg.type === "FLUSH_BATCH") {
        var records = msg.records || [];
        var shouldSyncSqlite = msg.syncSqlite !== false;
        Promise.all([
          writeBatchToIndexedDb(records),
          shouldSyncSqlite ? syncBatchToSqliteApi(records, msg.apiEndpoint) : Promise.resolve({ synced: false, count: 0 })
        ]).then(function(results) {
          var idbRes = results[0];
          var sqlRes = results[1];
          var elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
          self.postMessage({
            type: "FLUSH_COMPLETE",
            requestId: msg.requestId,
            persistedIndexedDb: idbRes.count,
            persistedSqlite: sqlRes.count,
            durationMs: Number(elapsed.toFixed(2)),
            indexedDbAvailable: idbRes.available,
            sqliteSynced: sqlRes.synced
          });
        }).catch(function(err) {
          self.postMessage({
            type: "WORKER_ERROR",
            requestId: msg.requestId,
            error: err && err.message ? err.message : "Erro no flush do Worker"
          });
        });
      } else if (msg.type === "LOAD_ALL") {
        var limit = msg.limit || 5000;
        var shouldSyncSqlite = msg.syncSqlite !== false;
        Promise.all([
          readAllFromIndexedDb(limit),
          shouldSyncSqlite ? loadFromSqliteApi(limit, msg.apiEndpoint) : Promise.resolve([])
        ]).then(function(results) {
          var idbRecords = results[0] || [];
          var sqlRecords = results[1] || [];
          var mergedMap = new Map();
          for (var i = 0; i < sqlRecords.length; i++) {
            if (sqlRecords[i] && sqlRecords[i].id) {
              mergedMap.set(sqlRecords[i].id, sqlRecords[i]);
            }
          }
          for (var j = 0; j < idbRecords.length; j++) {
            if (idbRecords[j] && idbRecords[j].id) {
              mergedMap.set(idbRecords[j].id, idbRecords[j]);
            }
          }
          var merged = Array.from(mergedMap.values()).sort(function(a, b) {
            return (b.exitTimestampMs || 0) - (a.exitTimestampMs || 0);
          });
          if (limit && merged.length > limit) {
            merged = merged.slice(0, limit);
          }
          var elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
          var source = idbRecords.length > 0 && sqlRecords.length > 0
            ? "MERGED"
            : idbRecords.length > 0
              ? "INDEXED_DB"
              : sqlRecords.length > 0
                ? "SQLITE_API"
                : "EMPTY";
          self.postMessage({
            type: "LOAD_COMPLETE",
            requestId: msg.requestId,
            records: merged,
            source: source,
            durationMs: Number(elapsed.toFixed(2))
          });
        });
      } else if (msg.type === "CLEAR_ALL") {
        var shouldSyncSqlite = msg.syncSqlite !== false;
        Promise.all([
          clearIndexedDb(),
          shouldSyncSqlite ? clearSqliteApi(msg.apiEndpoint) : Promise.resolve(true)
        ]).then(function() {
          self.postMessage({
            type: "CLEAR_COMPLETE",
            requestId: msg.requestId,
            cleared: true
          });
        });
      }
    };
  `;
}

