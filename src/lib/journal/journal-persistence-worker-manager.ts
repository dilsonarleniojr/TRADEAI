import type { TradeJournalRecord } from "./trade-journal-engine";
import {
  getJournalPersistenceWorkerSource,
  JOURNAL_IDB_NAME,
  JOURNAL_IDB_STORE,
  JOURNAL_IDB_VERSION,
  type JournalWorkerInboundMessage,
  type JournalWorkerOutboundMessage,
} from "@/workers/journal-persistence.worker";

export const JOURNAL_PERSISTENCE_DEBOUNCE_MS = 500;
export const JOURNAL_PERSISTENCE_MAX_WAIT_MS = 2000;
export const JOURNAL_PERSISTENCE_MAX_BATCH_SIZE = 200;

export interface JournalPersistenceStats {
  persistenceMode: "WORKER_INDEXEDDB_SQLITE" | "ASYNC_BATCH_FALLBACK";
  workerActive: boolean;
  indexedDbReady: boolean;
  sqliteSyncEnabled: boolean;
  debounceMs: number;
  pendingBatchSize: number;
  totalBatchesFlushed: number;
  totalRecordsPersisted: number;
  lastBatchSize: number;
  lastFlushDurationMs: number;
  lastFlushTimestamp: number | null;
  mainThreadFullJsonSerializations: number;
}

export type CustomBatchSinkHandler = (
  records: TradeJournalRecord[]
) => Promise<{ persistedIndexedDb: number; persistedSqlite: number }> | { persistedIndexedDb: number; persistedSqlite: number };

/**
 * JournalPersistenceWorkerManager
 *
 * Orquestra a escrita assíncrona em lote (debounced batch write a cada 500ms)
 * no IndexedDB e no endpoint SQLite WAL (`/api/journal/sync`) via Web Worker dedicado,
 * eliminando serializações JSON síncronas na thread principal mesmo quando o histórico
 * ultrapassa 1.000+ execuções.
 */
export class JournalPersistenceWorkerManager {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private workerActive = false;
  private indexedDbReady = false;
  private sqliteSyncEnabled = true;
  private debounceMs = JOURNAL_PERSISTENCE_DEBOUNCE_MS;
  private maxWaitMs = JOURNAL_PERSISTENCE_MAX_WAIT_MS;
  private maxBatchSize = JOURNAL_PERSISTENCE_MAX_BATCH_SIZE;

  // Buffer O(1) de registros modificados ("dirty delta") aguardando o próximo flush debounced
  private pendingRecords = new Map<string, TradeJournalRecord>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private firstEnqueuedAt: number | null = null;

  // Promises pendentes por requestId do Worker
  private pendingRequests = new Map<
    string,
    {
      resolve: (msg: JournalWorkerOutboundMessage) => void;
      reject: (err: Error) => void;
    }
  >();

  // Fallback de armazenamento assíncrono em memória/IndexedDB para ambientes sem Worker (SSR/Testes)
  private fallbackIndexedDbStore = new Map<string, TradeJournalRecord>();
  private customBatchSink: CustomBatchSinkHandler | null = null;

  // Métricas de telemetria
  private totalBatchesFlushed = 0;
  private totalRecordsPersisted = 0;
  private lastBatchSize = 0;
  private lastFlushDurationMs = 0;
  private lastFlushTimestamp: number | null = null;
  private flushListeners: Array<(stats: JournalPersistenceStats) => void> = [];

  constructor() {
    this.initWorker();
    this.registerLifecycleFlushHooks();
  }

  private initWorker(): void {
    if (typeof window === "undefined" || typeof Worker === "undefined" || typeof Blob === "undefined") {
      this.workerActive = false;
      this.indexedDbReady = typeof indexedDB !== "undefined";
      return;
    }

    try {
      const source = getJournalPersistenceWorkerSource();
      const blob = new Blob([source], { type: "application/javascript" });
      this.workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerUrl);
      this.workerActive = true;
      this.indexedDbReady = typeof indexedDB !== "undefined";

      this.worker.onmessage = (evt: MessageEvent<JournalWorkerOutboundMessage>) => {
        const data = evt.data;
        if (!data || !data.type) return;

        if (data.type === "FLUSH_COMPLETE") {
          this.indexedDbReady = data.indexedDbAvailable || this.indexedDbReady;
        }

        if ("requestId" in data && data.requestId) {
          const pending = this.pendingRequests.get(data.requestId);
          if (pending) {
            this.pendingRequests.delete(data.requestId);
            pending.resolve(data);
          }
        }
      };

      this.worker.onerror = () => {
        // Fallback gracioso caso o CSP ou runtime restrinja Blob Worker
        this.workerActive = false;
      };
    } catch {
      this.workerActive = false;
    }
  }

  private registerLifecycleFlushHooks(): void {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    try {
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && this.pendingRecords.size > 0) {
          void this.flushNow();
        }
      });
      window.addEventListener("pagehide", () => {
        if (this.pendingRecords.size > 0) {
          void this.flushNow();
        }
      });
    } catch {
      // Ignora em ambientes restritos
    }
  }

  /**
   * Configura parâmetros do debounce ou sink customizado (útil para testes determinísticos)
   */
  public configure(options: {
    debounceMs?: number;
    maxWaitMs?: number;
    maxBatchSize?: number;
    sqliteSyncEnabled?: boolean;
    customBatchSink?: CustomBatchSinkHandler | null;
  }): void {
    if (typeof options.debounceMs === "number" && options.debounceMs >= 10) {
      this.debounceMs = options.debounceMs;
    }
    if (typeof options.maxWaitMs === "number" && options.maxWaitMs >= this.debounceMs) {
      this.maxWaitMs = options.maxWaitMs;
    }
    if (typeof options.maxBatchSize === "number" && options.maxBatchSize >= 1) {
      this.maxBatchSize = options.maxBatchSize;
    }
    if (typeof options.sqliteSyncEnabled === "boolean") {
      this.sqliteSyncEnabled = options.sqliteSyncEnabled;
    }
    if (options.customBatchSink !== undefined) {
      this.customBatchSink = options.customBatchSink;
    }
  }

  /**
   * Enfileira um único registro no lote assíncrono em O(1) sem qualquer JSON.stringify na Main Thread.
   * Agenda ou renova o timer de debounce de 500ms (respeitando maxWaitMs e maxBatchSize).
   */
  public enqueueRecord(record: TradeJournalRecord): void {
    this.pendingRecords.set(record.id, record);

    const now = Date.now();
    if (this.firstEnqueuedAt === null) {
      this.firstEnqueuedAt = now;
    }

    // Se atingiu o limite máximo de lote ou o tempo máximo de espera contínua, faz flush imediato assíncrono
    if (
      this.pendingRecords.size >= this.maxBatchSize ||
      now - this.firstEnqueuedAt >= this.maxWaitMs
    ) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      void this.flushNow();
      return;
    }

    // Agenda escrita em lote debounced (padrão 500ms)
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushNow();
    }, this.debounceMs);
  }

  /**
   * Enfileira múltiplos registros de uma só vez (ex: migração inicial / backfill)
   */
  public enqueueBatch(records: TradeJournalRecord[]): void {
    for (const r of records) {
      if (r?.id) {
        this.pendingRecords.set(r.id, r);
      }
    }
    if (this.pendingRecords.size === 0) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushNow();
    }, this.debounceMs);
  }

  /**
   * Executa imediatamente o flush assíncrono do lote pendente para o Web Worker (IndexedDB + SQLite).
   */
  public async flushNow(): Promise<JournalPersistenceStats> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.firstEnqueuedAt = null;

    if (this.pendingRecords.size === 0) {
      return this.getStats();
    }

    const batch = Array.from(this.pendingRecords.values());
    this.pendingRecords.clear();

    const start = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      if (this.customBatchSink) {
        for (const rec of batch) {
          this.fallbackIndexedDbStore.set(rec.id, rec);
        }
        await this.customBatchSink(batch);
        this.indexedDbReady = true;
      } else if (this.workerActive && this.worker) {
        await this.sendToWorker({
          type: "FLUSH_BATCH",
          requestId: `flush_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          records: batch,
          syncSqlite: this.sqliteSyncEnabled,
          apiEndpoint: "/api/journal/sync",
        });
      } else {
        await this.flushFallbackAsync(batch);
      }
    } catch (err) {
      console.warn("[JournalPersistenceWorkerManager] Aviso no flush assíncrono:", err);
    }

    const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    this.totalBatchesFlushed += 1;
    this.totalRecordsPersisted += batch.length;
    this.lastBatchSize = batch.length;
    this.lastFlushDurationMs = Number(elapsed.toFixed(2));
    this.lastFlushTimestamp = Date.now();

    const stats = this.getStats();
    this.notifyFlushListeners(stats);
    return stats;
  }

  /**
   * Carrega todos os registros persistidos no IndexedDB / SQLite de forma assíncrona.
   */
  public async loadPersistedRecords(limit = 5000): Promise<TradeJournalRecord[]> {
    if (this.workerActive && this.worker) {
      try {
        const res = await this.sendToWorker({
          type: "LOAD_ALL",
          requestId: `load_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          limit,
          syncSqlite: this.sqliteSyncEnabled,
          apiEndpoint: "/api/journal/sync",
        });
        if (res.type === "LOAD_COMPLETE") {
          return res.records;
        }
      } catch {
        // Fallback abaixo
      }
    }

    // Fallback assíncrono (IndexedDB direto ou store em memória de teste)
    const idbRecords = await this.readDirectIndexedDb(limit);
    if (idbRecords.length > 0) {
      return idbRecords;
    }

    return Array.from(this.fallbackIndexedDbStore.values()).sort(
      (a, b) => (b.exitTimestampMs || 0) - (a.exitTimestampMs || 0)
    );
  }

  /**
   * Limpa todos os registros tanto no buffer pendente quanto no IndexedDB e SQLite.
   */
  public async clearAllPersisted(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingRecords.clear();
    this.firstEnqueuedAt = null;
    this.fallbackIndexedDbStore.clear();

    if (this.workerActive && this.worker) {
      try {
        await this.sendToWorker({
          type: "CLEAR_ALL",
          requestId: `clear_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          syncSqlite: this.sqliteSyncEnabled,
          apiEndpoint: "/api/journal/sync",
        });
        return;
      } catch {
        // Fallback abaixo
      }
    }

    await this.clearDirectIndexedDb();
  }

  public getStats(): JournalPersistenceStats {
    return {
      persistenceMode: this.workerActive ? "WORKER_INDEXEDDB_SQLITE" : "ASYNC_BATCH_FALLBACK",
      workerActive: this.workerActive,
      indexedDbReady: this.indexedDbReady || this.fallbackIndexedDbStore.size > 0,
      sqliteSyncEnabled: this.sqliteSyncEnabled,
      debounceMs: this.debounceMs,
      pendingBatchSize: this.pendingRecords.size,
      totalBatchesFlushed: this.totalBatchesFlushed,
      totalRecordsPersisted: this.totalRecordsPersisted,
      lastBatchSize: this.lastBatchSize,
      lastFlushDurationMs: this.lastFlushDurationMs,
      lastFlushTimestamp: this.lastFlushTimestamp,
      mainThreadFullJsonSerializations: 0,
    };
  }

  public subscribeFlushStats(callback: (stats: JournalPersistenceStats) => void): () => void {
    this.flushListeners.push(callback);
    callback(this.getStats());
    return () => {
      this.flushListeners = this.flushListeners.filter((cb) => cb !== callback);
    };
  }

  public resetTelemetryForTesting(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingRecords.clear();
    this.fallbackIndexedDbStore.clear();
    this.firstEnqueuedAt = null;
    this.totalBatchesFlushed = 0;
    this.totalRecordsPersisted = 0;
    this.lastBatchSize = 0;
    this.lastFlushDurationMs = 0;
    this.lastFlushTimestamp = null;
  }

  private notifyFlushListeners(stats: JournalPersistenceStats): void {
    for (const listener of this.flushListeners) {
      try {
        listener(stats);
      } catch {
        // Ignora erro de listener
      }
    }
  }

  private sendToWorker(msg: JournalWorkerInboundMessage): Promise<JournalWorkerOutboundMessage> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker indisponível"));
        return;
      }
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(msg.requestId);
        reject(new Error("Timeout na operação do Journal Persistence Worker"));
      }, 8000);

      this.pendingRequests.set(msg.requestId, {
        resolve: (res) => {
          clearTimeout(timeoutId);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });

      this.worker.postMessage(msg);
    });
  }

  private async flushFallbackAsync(batch: TradeJournalRecord[]): Promise<void> {
    // 1. Atualiza o store IndexedDB (se disponível no ambiente) ou fallback em memória
    for (const rec of batch) {
      this.fallbackIndexedDbStore.set(rec.id, rec);
    }

    await this.writeDirectIndexedDb(batch);

    // 2. Sincroniza em lote com /api/journal/sync se estivermos em ambiente de navegador
    if (this.sqliteSyncEnabled && typeof window !== "undefined" && typeof fetch === "function") {
      try {
        await fetch("/api/journal/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: batch }),
        });
      } catch {
        // Ignora falha de rede transitória
      }
    }
  }

  private openDirectIndexedDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(JOURNAL_IDB_NAME, JOURNAL_IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(JOURNAL_IDB_STORE)) {
            const store = db.createObjectStore(JOURNAL_IDB_STORE, { keyPath: "id" });
            store.createIndex("exitTimestampMs", "exitTimestampMs", { unique: false });
            store.createIndex("symbol", "symbol", { unique: false });
            store.createIndex("mode", "mode", { unique: false });
            store.createIndex("source", "source", { unique: false });
          }
        };
        req.onsuccess = () => {
          this.indexedDbReady = true;
          resolve(req.result);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async writeDirectIndexedDb(records: TradeJournalRecord[]): Promise<void> {
    const db = await this.openDirectIndexedDb();
    if (!db || records.length === 0) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([JOURNAL_IDB_STORE], "readwrite");
        const store = tx.objectStore(JOURNAL_IDB_STORE);
        for (const rec of records) {
          store.put(rec);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async readDirectIndexedDb(limit: number): Promise<TradeJournalRecord[]> {
    const db = await this.openDirectIndexedDb();
    if (!db) return [];

    return new Promise<TradeJournalRecord[]>((resolve) => {
      try {
        const tx = db.transaction([JOURNAL_IDB_STORE], "readonly");
        const store = tx.objectStore(JOURNAL_IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = Array.isArray(req.result) ? (req.result as TradeJournalRecord[]) : [];
          list.sort((a, b) => (b.exitTimestampMs || 0) - (a.exitTimestampMs || 0));
          resolve(limit ? list.slice(0, limit) : list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  private async clearDirectIndexedDb(): Promise<void> {
    const db = await this.openDirectIndexedDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([JOURNAL_IDB_STORE], "readwrite");
        const store = tx.objectStore(JOURNAL_IDB_STORE);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const journalPersistenceManager = new JournalPersistenceWorkerManager();
