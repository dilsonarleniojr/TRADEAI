"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { Grid3X3, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const MINI_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const MINI_NAMES = ["BTC", "ETH", "SOL"];

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);
  const xMean = xSlice.reduce((s, v) => s + v, 0) / n;
  const yMean = ySlice.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - xMean;
    const dy = ySlice[i] - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function correlationToColor(r: number): string {
  const clamped = Math.max(-1, Math.min(1, r));
  if (clamped >= 0) {
    const t = clamped;
    const red = Math.round(128 * (1 - t));
    const green = Math.round(128 + 127 * t);
    const blue = Math.round(128 * (1 - t));
    return `rgb(${red}, ${green}, ${blue})`;
  } else {
    const t = -clamped;
    const red = Math.round(128 + 127 * t);
    const green = Math.round(128 * (1 - t));
    const blue = Math.round(128 * (1 - t));
    return `rgb(${red}, ${green}, ${blue})`;
  }
}

export function MiniHeatmap() {
  const [open, setOpen] = useState(false);
  const [klineData, setKlineData] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchKlines = useCallback(async () => {
    setLoading(true);
    try {
      const results: Record<string, number[]> = {};
      await Promise.all(
        MINI_SYMBOLS.map(async (symbol) => {
          try {
            const resp = await fetch(
              `/api/market/klines?symbol=${symbol}&interval=1h&limit=24`
            );
            if (!resp.ok) return;
            const result = await resp.json();
            if (result.data) {
              const closes = result.data.map(
                (k: { close: string }) => parseFloat(k.close)
              );
              results[symbol] = closes;
            }
          } catch (err) {
            console.error(`[MiniHeatmap] Error fetching ${symbol}:`, err);
          }
        })
      );
      setKlineData(results);
    } catch (err) {
      console.error("[MiniHeatmap] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKlines();
    const interval = setInterval(fetchKlines, 180000); // 3 mins
    return () => clearInterval(interval);
  }, [fetchKlines]);

  const matrix = useMemo(() => {
    const mat: number[][] = [];
    for (let i = 0; i < MINI_SYMBOLS.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < MINI_SYMBOLS.length; j++) {
        if (i === j) {
          row.push(1);
        } else {
          const x = klineData[MINI_SYMBOLS[i]] || [];
          const y = klineData[MINI_SYMBOLS[j]] || [];
          row.push(pearsonCorrelation(x, y));
        }
      }
      mat.push(row);
    }
    return mat;
  }, [klineData]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer block md:hidden"
        >
          <Card className="glass-card gradient-border h-[120px] relative overflow-hidden flex flex-col justify-between p-3.5 hover:bg-secondary/10 transition-colors">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Grid3X3 className="w-3.5 h-3.5 text-crypto-gold" />
                Correlação (Heatmap)
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-60" />
            </div>

            {/* Matrix & Info Preview */}
            <div className="flex items-center justify-between mt-1 gap-2">
              {loading ? (
                <div className="w-[66px] h-[66px] grid grid-cols-3 gap-0.5 animate-pulse bg-secondary/20 rounded" />
              ) : (
                <div className="grid grid-cols-3 gap-0.5 w-[66px] h-[66px]">
                  {matrix.map((row, i) =>
                    row.map((val, j) => {
                      const isDiagonal = i === j;
                      const bgColor = isDiagonal
                        ? "oklch(0.75 0.15 195 / 30%)"
                        : correlationToColor(val);
                      return (
                        <div
                          key={`cell-${i}-${j}`}
                          className="w-5 h-5 rounded-[2px]"
                          style={{ backgroundColor: bgColor }}
                          title={`${MINI_NAMES[i]} / ${MINI_NAMES[j]}: ${val.toFixed(2)}`}
                        />
                      );
                    })
                  )}
                </div>
              )}

              <div className="flex-1 text-right">
                <p className="text-[9px] text-muted-foreground">Correlação Média</p>
                <h4 className="text-sm font-bold font-mono text-foreground mt-0.5">
                  {loading ? "—" : `${(matrix[0]?.[1] ?? 0).toFixed(2)}`}
                </h4>
                <p className="text-[8px] text-muted-foreground mt-1">BTC-ETH 24h</p>
              </div>
            </div>

            {/* Bottom status */}
            <div className="text-[9px] text-muted-foreground border-t border-border/30 pt-1.5 flex justify-between items-center">
              <span>Grid Completo (10 Ativos)</span>
              <span className="text-crypto-gold font-semibold text-[8px] uppercase tracking-wider">Ver Tudo</span>
            </div>
          </Card>
        </motion.div>
      </DrawerTrigger>

      <DrawerContent className="bg-background/95 backdrop-blur-xl border-t border-border/50 max-h-[85vh] z-[100] pb-6">
        <div className="w-12 h-1 rounded-full bg-border mx-auto mt-3 mb-2" />
        <div className="px-4 overflow-y-auto cyan-scrollbar">
          <CorrelationHeatmap />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
