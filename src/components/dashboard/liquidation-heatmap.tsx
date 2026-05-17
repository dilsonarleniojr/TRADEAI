"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import { formatVolume } from "@/lib/format";

// Seeded random
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const CURRENT_BTC_PRICE = 78301;
const LEVERAGE_TIERS = ["10x", "25x", "50x", "75x", "100x"];
const PRICE_LEVELS = 11; // -5% to +5%

interface HeatmapCell {
  priceOffset: number; // percent offset from current price
  leverage: string;
  longLiq: number; // estimated long liquidation volume
  shortLiq: number; // estimated short liquidation volume
}

function generateHeatmapData(seed: number): HeatmapCell[] {
  const rng = seededRandom(seed);
  const cells: HeatmapCell[] = [];

  for (let p = 0; p < PRICE_LEVELS; p++) {
    const offset = -5 + p; // -5 to +5
    const absOffset = Math.abs(offset);

    for (const lev of LEVERAGE_TIERS) {
      const levMultiplier = parseInt(lev) / 10;
      // Liquidation volume peaks near current price and at high leverage
      const proximityFactor = Math.exp(-absOffset * 0.3);
      const leverageFactor = levMultiplier * 0.15;

      // Long liquidations happen when price drops (negative offset)
      const longBase = offset < 0 ? proximityFactor * leverageFactor * (50 + rng() * 30) : proximityFactor * leverageFactor * (5 + rng() * 10);
      // Short liquidations happen when price rises (positive offset)
      const shortBase = offset > 0 ? proximityFactor * leverageFactor * (40 + rng() * 25) : proximityFactor * leverageFactor * (3 + rng() * 8);

      cells.push({
        priceOffset: offset,
        leverage: lev,
        longLiq: Math.round(longBase * 1e6),
        shortLiq: Math.round(shortBase * 1e6),
      });
    }
  }

  return cells;
}

function getCellColor(longLiq: number, shortLiq: number, maxVol: number): string {
  if (maxVol === 0) return "rgba(128,128,128,0.1)";
  const longIntensity = longLiq / maxVol;
  const shortIntensity = shortLiq / maxVol;
  const dominant = longLiq > shortLiq ? "long" : "short";
  const intensity = Math.max(longIntensity, shortIntensity);

  if (dominant === "long") {
    // Green for long liquidations
    const alpha = 0.1 + intensity * 0.8;
    return `rgba(34,197,94,${alpha.toFixed(2)})`;
  } else {
    // Red for short liquidations
    const alpha = 0.1 + intensity * 0.8;
    return `rgba(239,68,68,${alpha.toFixed(2)})`;
  }
}

export function LiquidationHeatmap() {
  const cells = useMemo(() => generateHeatmapData(77), []);
  const maxVol = useMemo(
    () => Math.max(...cells.map((c) => Math.max(c.longLiq, c.shortLiq))),
    [cells]
  );

  // Chart dimensions
  const cellW = 64;
  const cellH = 32;
  const labelLeft = 62;
  const headerH = 28;
  const totalW = labelLeft + LEVERAGE_TIERS.length * cellW;
  const totalH = headerH + PRICE_LEVELS * cellH;

  const longLiqTotal = 156e6; // $156M simulated
  const shortLiqTotal = 89e6; // $89M simulated

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <Card className="glass-card card-accent-red overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-crypto-red" />
              Liquidation Heatmap
              <span className="text-[10px] text-muted-foreground font-normal">
                (BTC Estimated Levels)
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* Heatmap Grid */}
          <div className="overflow-x-auto mobile-scroll-x">
            <svg width={totalW} height={totalH} className="select-none">
              {/* Column headers - Leverage tiers */}
              {LEVERAGE_TIERS.map((lev, j) => (
                <text
                  key={`lev-${lev}`}
                  x={labelLeft + j * cellW + cellW / 2}
                  y={headerH - 6}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight={600}
                >
                  {lev}
                </text>
              ))}

              {/* Rows - Price levels */}
              {Array.from({ length: PRICE_LEVELS }, (_, p) => {
                const offset = -5 + p;
                const price = CURRENT_BTC_PRICE * (1 + offset / 100);
                const isCenter = offset === 0;

                return (
                  <g key={`row-${p}`}>
                    {/* Row label */}
                    <text
                      x={labelLeft - 6}
                      y={headerH + p * cellH + cellH / 2 + 3}
                      textAnchor="end"
                      fill={isCenter ? "var(--crypto-cyan)" : "var(--muted-foreground)"}
                      fontSize={isCenter ? 9 : 8}
                      fontFamily="monospace"
                      fontWeight={isCenter ? 700 : 500}
                    >
                      {offset >= 0 ? "+" : ""}{offset}%
                    </text>

                    {/* Current price line */}
                    {isCenter && (
                      <line
                        x1={labelLeft - 2}
                        y1={headerH + p * cellH + cellH / 2}
                        x2={totalW}
                        y2={headerH + p * cellH + cellH / 2}
                        stroke="var(--crypto-cyan)"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        opacity={0.6}
                      />
                    )}

                    {/* Cells */}
                    {LEVERAGE_TIERS.map((lev, j) => {
                      const cell = cells.find(
                        (c) => c.priceOffset === offset && c.leverage === lev
                      );
                      if (!cell) return null;

                      const bgColor = getCellColor(cell.longLiq, cell.shortLiq, maxVol);
                      const dominant = cell.longLiq > cell.shortLiq;

                      return (
                        <g key={`cell-${p}-${j}`}>
                          <rect
                            x={labelLeft + j * cellW + 1}
                            y={headerH + p * cellH + 1}
                            width={cellW - 2}
                            height={cellH - 2}
                            fill={bgColor}
                            rx={3}
                          />
                          {/* Volume label inside cell */}
                          <text
                            x={labelLeft + j * cellW + cellW / 2}
                            y={headerH + p * cellH + cellH / 2 + 3}
                            textAnchor="middle"
                            fill={isCenter ? "var(--crypto-cyan)" : "rgba(255,255,255,0.7)"}
                            fontSize={7}
                            fontFamily="monospace"
                            fontWeight={500}
                          >
                            {formatVolume(Math.max(cell.longLiq, cell.shortLiq))}
                          </text>
                          {/* Direction indicator */}
                          <text
                            x={labelLeft + j * cellW + cellW - 5}
                            y={headerH + p * cellH + 8}
                            textAnchor="end"
                            fill={dominant ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"}
                            fontSize={6}
                            fontFamily="monospace"
                          >
                            {dominant ? "L" : "S"}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Current price label on right */}
              <text
                x={totalW - 4}
                y={headerH + 5 * cellH + cellH / 2 + 3}
                textAnchor="end"
                fill="var(--crypto-cyan)"
                fontSize={7}
                fontFamily="monospace"
                fontWeight={700}
              >
                ${CURRENT_BTC_PRICE.toLocaleString()}
              </text>
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium">Low</span>
              <div className="flex h-3 w-32 rounded-full overflow-hidden">
                {Array.from({ length: 16 }, (_, i) => {
                  const t = i / 15;
                  if (t < 0.5) {
                    return <div key={i} className="flex-1" style={{ backgroundColor: `rgba(34,197,94,${(0.1 + t * 1.2).toFixed(2)})` }} />;
                  }
                  return <div key={i} className="flex-1" style={{ backgroundColor: `rgba(239,68,68,${(0.1 + (t - 0.5) * 1.6).toFixed(2)})` }} />;
                })}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">High</span>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-crypto-green/60" />
                <span className="text-[9px] text-muted-foreground">Long Liq</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-crypto-red/60" />
                <span className="text-[9px] text-muted-foreground">Short Liq</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 border-t border-dashed border-crypto-cyan" />
                <span className="text-[9px] text-muted-foreground">Current Price</span>
              </div>
            </div>
          </div>

          {/* Liquidation Summary */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 rounded-lg bg-crypto-green/5 border border-crypto-green/10">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-crypto-green" />
                <span className="text-xs text-muted-foreground">Est. Long Liquidations (24h)</span>
              </div>
              <span className="text-base font-bold text-crypto-green number-animate">
                {formatVolume(longLiqTotal)}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-crypto-red/5 border border-crypto-red/10">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-crypto-red" />
                <span className="text-xs text-muted-foreground">Est. Short Liquidations (24h)</span>
              </div>
              <span className="text-base font-bold text-crypto-red number-animate">
                {formatVolume(shortLiqTotal)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
