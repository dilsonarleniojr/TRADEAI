// Backtest do plano de entradas/saídas (src/lib/ai-entries.ts) em candles históricos de 1 h da Binance.
// Uso: npx tsx scripts/backtest-entries.ts [dias=180]
// Regras: sem olhar o futuro; taxa 0,1% por lado + 0,05% de derrapagem; uma operação por par por vez;
// quando stop e alvo caem na mesma vela, assume o stop (conservador).
import { planEntry, type Candle, type MarketSnapshot, type TradeEntry } from "../src/lib/ai-entries";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT"];
const DAYS = Number(process.argv[2]) || 180;
const TF = Number(process.argv[3]) || 1; // agrega as velas de 1 h em velas de TF horas
const COST_PER_SIDE = process.argv[4] !== undefined ? Number(process.argv[4]) : 0.0015;
const WARMUP = 120;
// i±24 do 24h (snapshotAt) é aproximado em velas do timeframe escolhido
const LIMIT_WAIT = 12; // velas para uma ordem limite ser preenchida
const MAX_HOLD = 72; // velas até fechar a operação por tempo
const COST_PCT = COST_PER_SIDE * 2; // taxa + derrapagem nos dois lados (padrão: 0,15% por lado)

interface K extends Candle { open: number; time: number }

function aggregate(k: K[], tf: number): K[] {
  if (tf <= 1) return k;
  const out: K[] = [];
  for (let i = 0; i + tf <= k.length; i += tf) {
    const g = k.slice(i, i + tf);
    out.push({ time: g[0].time, open: g[0].open, high: Math.max(...g.map((c) => c.high)), low: Math.min(...g.map((c) => c.low)), close: g[g.length - 1].close, volume: g.reduce((a, c) => a + c.volume, 0) });
  }
  return out;
}

async function fetchKlines(symbol: string, days: number): Promise<K[]> {
  const out: K[] = [];
  let end = Date.now();
  const need = days * 24;
  while (out.length < need) {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=1000&endTime=${end}`);
    if (!res.ok) throw new Error(`${symbol}: ${res.status}`);
    const rows: any[] = await res.json();
    if (rows.length === 0) break;
    out.unshift(...rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] })));
    end = rows[0][0] - 1;
  }
  return out.slice(-need);
}

interface Trade { symbol: string; side: "BUY" | "SELL"; score: number; r: number; type: string; idx: number; gross: number; riskPct: number }

// Simula uma operação a partir da vela i. Retorna o resultado em múltiplos de R (já com custos) ou null se não preencheu.
function simulate(k: K[], i: number, plan: TradeEntry): { r: number; end: number; gross: number; riskPct: number } | null {
  const dir = plan.side === "BUY" ? 1 : -1;
  let fillIdx = i + 1;
  let entry = k[i + 1]?.open;
  if (entry === undefined) return null;

  if (plan.orderType === "LIMIT") {
    entry = plan.entry;
    let filled = -1;
    for (let j = i + 1; j <= Math.min(i + LIMIT_WAIT, k.length - 1); j++) {
      const hit = dir === 1 ? k[j].low <= entry : k[j].high >= entry;
      // cancela se o stop for tocado antes do preenchimento
      const stopFirst = dir === 1 ? k[j].low <= plan.stopLoss : k[j].high >= plan.stopLoss;
      if (stopFirst && !hit) return null;
      if (hit) { filled = j; break; }
    }
    if (filled < 0) return null;
    fillIdx = filled;
  } else {
    // entrada a mercado: a mercado na abertura da próxima vela; ajusta níveis pelo deslizamento do preço
    const shift = entry - plan.entry;
    plan = { ...plan, entry, stopLoss: plan.stopLoss + shift, takeProfit: plan.takeProfit + shift, takeProfit2: plan.takeProfit2 + shift };
  }

  const risk = Math.abs(entry - plan.stopLoss);
  if (!(risk > 0)) return null;
  let stop = plan.stopLoss;
  let remaining = 1;
  let realizedR = 0;
  let tp1Done = false;
  let peak = entry;

  const done = (end: number) => ({ r: realizedR - (COST_PCT * entry) / risk, end, gross: realizedR, riskPct: (risk / entry) * 100 });
  const close = (price: number, frac: number) => { realizedR += frac * (dir * (price - entry)) / risk; remaining -= frac; };

  for (let j = fillIdx; j < Math.min(fillIdx + MAX_HOLD, k.length); j++) {
    const c = k[j];
    const stopHit = dir === 1 ? c.low <= stop : c.high >= stop;
    if (stopHit) { close(stop, remaining); return done(j); }
    if (!tp1Done) {
      const tp1Hit = dir === 1 ? c.high >= plan.takeProfit : c.low <= plan.takeProfit;
      if (tp1Hit) { close(plan.takeProfit, 0.5); tp1Done = true; stop = entry; peak = dir === 1 ? c.high : c.low; }
    } else {
      const tp2Hit = dir === 1 ? c.high >= plan.takeProfit2 : c.low <= plan.takeProfit2;
      if (tp2Hit) { close(plan.takeProfit2, remaining); return done(j); }
      // stop móvel
      peak = dir === 1 ? Math.max(peak, c.high) : Math.min(peak, c.low);
      const trail = dir === 1 ? peak - plan.trailingDistance : peak + plan.trailingDistance;
      stop = dir === 1 ? Math.max(stop, trail) : Math.min(stop, trail);
    }
  }
  const last = Math.min(fillIdx + MAX_HOLD, k.length) - 1;
  close(k[last].close, remaining);
  return done(last);
}

function snapshotAt(k: K[], i: number): MarketSnapshot {
  const window = k.slice(i - WARMUP + 1, i + 1);
  const price = k[i].close;
  const last24 = k.slice(i - 23, i + 1);
  // vela "em formação" fictícia ao final: planEntry ignora a última vela
  const candles: Candle[] = [...window, { high: price, low: price, close: price, volume: 0 }];
  return {
    symbol: "X", price,
    changePct: ((price - k[i - 24].close) / k[i - 24].close) * 100,
    high24h: Math.max(...last24.map((c) => c.high)),
    low24h: Math.min(...last24.map((c) => c.low)),
    candles,
  };
}

function stats(ts: Trade[]) {
  const n = ts.length;
  if (!n) return { n: 0, win: 0, avgR: 0, pf: 0, totalR: 0, maxDD: 0 };
  const wins = ts.filter((t) => t.r > 0);
  const gross = wins.reduce((a, t) => a + t.r, 0);
  const loss = -ts.filter((t) => t.r <= 0).reduce((a, t) => a + t.r, 0);
  let eq = 0, peak = 0, dd = 0;
  for (const t of [...ts].sort((a, b) => a.idx - b.idx)) { eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return { n, win: (wins.length / n) * 100, avgR: ts.reduce((a, t) => a + t.r, 0) / n, pf: loss > 0 ? gross / loss : Infinity, totalR: eq, maxDD: dd };
}
const f = (s: ReturnType<typeof stats>) => `${String(s.n).padStart(4)} ops | acerto ${s.win.toFixed(0).padStart(3)}% | média ${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(2)}R | fator de lucro ${s.pf === Infinity ? "∞" : s.pf.toFixed(2)} | total ${s.totalR >= 0 ? "+" : ""}${s.totalR.toFixed(1)}R | queda máx. ${s.maxDD.toFixed(1)}R`;

async function main() {
  const all: Trade[] = [];
  const placebo: Trade[] = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (const symbol of SYMBOLS) {
    const k = aggregate(await fetchKlines(symbol, DAYS), TF);
    let busyUntil = -1;
    let busyUntilP = -1;
    for (let i = WARMUP + 24; i < k.length - MAX_HOLD - LIMIT_WAIT - 2; i++) {
      const snap = snapshotAt(k, i);
      snap.symbol = symbol;
      const plan = planEntry(snap);

      if (plan.side !== "WAIT" && i > busyUntil) {
        const res = simulate(k, i, plan);
        if (res) {
          all.push({ symbol, side: plan.side as "BUY" | "SELL", score: plan.score, r: res.r, type: plan.orderType, idx: k[i].time, gross: res.gross, riskPct: res.riskPct });
          busyUntil = res.end;
        }
      }

      // Placebo: mesma frequência, lado e níveis (em R) aleatórios com a mesma distância de stop
      if (i > busyUntilP && rnd() < 0.012) {
        const atrLike = Math.abs(plan.entry - plan.stopLoss) || snap.price * 0.01;
        const risk = plan.side !== "WAIT" ? atrLike : snap.price * 0.01;
        const side = rnd() < 0.5 ? "BUY" : "SELL";
        const dir = side === "BUY" ? 1 : -1;
        const fake: TradeEntry = { ...plan, side, orderType: "MARKET", entry: snap.price, stopLoss: snap.price - dir * risk, takeProfit: snap.price + dir * 1.75 * risk, takeProfit2: snap.price + dir * 3 * risk, trailingDistance: 2 * risk * 0.6 };
        const res = simulate(k, i, fake);
        if (res) { placebo.push({ symbol, side, score: 0, r: res.r, type: "MARKET", idx: k[i].time, gross: res.gross, riskPct: res.riskPct }); busyUntilP = res.end; }
      }
    }
    process.stderr.write(`${symbol}: ${k.length} velas\n`);
  }

  all.sort((a, b) => a.idx - b.idx);
  const half = all[Math.floor(all.length / 2)]?.idx ?? 0;
  console.log(`\n=== Backtest do plano de entradas — ${SYMBOLS.length} pares, ${DAYS} dias, velas de ${TF} h, custo ${(COST_PER_SIDE*100).toFixed(2)}% por lado ===`);
  const g = all.reduce((a, t) => a + t.gross, 0) / (all.length || 1);
  const rp = all.reduce((a, t) => a + t.riskPct, 0) / (all.length || 1);
  console.log(`Stop e alvo na mesma vela = stop. Distância média do stop: ${rp.toFixed(2)}% do preço. Resultado BRUTO (sem custos): ${g >= 0 ? "+" : ""}${g.toFixed(2)}R por operação.\n`);
  console.log("Plano (todas)      ", f(stats(all)));
  console.log("  só compras       ", f(stats(all.filter((t) => t.side === "BUY"))));
  console.log("  só vendas (short)", f(stats(all.filter((t) => t.side === "SELL"))));
  console.log("  a mercado        ", f(stats(all.filter((t) => t.type === "MARKET"))));
  console.log("  ordem limite     ", f(stats(all.filter((t) => t.type === "LIMIT"))));
  console.log("  nota >= 75       ", f(stats(all.filter((t) => t.score >= 75))));
  console.log("  nota < 65        ", f(stats(all.filter((t) => t.score < 65))));
  console.log("  1ª metade do tempo", f(stats(all.filter((t) => t.idx < half))));
  console.log("  2ª metade do tempo", f(stats(all.filter((t) => t.idx >= half))));
  console.log("\nPor par:");
  for (const s of SYMBOLS) console.log(" ", s.padEnd(9), f(stats(all.filter((t) => t.symbol === s))));
  console.log("\nComparação (entradas aleatórias, mesmos stops/alvos):");
  console.log("Placebo            ", f(stats(placebo)));
}
main().catch((e) => { console.error(e); process.exit(1); });
