/**
 * TWAP (Time-Weighted Average Price) and VWAP (Volume-Weighted Average Price) Engines
 * TWAP: Fatia a ordem em N partes com intervalos randomizados ±20%
 * VWAP: Pausa se volume de mercado < 80% da média dos últimos 5 candles
 */
import type { ExecutionProgress } from "@/lib/store/tradeSlice";

export interface SliceOrder {
  symbol: string;
  side: "BUY" | "SELL";
  totalVolume: number;
  totalSlices: number;
  intervalMs: number;
  shadowMode: boolean;
}

export interface SliceResult {
  sliceIndex: number;
  volume: number;
  price: number;
  timestamp: number;
  executed: boolean;
  reason?: string;
}

export class TWAPEngine {
  private abortController: AbortController | null = null;

  async execute(
    order: SliceOrder,
    getPrice: () => number,
    onSlice: (result: SliceResult, progress: ExecutionProgress) => void,
    onComplete: (results: SliceResult[]) => void
  ): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const sliceVolume = order.totalVolume / order.totalSlices;
    const results: SliceResult[] = [];

    for (let i = 0; i < order.totalSlices; i++) {
      if (signal.aborted) break;
      const jitter = order.intervalMs * 0.2;
      const interval = order.intervalMs + (Math.random() * jitter * 2 - jitter);
      try {
        await Promise.race([
          new Promise<void>((r) => setTimeout(r, interval)),
          new Promise<void>((_, rj) => signal.addEventListener("abort", () => rj())),
        ]);
      } catch { break; }
      if (signal.aborted) break;
      const result: SliceResult = {
        sliceIndex: i + 1,
        volume: sliceVolume,
        price: getPrice(),
        timestamp: Date.now(),
        executed: !order.shadowMode,
        reason: order.shadowMode ? "Shadow mode" : undefined,
      };
      results.push(result);
      onSlice(result, {
        slicesDone: i + 1,
        totalSlices: order.totalSlices,
        executedVolume: (i + 1) * sliceVolume,
        remainingVolume: (order.totalSlices - i - 1) * sliceVolume,
        estimatedMinutesLeft: Math.round(((order.totalSlices - i - 1) * order.intervalMs) / 60000),
      });
    }
    onComplete(results);
  }

  abort(): void { this.abortController?.abort(); }
}

export class VWAPEngine {
  private abortController: AbortController | null = null;

  async execute(
    order: SliceOrder,
    getPrice: () => number,
    getVolume: () => number,
    getAvgVolume: () => number,
    onSlice: (result: SliceResult, progress: ExecutionProgress) => void,
    onComplete: (results: SliceResult[]) => void
  ): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const sliceVolume = order.totalVolume / order.totalSlices;
    const results: SliceResult[] = [];
    let done = 0;

    while (done < order.totalSlices && !signal.aborted) {
      try {
        await Promise.race([
          new Promise<void>((r) => setTimeout(r, 5000)),
          new Promise<void>((_, rj) => signal.addEventListener("abort", () => rj())),
        ]);
      } catch { break; }
      if (signal.aborted) break;
      const curVol = getVolume();
      const avgVol = getAvgVolume();
      const ok = curVol >= avgVol * 0.8;
      const result: SliceResult = {
        sliceIndex: done + 1,
        volume: sliceVolume,
        price: getPrice(),
        timestamp: Date.now(),
        executed: ok && !order.shadowMode,
        reason: !ok ? `Vol insuf. (${curVol.toFixed(2)} < ${(avgVol * 0.8).toFixed(2)})` : undefined,
      };
      if (ok) {
        done++;
        results.push(result);
        onSlice(result, { slicesDone: done, totalSlices: order.totalSlices, executedVolume: done * sliceVolume, remainingVolume: (order.totalSlices - done) * sliceVolume, estimatedMinutesLeft: 0 });
      }
    }
    onComplete(results);
  }

  abort(): void { this.abortController?.abort(); }
}
