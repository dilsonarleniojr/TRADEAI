// Validação fora da amostra de variações do plano de entradas (src/lib/ai-entries.ts).
// Protocolo (definido antes de ver os resultados):
//  1) 730 dias de velas de 1 h, 8 pares; treino = primeiros 60% do tempo, teste = últimos 40%.
//  2) As 11 variações abaixo são fixas. A escolha usa SÓ o treino (média líquida por operação, >= 60 ops e fator de lucro > 1,05).
//  3) A escolhida é avaliada UMA vez no teste e comparada com o plano atual e com entradas aleatórias.
// Uso: npx tsx scripts/backtest-variants.ts   (cache em BT_CACHE, padrão /tmp/tradeai-klines)
import fs from "fs";
import path from "path";
import { computeIndicators, planEntry, type Candle, type MarketSnapshot, type TradeEntry } from "../src/lib/ai-entries";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT"];
const DAYS = 730;
const WARMUP = 260; // 4 h x 60 velas para o filtro de tendência maior
const LIMIT_WAIT = 12;
const COST_PER_SIDE = 0.0015; // taxa 0,1% + derrapagem 0,05%
const CACHE = process.env.BT_CACHE || "/tmp/tradeai-klines";

interface K extends Candle { open: number; time: number }
type Exit = "base" | "single" | "trailonly";
interface Variant { name: string; longOnly?: boolean; htf?: boolean; limitOnly?: boolean; costAware?: boolean; strength?: boolean; exit: Exit }

const VARIANTS: Variant[] = [
  { name: "01 plano atual", exit: "base" },
  { name: "02 só compras", longOnly: true, exit: "base" },
  { name: "03 + tendência 4h a favor", htf: true, exit: "base" },
  { name: "04 só compras + tendência 4h", longOnly: true, htf: true, exit: "base" },
  { name: "05 só ordem limite (recuo)", limitOnly: true, exit: "base" },
  { name: "06 filtro de custo (stop >= 1,2%)", costAware: true, exit: "base" },
  { name: "07 força da tendência (|EMA20-EMA50| >= 1,5 ATR)", strength: true, exit: "base" },
  { name: "08 alvo único (sem parcial)", exit: "single" },
  { name: "09 só stop móvel (sem alvos)", exit: "trailonly" },
  { name: "10 compras + 4h + stop móvel", longOnly: true, htf: true, exit: "trailonly" },
  { name: "11 compras + 4h + filtro de custo", longOnly: true, htf: true, costAware: true, exit: "base" },
];

async function load(symbol: string): Promise<K[]> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${symbol}-${DAYS}d.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const out: K[] = [];
  let end = Date.now();
  while (out.length < DAYS * 24) {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=1000&endTime=${end}`);
    if (!res.ok) throw new Error(`${symbol}: ${res.status}`);
    const rows: any[] = await res.json();
    if (!rows.length) break;
    out.unshift(...rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] })));
    end = rows[0][0] - 1;
  }
  const data = out.slice(-DAYS * 24);
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}
// Tendência em velas de 4 h, amostrando o fechamento a cada 4 velas de 1 h, sem olhar o futuro
function htfTrend(k: K[], i: number): "up" | "down" | "range" {
  const closes: number[] = [];
  for (let j = i - 4 * 59; j <= i; j += 4) closes.push(k[j].close);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), last = closes[closes.length - 1];
  return e20 > e50 && last > e50 ? "up" : e20 < e50 && last < e50 ? "down" : "range";
}

function snapshotAt(k: K[], i: number, symbol: string): MarketSnapshot {
  const price = k[i].close;
  const last24 = k.slice(i - 23, i + 1);
  return {
    symbol, price,
    changePct: ((price - k[i - 24].close) / k[i - 24].close) * 100,
    high24h: Math.max(...last24.map((c) => c.high)),
    low24h: Math.min(...last24.map((c) => c.low)),
    candles: [...k.slice(i - 119, i + 1), { high: price, low: price, close: price, volume: 0 }],
  };
}

interface Trade { symbol: string; r: number; gross: number; time: number; side: string }

function simulate(k: K[], i: number, plan: TradeEntry, exit: Exit): { r: number; gross: number; end: number } | null {
  const dir = plan.side === "BUY" ? 1 : -1;
  let fillIdx = i + 1;
  let entry = k[i + 1]?.open;
  if (entry === undefined) return null;
  let p = plan;
  if (plan.orderType === "LIMIT") {
    entry = plan.entry;
    let filled = -1;
    for (let j = i + 1; j <= Math.min(i + LIMIT_WAIT, k.length - 1); j++) {
      const hit = dir === 1 ? k[j].low <= entry : k[j].high >= entry;
      const stopFirst = dir === 1 ? k[j].low <= plan.stopLoss : k[j].high >= plan.stopLoss;
      if (stopFirst && !hit) return null;
      if (hit) { filled = j; break; }
    }
    if (filled < 0) return null;
    fillIdx = filled;
  } else {
    const shift = entry - plan.entry;
    p = { ...plan, entry, stopLoss: plan.stopLoss + shift, takeProfit: plan.takeProfit + shift, takeProfit2: plan.takeProfit2 + shift };
  }
  const risk = Math.abs(entry - p.stopLoss);
  if (!(risk > 0)) return null;
  const maxHold = exit === "trailonly" ? 168 : 72;
  let stop = p.stopLoss;
  let remaining = 1, gross = 0, tp1Done = false, peak = entry;
  const take = (price: number, frac: number) => { gross += frac * (dir * (price - entry)) / risk; remaining -= frac; };
  const fin = (end: number) => ({ gross, r: gross - (COST_PER_SIDE * 2 * entry) / risk, end });

  for (let j = fillIdx; j < Math.min(fillIdx + maxHold, k.length); j++) {
    const c = k[j];
    if (dir === 1 ? c.low <= stop : c.high >= stop) { take(stop, remaining); return fin(j); }
    if (exit === "trailonly") {
      peak = dir === 1 ? Math.max(peak, c.high) : Math.min(peak, c.low);
      const trail = dir === 1 ? peak - 1.5 * risk : peak + 1.5 * risk; // chandelier de 1,5R
      stop = dir === 1 ? Math.max(stop, trail) : Math.min(stop, trail);
      continue;
    }
    if (exit === "single") {
      if (dir === 1 ? c.high >= p.takeProfit : c.low <= p.takeProfit) { take(p.takeProfit, remaining); return fin(j); }
      continue;
    }
    if (!tp1Done) {
      if (dir === 1 ? c.high >= p.takeProfit : c.low <= p.takeProfit) { take(p.takeProfit, 0.5); tp1Done = true; stop = entry; peak = dir === 1 ? c.high : c.low; }
    } else {
      if (dir === 1 ? c.high >= p.takeProfit2 : c.low <= p.takeProfit2) { take(p.takeProfit2, remaining); return fin(j); }
      peak = dir === 1 ? Math.max(peak, c.high) : Math.min(peak, c.low);
      const trail = dir === 1 ? peak - p.trailingDistance : peak + p.trailingDistance;
      stop = dir === 1 ? Math.max(stop, trail) : Math.min(stop, trail);
    }
  }
  const last = Math.min(fillIdx + maxHold, k.length) - 1;
  take(k[last].close, remaining);
  return fin(last);
}

function stats(ts: Trade[]) {
  const n = ts.length;
  if (!n) return { n: 0, win: 0, avg: 0, gross: 0, pf: 0, total: 0, dd: 0 };
  const w = ts.filter((t) => t.r > 0);
  const gp = w.reduce((a, t) => a + t.r, 0);
  const gl = -ts.filter((t) => t.r <= 0).reduce((a, t) => a + t.r, 0);
  let eq = 0, pk = 0, dd = 0;
  for (const t of [...ts].sort((a, b) => a.time - b.time)) { eq += t.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { n, win: (w.length / n) * 100, avg: eq / n, gross: ts.reduce((a, t) => a + t.gross, 0) / n, pf: gl > 0 ? gp / gl : Infinity, total: eq, dd };
}
const fmt = (s: ReturnType<typeof stats>) =>
  `${String(s.n).padStart(4)} ops | acerto ${s.win.toFixed(0).padStart(3)}% | líquido ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}R | bruto ${s.gross >= 0 ? "+" : ""}${s.gross.toFixed(2)}R | FL ${s.pf === Infinity ? "∞" : s.pf.toFixed(2)} | total ${s.total >= 0 ? "+" : ""}${s.total.toFixed(0)}R | queda ${s.dd.toFixed(0)}R`;

async function main() {
  const data: Record<string, K[]> = {};
  for (const s of SYMBOLS) { data[s] = await load(s); process.stderr.write(`${s}: ${data[s].length} velas\n`); }

  const tAll = SYMBOLS.map((s) => data[s]);
  const t0 = Math.max(...tAll.map((k) => k[0].time));
  const t1 = Math.min(...tAll.map((k) => k[k.length - 1].time));
  const split = t0 + (t1 - t0) * 0.6;

  const results: Record<string, Trade[]> = Object.fromEntries(VARIANTS.map((v) => [v.name, []]));
  const placebo: Trade[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const busy: Record<string, number> = {};

  for (const symbol of SYMBOLS) {
    const k = data[symbol];
    let pBusy = -1;
    VARIANTS.forEach((v) => (busy[symbol + v.name] = -1));
    for (let i = WARMUP; i < k.length - 200; i++) {
      if (k[i].time < t0 || k[i].time > t1) continue;
      const snap = snapshotAt(k, i, symbol);
      const plan = planEntry(snap);

      if (plan.side !== "WAIT") {
        const ind = computeIndicators(snap.candles)!;
        const trend = htfTrend(k, i);
        for (const v of VARIANTS) {
          const key = symbol + v.name;
          if (i <= busy[key]) continue;
          if (v.longOnly && plan.side !== "BUY") continue;
          if (v.limitOnly && plan.orderType !== "LIMIT") continue;
          if (v.htf && !((plan.side === "BUY" && trend === "up") || (plan.side === "SELL" && trend === "down"))) continue;
          if (v.costAware && (Math.abs(plan.entry - plan.stopLoss) / plan.entry) * 100 < 1.2) continue;
          if (v.strength && Math.abs(ind.ema20 - ind.ema50) < 1.5 * ind.atr) continue;
          const res = simulate(k, i, plan, v.exit);
          if (res) {
            results[v.name].push({ symbol, r: res.r, gross: res.gross, time: k[i].time, side: plan.side });
            busy[key] = res.end;
          }
        }
      }

      // Placebo: lado aleatório, stop/alvos com a mesma geometria do plano atual
      if (i > pBusy && rnd() < 0.006) {
        const risk = plan.side !== "WAIT" ? Math.abs(plan.entry - plan.stopLoss) : snap.price * 0.011;
        const side = rnd() < 0.5 ? "BUY" : "SELL";
        const d = side === "BUY" ? 1 : -1;
        const fake: TradeEntry = { ...plan, side, orderType: "MARKET", entry: snap.price, stopLoss: snap.price - d * risk, takeProfit: snap.price + d * 1.75 * risk, takeProfit2: snap.price + d * 3 * risk, trailingDistance: 1.2 * risk };
        const res = simulate(k, i, fake, "base");
        if (res) { placebo.push({ symbol, r: res.r, gross: res.gross, time: k[i].time, side }); pBusy = res.end; }
      }
    }
  }

  const train = (ts: Trade[]) => ts.filter((t) => t.time < split);
  const test = (ts: Trade[]) => ts.filter((t) => t.time >= split);

  const days = (t1 - t0) / 86_400_000;
  console.log(`\n=== Validação fora da amostra — ${SYMBOLS.length} pares, ${days.toFixed(0)} dias; treino 60% / teste 40% (corte em ${new Date(split).toISOString().slice(0, 10)}) ===`);
  console.log(`Custo ${(COST_PER_SIDE * 100).toFixed(2)}% por lado. ${VARIANTS.length} variações testadas (escolha só pelo treino).\n`);
  console.log("TREINO (usado para escolher):");
  for (const v of VARIANTS) console.log(" ", v.name.padEnd(50), fmt(stats(train(results[v.name]))));
  console.log("  " + "placebo".padEnd(50), fmt(stats(train(placebo))));

  const eligible = VARIANTS.map((v) => ({ v, s: stats(train(results[v.name])) })).filter((x) => x.s.n >= 60 && x.s.pf > 1.05).sort((a, b) => b.s.avg - a.s.avg);
  console.log("\nRegra de escolha: >= 60 ops e fator de lucro > 1,05 no treino; vence a maior média líquida.");
  if (!eligible.length) {
    console.log("RESULTADO: nenhuma variação passou no critério no treino. Não há candidata a validar.");
  } else {
    const best = eligible[0].v;
    console.log(`ESCOLHIDA: ${best.name}\n`);
    console.log("TESTE (fora da amostra, avaliado uma vez):");
    console.log(" ", "escolhida".padEnd(50), fmt(stats(test(results[best.name]))));
    console.log(" ", "plano atual".padEnd(50), fmt(stats(test(results[VARIANTS[0].name]))));
    console.log(" ", "placebo".padEnd(50), fmt(stats(test(placebo))));
  }
  // Mercado no período de teste (comprar e segurar)
  const bh = SYMBOLS.map((s) => { const k = data[s].filter((c) => c.time >= split && c.time <= t1); return ((k[k.length - 1].close - k[0].open) / k[0].open) * 100; });
  console.log(`\nMercado no teste (comprar e segurar): ${SYMBOLS.map((s, i) => `${s.replace("USDT", "")} ${bh[i].toFixed(0)}%`).join(", ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
