// Histórico de candles da Binance salvo em SQLite (tabela "Candle").
// Servidor apenas. Usa SQL direto para a tabela existir sem exigir `prisma db push`
// (o modelo equivalente está em prisma/schema.prisma).

import { db } from "@/lib/db";

const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";
const PAGE = 1000; // máximo por requisição da Binance
const PAGE_DELAY_MS = 150;
const MAX_CANDLES_PER_SYMBOL = 50_000;

export const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

export interface BackfillResult {
  symbol: string;
  interval: Interval;
  fetched: number;
  total: number;
  from: number | null;
  to: number | null;
  error?: string;
}

export function isValidSymbol(s: string): boolean {
  return /^[A-Z0-9]{5,20}$/.test(s);
}

export function isValidInterval(i: string): i is Interval {
  return (INTERVALS as readonly string[]).includes(i);
}

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  tableReady ??= db
    .$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "Candle" (
        "symbol" TEXT NOT NULL,
        "interval" TEXT NOT NULL,
        "openTime" REAL NOT NULL,
        "open" REAL NOT NULL,
        "high" REAL NOT NULL,
        "low" REAL NOT NULL,
        "close" REAL NOT NULL,
        "volume" REAL NOT NULL,
        "closeTime" REAL NOT NULL,
        "quoteVolume" REAL NOT NULL,
        "trades" INTEGER NOT NULL,
        PRIMARY KEY ("symbol", "interval", "openTime")
      )`
    )
    .then(() => undefined)
    .catch((e) => {
      tableReady = null;
      throw e;
    });
  return tableReady;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseRow(k: any[]): Candle {
  return {
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8],
  };
}

async function fetchPage(symbol: string, interval: Interval, startTime: number, limit = PAGE): Promise<Candle[]> {
  const url = `${BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (res.status === 429 || res.status === 418) {
    throw new Error(`Binance limitou as requisições (HTTP ${res.status}). Tente novamente em alguns minutos.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Binance HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
  }
  const raw: any[][] = await res.json();
  return raw.map(parseRow);
}

/** Insere ignorando duplicados; devolve quantas linhas eram realmente novas. */
async function insertCandles(symbol: string, interval: Interval, candles: Candle[]): Promise<number> {
  let inserted = 0;
  const CHUNK = 400; // 11 parâmetros por linha, bem abaixo do limite de variáveis do SQLite
  for (let i = 0; i < candles.length; i += CHUNK) {
    const part = candles.slice(i, i + CHUNK);
    const placeholders = part.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const params = part.flatMap((c) => [
      symbol, interval, c.openTime, c.open, c.high, c.low, c.close, c.volume, c.closeTime, c.quoteVolume, c.trades,
    ]);
    inserted += await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "Candle" ("symbol","interval","openTime","open","high","low","close","volume","closeTime","quoteVolume","trades") VALUES ${placeholders}`,
      ...params
    );
  }
  return inserted;
}

export async function getRange(symbol: string, interval: Interval) {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<{ n: bigint | number; minT: number | null; maxT: number | null }[]>(
    `SELECT COUNT(*) AS n, MIN("openTime") AS minT, MAX("openTime") AS maxT FROM "Candle" WHERE "symbol" = ? AND "interval" = ?`,
    symbol,
    interval
  );
  const r = rows[0];
  return { total: Number(r?.n ?? 0), from: r?.minT ?? null, to: r?.maxT ?? null };
}

/**
 * Baixa de `startTime` até `stopBefore` (ou até agora), página por página, guardando só candles
 * já fechados. Devolve quantos candles novos foram salvos.
 */
async function downloadForward(
  symbol: string,
  interval: Interval,
  startTime: number,
  budget: number,
  stopBefore = Infinity
): Promise<number> {
  const step = INTERVAL_MS[interval];
  let cursor = startTime;
  let saved = 0;
  while (saved < budget) {
    const page = await fetchPage(symbol, interval, cursor);
    if (page.length === 0) break;
    const closed = page.filter((c) => c.closeTime < Date.now() && c.openTime < stopBefore);
    saved += await insertCandles(symbol, interval, closed);
    if (page.some((c) => c.openTime >= stopBefore)) break;
    const lastOpen = page[page.length - 1].openTime;
    if (page.length < PAGE || lastOpen + step <= cursor) break;
    cursor = lastOpen + step;
    await sleep(PAGE_DELAY_MS);
  }
  return saved;
}

/**
 * Garante cobertura dos últimos `days` dias: preenche o buraco antigo (se o histórico
 * local começa depois do pedido) e atualiza do último candle salvo até agora.
 */
export async function backfill(symbol: string, interval: Interval, days: number): Promise<BackfillResult> {
  const step = INTERVAL_MS[interval];
  const wantedFrom = Math.floor((Date.now() - days * 86_400_000) / step) * step;
  const budget = MAX_CANDLES_PER_SYMBOL;
  let fetched = 0;

  try {
    const before = await getRange(symbol, interval);

    if (before.total === 0 || before.from === null || before.to === null) {
      fetched += await downloadForward(symbol, interval, wantedFrom, budget);
    } else {
      // 1) Buraco antigo: do início pedido até o primeiro candle salvo
      if (wantedFrom < before.from) {
        fetched += await downloadForward(symbol, interval, wantedFrom, budget, before.from);
      }
      // 2) Buraco recente: do último candle salvo até agora
      fetched += await downloadForward(symbol, interval, before.to + step, budget);
    }

    const after = await getRange(symbol, interval);
    return { symbol, interval, fetched, ...after };
  } catch (e: any) {
    const after = await getRange(symbol, interval).catch(() => ({ total: 0, from: null, to: null }));
    return { symbol, interval, fetched, ...after, error: e?.message ?? "erro desconhecido" };
  }
}

export async function readCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Candle[]>(
    `SELECT "openTime","open","high","low","close","volume","closeTime","quoteVolume","trades"
       FROM "Candle" WHERE "symbol" = ? AND "interval" = ? ORDER BY "openTime" DESC LIMIT ?`,
    symbol,
    interval,
    limit
  );
  return rows
    .map((r) => ({ ...r, trades: Number(r.trades) }))
    .reverse();
}

export async function coverage() {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<
    { symbol: string; interval: string; n: bigint | number; minT: number; maxT: number }[]
  >(
    `SELECT "symbol", "interval", COUNT(*) AS n, MIN("openTime") AS minT, MAX("openTime") AS maxT
       FROM "Candle" GROUP BY "symbol", "interval" ORDER BY "symbol", "interval"`
  );
  return rows.map((r) => ({
    symbol: r.symbol,
    interval: r.interval,
    total: Number(r.n),
    from: r.minT,
    to: r.maxT,
  }));
}

/** Últimos candles direto da Binance (inclui o candle em formação) para completar o fim da série. */
export async function fetchLiveTail(symbol: string, interval: Interval, limit = 5): Promise<Candle[]> {
  const url = `${BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const raw: any[][] = await res.json();
  return raw.map(parseRow);
}
