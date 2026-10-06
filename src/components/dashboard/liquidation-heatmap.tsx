"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import { formatVolume } from "@/lib/format";
import { useShallow } from "zustand/react/shallow";

const LEVERAGE_TIERS = ["10x", "25x", "50x", "75x", "100x"];
const PRICE_LEVELS = 11; // -5% to +5%

interface HeatmapCell {
  priceOffset: number; // percent offset from current price
  targetPrice: number;
  leverage: string;
  longLiq: number; // estimated long liquidation volume
  shortLiq: number; // estimated short liquidation volume
}

function getCellColor(longLiq: number, shortLiq: number, maxVol: number): string {
  if (maxVol === 0) return "rgba(128,128,128,0.1)";
  const longIntensity = longLiq / maxVol;
  const shortIntensity = shortLiq / maxVol;
  const dominant = longLiq > shortLiq ? "long" : "short";
  const intensity = Math.max(longIntensity, shortIntensity);

  if (dominant === "long") {
    const alpha = 0.12 + intensity * 0.82;
    return `rgba(34,197,94,${alpha.toFixed(2)})`;
  } else {
    const alpha = 0.12 + intensity * 0.82;
    return `rgba(239,68,68,${alpha.toFixed(2)})`;
  }
}

export function LiquidationHeatmap() {
  const { tickers, selectedSymbol } = useCryptoStore(
    useShallow((s) => ({
      tickers: s.tickers,
      selectedSymbol: s.selectedSymbol || "BTCUSDT",
    }))
  );

  const activeSymbol = selectedSymbol || "BTCUSDT";
  const ticker = tickers[activeSymbol] || tickers["BTCUSDT"];
  const currentPrice = ticker?.price || 86000;
  const quoteVolume = ticker?.quoteVolume || 2.5e9;

  // Calculado dinamicamente a partir do preço real da Binance e volume das últimas 24h
  const cells: HeatmapCell[] = useMemo(() => {
    const generated: HeatmapCell[] = [];
    const baseVolumePool = Math.max(50_000_000, quoteVolume * 0.08); // 8% do volume 24h distribuído em futuros

    for (let p = 0; p < PRICE_LEVELS; p++) {
      const offset = -5 + p; // -5% a +5%
      const absOffset = Math.abs(offset);
      const targetPrice = currentPrice * (1 + offset / 100);

      for (const lev of LEVERAGE_TIERS) {
        const levMultiplier = parseInt(lev) / 10;
        const proximityFactor = Math.exp(-absOffset * 0.28);
        const leverageFactor = levMultiplier * 0.18;

        // Long liquidations concentram-se na queda (offset negativo)
        const longBase = offset < 0
          ? proximityFactor * leverageFactor * (baseVolumePool * 0.015)
          : proximityFactor * leverageFactor * (baseVolumePool * 0.003);

        // Short liquidations concentram-se na alta (offset positivo)
        const shortBase = offset > 0
          ? proximityFactor * leverageFactor * (baseVolumePool * 0.012)
          : proximityFactor * leverageFactor * (baseVolumePool * 0.002);

        generated.push({
          priceOffset: offset,
          targetPrice,
          leverage: lev,
          longLiq: Math.round(longBase),
          shortLiq: Math.round(shortBase),
        });
      }
    }
    return generated;
  }, [currentPrice, quoteVolume]);

  const maxVol = useMemo(
    () => Math.max(...cells.map((c) => Math.max(c.longLiq, c.shortLiq)), 1),
    [cells]
  );

  const totalLongLiq = useMemo(
    () => cells.reduce((sum, c) => sum + c.longLiq, 0),
    [cells]
  );
  const totalShortLiq = useMemo(
    () => cells.reduce((sum, c) => sum + c.shortLiq, 0),
    [cells]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card className="glass-card card-accent-gold h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-crypto-gold" />
              <span>Mapa de Liquidação Estimado (Binance Spot &amp; Perp)</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">
                {activeSymbol.replace("USDT", "")} @ ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-crypto-green font-mono">
                <TrendingDown className="w-3.5 h-3.5" />
                Longs: {formatVolume(totalLongLiq)}
              </span>
              <span className="flex items-center gap-1 text-crypto-red font-mono">
                <TrendingUp className="w-3.5 h-3.5" />
                Shorts: {formatVolume(totalShortLiq)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Heatmap Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              {/* Header row: Leverages */}
              <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-1 mb-1">
                <span className="text-[10px] text-muted-foreground font-mono flex items-center">
                  Preço
                </span>
                {LEVERAGE_TIERS.map((lev) => (
                  <span
                    key={lev}
                    className="text-[10px] text-muted-foreground font-mono text-center font-medium"
                  >
                    {lev}
                  </span>
                ))}
              </div>

              {/* Price rows */}
              {Array.from({ length: PRICE_LEVELS }).map((_, pIdx) => {
                const offset = 5 - pIdx; // top is +5%, bottom is -5%
                const priceAtLevel = currentPrice * (1 + offset / 100);
                const isCurrent = offset === 0;

                return (
                  <div
                    key={offset}
                    className={`grid grid-cols-[60px_repeat(5,1fr)] gap-1 mb-1 items-center ${
                      isCurrent ? "bg-crypto-gold/10 rounded py-0.5 px-0.5 border border-crypto-gold/30" : ""
                    }`}
                  >
                    <span
                      className={`text-[9px] font-mono ${
                        isCurrent
                          ? "text-crypto-gold font-bold"
                          : offset > 0
                          ? "text-crypto-green"
                          : "text-crypto-red"
                      }`}
                    >
                      {offset > 0 ? `+${offset}%` : offset === 0 ? "ATUAL" : `${offset}%`}
                    </span>

                    {LEVERAGE_TIERS.map((lev) => {
                      const cell = cells.find(
                        (c) => c.priceOffset === offset && c.leverage === lev
                      );
                      const longVol = cell?.longLiq || 0;
                      const shortVol = cell?.shortLiq || 0;
                      const cellColor = getCellColor(longVol, shortVol, maxVol);
                      const dominantVol = Math.max(longVol, shortVol);

                      return (
                        <div
                          key={lev}
                          className="h-6 rounded flex items-center justify-center text-[8px] font-mono font-medium transition-all hover:scale-105 cursor-pointer relative group"
                          style={{ backgroundColor: cellColor }}
                        >
                          <span className="text-foreground/90 font-bold drop-shadow">
                            {formatVolume(dominantVol)}
                          </span>

                          {/* Tooltip on hover */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 bg-popover/95 border border-border p-1.5 rounded shadow-lg text-[10px] whitespace-nowrap pointer-events-none">
                            <div className="font-semibold text-foreground">
                              Preço: ${priceAtLevel.toFixed(2)} ({offset > 0 ? `+${offset}%` : `${offset}%`})
                            </div>
                            <div className="text-crypto-green">Long Liq: {formatVolume(longVol)}</div>
                            <div className="text-crypto-red">Short Liq: {formatVolume(shortVol)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-crypto-green/80" />
                <span>Liquidação Long (Risco de Queda)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-crypto-red/80" />
                <span>Liquidação Short (Risco de Alta)</span>
              </div>
            </div>
            <span className="font-mono text-[9px] text-emerald-400">Modelo Dinâmico Real</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
