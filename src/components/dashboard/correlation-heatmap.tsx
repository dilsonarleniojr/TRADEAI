"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Grid3X3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CRYPTO_SHORTS } from "@/lib/crypto-meta";

interface KlineRaw {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

// Pearson correlation coefficient
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
  if (den === 0) return 0;
  return num / den;
}

// Map correlation value to color
function correlationToColor(r: number): string {
  // r is between -1 and 1
  // -1 → bright red, 0 → neutral gray, +1 → bright green
  const clamped = Math.max(-1, Math.min(1, r));

  if (clamped >= 0) {
    // Gray to green
    const t = clamped;
    const red = Math.round(128 * (1 - t));
    const green = Math.round(128 + 127 * t);
    const blue = Math.round(128 * (1 - t));
    return `rgb(${red}, ${green}, ${blue})`;
  } else {
    // Gray to red
    const t = -clamped;
    const red = Math.round(128 + 127 * t);
    const green = Math.round(128 * (1 - t));
    const blue = Math.round(128 * (1 - t));
    return `rgb(${red}, ${green}, ${blue})`;
  }
}

function correlationToTextColor(r: number): string {
  // Use white text for dark cells, dark text for light cells
  const absR = Math.abs(r);
  if (absR > 0.5) return "rgba(255,255,255,0.95)";
  return "rgba(255,255,255,0.8)";
}

const SYMBOLS_TO_COMPARE = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "DOTUSDT",
  "LINKUSDT",
];

export function CorrelationHeatmap() {
  const { tickers } = useCryptoStore();
  const [klineData, setKlineData] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const cacheRef = useRef<Record<string, number[]>>({});

  const fetchKlines = useCallback(async () => {
    setLoading(true);
    try {
      const results: Record<string, number[]> = {};
      const batchSize = 4;
      for (let i = 0; i < SYMBOLS_TO_COMPARE.length; i += batchSize) {
        const batch = SYMBOLS_TO_COMPARE.slice(i, i + batchSize);
        const promises = batch.map(async (symbol) => {
          // Check cache first
          if (cacheRef.current[symbol] && cacheRef.current[symbol].length >= 24) {
            results[symbol] = cacheRef.current[symbol];
            return;
          }
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
              cacheRef.current[symbol] = closes;
            }
          } catch {
            // Skip on error
          }
        });
        await Promise.all(promises);
      }
      setKlineData(results);
    } catch (err) {
      console.error("[CorrelationHeatmap] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    cacheRef.current = {};
    await fetchKlines();
    setRefreshing(false);
  }, [fetchKlines]);

  useEffect(() => {
    fetchKlines();
    const interval = setInterval(fetchKlines, 180000); // Refresh every 3 min
    return () => clearInterval(interval);
  }, [fetchKlines]);

  // Available symbols (those with data)
  const availableSymbols = useMemo(
    () => SYMBOLS_TO_COMPARE.filter((s) => klineData[s] && klineData[s].length >= 10),
    [klineData]
  );

  // Calculate correlation matrix
  const correlationMatrix = useMemo(() => {
    const matrix: number[][] = [];
    for (let i = 0; i < availableSymbols.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < availableSymbols.length; j++) {
        if (i === j) {
          row.push(1);
        } else {
          const corr = pearsonCorrelation(
            klineData[availableSymbols[i]] || [],
            klineData[availableSymbols[j]] || []
          );
          row.push(Math.round(corr * 100) / 100);
        }
      }
      matrix.push(row);
    }
    return matrix;
  }, [availableSymbols, klineData]);

  const cellSize = 40;
  const labelWidth = 52;
  const headerHeight = 28;
  const totalWidth = labelWidth + availableSymbols.length * cellSize;
  const totalHeight = headerHeight + availableSymbols.length * cellSize;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md card-accent-gold overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-crypto-gold" />
              Mapa de Correlação de Preço
              <span className="text-[10px] text-muted-foreground font-normal">
                (24h)
              </span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton-shimmer h-8 w-full rounded" />
              <div className="skeleton-shimmer h-[300px] w-full rounded" />
            </div>
          ) : availableSymbols.length < 2 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <Grid3X3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p>Dados insuficientes para análise de correlação</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Aguardando dados de mercado...
              </p>
            </div>
          ) : (
            <>
              {/* Heatmap Grid */}
              <div className="overflow-x-auto mobile-scroll-x">
                <svg
                  width={totalWidth}
                  height={totalHeight}
                  className="select-none"
                >
                  {/* Column headers */}
                  {availableSymbols.map((symbol, j) => (
                    <text
                      key={`col-${symbol}`}
                      x={labelWidth + j * cellSize + cellSize / 2}
                      y={headerHeight - 6}
                      textAnchor="middle"
                      fill="oklch(0.65 0 0)"
                      fontSize={9}
                      fontFamily="monospace"
                      fontWeight={600}
                    >
                      {CRYPTO_SHORTS[symbol] || symbol.replace("USDT", "")}
                    </text>
                  ))}

                  {/* Rows */}
                  {availableSymbols.map((rowSymbol, i) => (
                    <g key={`row-${rowSymbol}`}>
                      {/* Row label */}
                      <text
                        x={labelWidth - 6}
                        y={headerHeight + i * cellSize + cellSize / 2 + 3}
                        textAnchor="end"
                        fill="oklch(0.65 0 0)"
                        fontSize={9}
                        fontFamily="monospace"
                        fontWeight={600}
                      >
                        {CRYPTO_SHORTS[rowSymbol] || rowSymbol.replace("USDT", "")}
                      </text>

                      {/* Cells */}
                      {availableSymbols.map((colSymbol, j) => {
                        const value = correlationMatrix[i]?.[j] ?? 0;
                        const isDiagonal = i === j;
                        const bgColor = isDiagonal
                          ? "oklch(0.75 0.15 195 / 30%)"
                          : correlationToColor(value);
                        const textColor = isDiagonal
                          ? "oklch(0.75 0.15 195)"
                          : correlationToTextColor(value);

                        return (
                          <g key={`cell-${rowSymbol}-${colSymbol}`}>
                            <rect
                              x={labelWidth + j * cellSize + 1}
                              y={headerHeight + i * cellSize + 1}
                              width={cellSize - 2}
                              height={cellSize - 2}
                              fill={bgColor}
                              rx={3}
                              opacity={isDiagonal ? 1 : 0.85}
                            />
                            <text
                              x={
                                labelWidth +
                                j * cellSize +
                                cellSize / 2
                              }
                              y={
                                headerHeight +
                                i * cellSize +
                                cellSize / 2 +
                                3
                              }
                              textAnchor="middle"
                              fill={textColor}
                              fontSize={9}
                              fontFamily="monospace"
                              fontWeight={500}
                            >
                              {isDiagonal ? "—" : value.toFixed(2)}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  ))}
                </svg>
              </div>

              {/* Color Legend */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="text-[10px] text-muted-foreground font-medium">
                  -1.0
                </span>
                <div className="flex h-3 w-48 rounded-full overflow-hidden">
                  {Array.from({ length: 20 }, (_, i) => {
                    const r = -1 + (i * 2) / 19;
                    return (
                      <div
                        key={i}
                        className="flex-1"
                        style={{
                          backgroundColor: correlationToColor(r),
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  +1.0
                </span>
              </div>
              <div className="flex items-center justify-center gap-6 mt-1.5">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: correlationToColor(-1) }}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Negativa
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: correlationToColor(0) }}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Nenhuma
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: correlationToColor(1) }}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    Positiva
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
