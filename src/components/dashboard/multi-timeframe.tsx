"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface TimeframeData {
  timeframe: string;
  rsi: number;
  rsiSignal: "Overbought" | "Neutral" | "Oversold";
  macdSignal: "Bullish" | "Bearish" | "Neutral";
  macdValue: number;
  overall: "BUY" | "SELL" | "HOLD";
}

// Seeded pseudo-random for deterministic mock data
function seededRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Generate RSI/MACD data for each timeframe based on market data
function generateTimeframeData(
  symbol: string,
  tickers: Record<string, import("@/lib/store").TickerData>
): TimeframeData[] {
  const ticker = tickers[symbol];
  const priceChange = ticker?.priceChangePercent ?? 0;
  const timeframes = ["5m", "15m", "1h", "4h", "1d", "1w"];

  // Use symbol + day as seed for slowly changing data
  const daySeed = Math.floor(Date.now() / 86400000);
  let symbolHash = 0;
  for (let i = 0; i < symbol.length; i++) {
    symbolHash = ((symbolHash << 5) - symbolHash + symbol.charCodeAt(i)) | 0;
  }

  return timeframes.map((tf, idx) => {
    const tfSeed = daySeed + symbolHash + idx * 137;

    // RSI correlated with price change, with timeframe-specific variation
    // Shorter timeframes = more volatile RSI
    const volatility = [8, 7, 5, 4, 3, 2][idx]; // decreasing volatility for longer TFs
    const baseRSI = 50 + priceChange * 2.5;
    const rsiNoise = (seededRandom(tfSeed) - 0.5) * volatility * 2;
    const rsi = Math.round(Math.min(95, Math.max(5, baseRSI + rsiNoise)));

    // RSI signal
    let rsiSignal: "Overbought" | "Neutral" | "Oversold";
    if (rsi > 70) rsiSignal = "Overbought";
    else if (rsi < 30) rsiSignal = "Oversold";
    else rsiSignal = "Neutral";

    // MACD - correlated with price change and RSI
    const macdBase = priceChange * 0.15;
    const macdNoise = (seededRandom(tfSeed + 42) - 0.5) * 0.8;
    const macdValue = parseFloat((macdBase + macdNoise).toFixed(3));

    let macdSignal: "Bullish" | "Bearish" | "Neutral";
    if (macdValue > 0.15) macdSignal = "Bullish";
    else if (macdValue < -0.15) macdSignal = "Bearish";
    else macdSignal = "Neutral";

    // Overall signal: combine RSI + MACD
    let overall: "BUY" | "SELL" | "HOLD";
    const isRSIBullish = rsi < 35; // Oversold = potential buy
    const isRSIBearish = rsi > 65; // Overbought = potential sell
    const isMACDBullish = macdSignal === "Bullish";
    const isMACDBearish = macdSignal === "Bearish";

    if (isRSIBullish && isMACDBullish) overall = "BUY";
    else if (isRSIBearish && isMACDBearish) overall = "SELL";
    else if (rsiSignal === "Oversold" && macdSignal !== "Bearish") overall = "BUY";
    else if (rsiSignal === "Overbought" && macdSignal !== "Bullish") overall = "SELL";
    else overall = "HOLD";

    return {
      timeframe: tf,
      rsi,
      rsiSignal,
      macdSignal,
      macdValue,
      overall,
    };
  });
}

// RSI color based on value
function getRSIColor(rsi: number): string {
  if (rsi > 70) return "#ef4444";
  if (rsi < 30) return "#22c55e";
  return "oklch(0.65 0 0)";
}

// RSI background color
function getRSIBg(rsi: number): string {
  if (rsi > 70) return "bg-crypto-red/10";
  if (rsi < 30) return "bg-crypto-green/10";
  return "bg-secondary/50";
}

// MACD badge styling
function getMACDStyle(signal: string) {
  switch (signal) {
    case "Bullish":
      return { bg: "bg-crypto-green/10", text: "text-crypto-green", border: "border-crypto-green/20" };
    case "Bearish":
      return { bg: "bg-crypto-red/10", text: "text-crypto-red", border: "border-crypto-red/20" };
    default:
      return { bg: "bg-secondary/50", text: "text-muted-foreground", border: "border-border/50" };
  }
}

// Overall signal styling
function getOverallStyle(signal: string) {
  switch (signal) {
    case "BUY":
      return { bg: "bg-crypto-green/15", text: "text-crypto-green", border: "border-crypto-green/30" };
    case "SELL":
      return { bg: "bg-crypto-red/15", text: "text-crypto-red", border: "border-crypto-red/30" };
    default:
      return { bg: "bg-secondary/50", text: "text-muted-foreground", border: "border-border/50" };
  }
}

export function MultiTimeframeAnalysis() {
  const { selectedSymbol, tickers } = useCryptoStore();

  const timeframeData = useMemo(
    () => generateTimeframeData(selectedSymbol, tickers),
    [selectedSymbol, tickers]
  );

  // Count signals
  const buyCount = timeframeData.filter((t) => t.overall === "BUY").length;
  const sellCount = timeframeData.filter((t) => t.overall === "SELL").length;
  const holdCount = timeframeData.filter((t) => t.overall === "HOLD").length;

  // Overall consensus
  const consensus = buyCount > sellCount && buyCount > holdCount
    ? "Bullish"
    : sellCount > buyCount && sellCount > holdCount
    ? "Bearish"
    : "Neutral";

  const consensusColor = consensus === "Bullish"
    ? "text-crypto-green"
    : consensus === "Bearish"
    ? "text-crypto-red"
    : "text-crypto-gold";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-crypto-cyan" />
              Análise Multi-Timeframe
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-crypto-cyan" />
              <span className="text-[10px] text-muted-foreground font-medium">
                {selectedSymbol.replace("USDT", "")}
              </span>
              <span className={cn("text-[10px] font-bold", consensusColor)}>
                {consensus}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 mb-2 px-1">
            <span className="col-span-2 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">TF</span>
            <span className="col-span-3 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-center">RSI</span>
            <span className="col-span-3 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-center">MACD</span>
            <span className="col-span-4 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-center">Sinal</span>
          </div>

          {/* Timeframe rows */}
          <div className="space-y-1.5">
            {timeframeData.map((data, idx) => {
              const rsiColor = getRSIColor(data.rsi);
              const macdStyle = getMACDStyle(data.macdSignal);
              const overallStyle = getOverallStyle(data.overall);

              // RSI bar width (0-100 mapped to percentage)
              const rsiBarWidth = data.rsi;

              return (
                <motion.div
                  key={data.timeframe}
                  className="grid grid-cols-12 gap-2 items-center p-1.5 rounded-lg bg-secondary/20 border border-border/30 hover:bg-secondary/40 transition-colors"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * idx, duration: 0.3 }}
                >
                  {/* Timeframe */}
                  <div className="col-span-2 flex items-center">
                    <span className="text-[11px] font-bold text-foreground/80">
                      {data.timeframe}
                    </span>
                  </div>

                  {/* RSI */}
                  <div className="col-span-3 flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-1">
                      <span
                        className="text-[11px] font-bold"
                        style={{ color: rsiColor }}
                      >
                        {data.rsi}
                      </span>
                      <span
                        className={cn(
                          "text-[7px] font-semibold px-1 py-0.5 rounded",
                          getRSIBg(data.rsi),
                          data.rsi > 70 ? "text-crypto-red" :
                          data.rsi < 30 ? "text-crypto-green" : "text-muted-foreground"
                        )}
                      >
                        {data.rsiSignal === "Overbought" ? "OB" :
                         data.rsiSignal === "Oversold" ? "OS" : "—"}
                      </span>
                    </div>
                    {/* RSI visual bar */}
                    <div className="w-full h-1 bg-secondary/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${rsiBarWidth}%`,
                          backgroundColor: rsiColor,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>

                  {/* MACD */}
                  <div className="col-span-3 flex items-center justify-center">
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                        macdStyle.bg,
                        macdStyle.text,
                        macdStyle.border
                      )}
                    >
                      {data.macdSignal}
                    </span>
                  </div>

                  {/* Overall Signal */}
                  <div className="col-span-4 flex items-center justify-center">
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-md border",
                        overallStyle.bg,
                        overallStyle.text,
                        overallStyle.border
                      )}
                    >
                      {data.overall === "BUY" ? "🟢 BUY" :
                       data.overall === "SELL" ? "🔴 SELL" : "⚪ HOLD"}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Summary bar */}
          <div className="mt-3 flex items-center justify-between p-2 rounded-lg bg-secondary/20 border border-border/30">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-crypto-green" />
                <span className="text-[10px] text-crypto-green font-semibold">{buyCount} Comprar</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-semibold">{holdCount} Manter</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-crypto-red" />
                <span className="text-[10px] text-crypto-red font-semibold">{sellCount} Vender</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground">Consenso:</span>
              <span className={cn("text-[11px] font-bold", consensusColor)}>
                {consensus}
              </span>
            </div>
          </div>

          {/* RSI Legend */}
          <div className="mt-2 flex items-center justify-center gap-4 text-[8px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="text-crypto-green">●</span> OS &lt;30 (Zona de compra)
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">●</span> Neutral 30-70
            </div>
            <div className="flex items-center gap-1">
              <span className="text-crypto-red">●</span> OB &gt;70 (Zona de venda)
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
