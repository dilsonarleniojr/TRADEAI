"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, RefreshCw, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { calculateRSI, calculateMACD } from "@/lib/bot/indicators";

interface TimeframeData {
  timeframe: string;
  rsi: number;
  rsiSignal: "Overbought" | "Neutral" | "Oversold";
  macdSignal: "Bullish" | "Bearish" | "Neutral";
  macdValue: number;
  overall: "BUY" | "SELL" | "HOLD";
}

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"];

function getRSIColor(rsi: number): string {
  if (rsi > 70) return "#ef4444";
  if (rsi < 30) return "#22c55e";
  return "oklch(0.65 0 0)";
}

function getRSIBg(rsi: number): string {
  if (rsi > 70) return "bg-crypto-red/10";
  if (rsi < 30) return "bg-crypto-green/10";
  return "bg-secondary/40";
}

function getMACDStyle(signal: "Bullish" | "Bearish" | "Neutral") {
  switch (signal) {
    case "Bullish":
      return { bg: "bg-crypto-green/10", text: "text-crypto-green", border: "border-crypto-green/20" };
    case "Bearish":
      return { bg: "bg-crypto-red/10", text: "text-crypto-red", border: "border-crypto-red/20" };
    default:
      return { bg: "bg-secondary/40", text: "text-muted-foreground", border: "border-border/30" };
  }
}

function getOverallStyle(overall: "BUY" | "SELL" | "HOLD") {
  switch (overall) {
    case "BUY":
      return { bg: "bg-crypto-green/15", text: "text-crypto-green", border: "border-crypto-green/30" };
    case "SELL":
      return { bg: "bg-crypto-red/15", text: "text-crypto-red", border: "border-crypto-red/30" };
    default:
      return { bg: "bg-secondary/30", text: "text-muted-foreground", border: "border-border/30" };
  }
}

export function MultiTimeframeAnalysis() {
  const { selectedSymbol, tickers } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol || "BTCUSDT",
      tickers: s.tickers,
    }))
  );

  const [tfData, setTfData] = useState<TimeframeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRealTimeframeIndicators = useCallback(async () => {
    try {
      setRefreshing(true);
      const symbol = selectedSymbol || "BTCUSDT";

      const promises = TIMEFRAMES.map(async (tf) => {
        try {
          const res = await fetch(`/api/market/klines?symbol=${symbol}&interval=${tf}&limit=50`);
          if (!res.ok) throw new Error("Kline fetch error");
          const json = await res.json();
          const klines = json.data || [];
          const closes = klines.map((k: any) => parseFloat(k.close)).filter((v: number) => !isNaN(v));

          if (closes.length < 15) {
            return {
              timeframe: tf,
              rsi: 50,
              rsiSignal: "Neutral" as const,
              macdSignal: "Neutral" as const,
              macdValue: 0,
              overall: "HOLD" as const,
            };
          }

          const rsiVal = Math.round(calculateRSI(closes, 14));
          const macdRes = calculateMACD(closes);
          const macdHist = macdRes?.histogram ?? 0;

          let rsiSignal: "Overbought" | "Neutral" | "Oversold" = "Neutral";
          if (rsiVal >= 70) rsiSignal = "Overbought";
          else if (rsiVal <= 30) rsiSignal = "Oversold";

          let macdSignal: "Bullish" | "Bearish" | "Neutral" = "Neutral";
          if (macdHist > 0.05) macdSignal = "Bullish";
          else if (macdHist < -0.05) macdSignal = "Bearish";

          let overall: "BUY" | "SELL" | "HOLD" = "HOLD";
          if (rsiSignal === "Oversold" && macdSignal === "Bullish") overall = "BUY";
          else if (rsiSignal === "Overbought" && macdSignal === "Bearish") overall = "SELL";
          else if (rsiVal < 40 && macdSignal === "Bullish") overall = "BUY";
          else if (rsiVal > 60 && macdSignal === "Bearish") overall = "SELL";

          return {
            timeframe: tf,
            rsi: rsiVal,
            rsiSignal,
            macdSignal,
            macdValue: parseFloat(macdHist.toFixed(3)),
            overall,
          };
        } catch {
          return {
            timeframe: tf,
            rsi: 50,
            rsiSignal: "Neutral" as const,
            macdSignal: "Neutral" as const,
            macdValue: 0,
            overall: "HOLD" as const,
          };
        }
      });

      const results = await Promise.all(promises);
      setTfData(results);
    } catch (err) {
      console.warn("[MultiTimeframe] Erro ao calcular indicadores:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    fetchRealTimeframeIndicators();
    const interval = setInterval(fetchRealTimeframeIndicators, 15000);
    return () => clearInterval(interval);
  }, [fetchRealTimeframeIndicators]);

  // Overall consensus from real calculations
  const buyCount = useMemo(() => tfData.filter((d) => d.overall === "BUY").length, [tfData]);
  const sellCount = useMemo(() => tfData.filter((d) => d.overall === "SELL").length, [tfData]);
  const holdCount = useMemo(() => tfData.filter((d) => d.overall === "HOLD").length, [tfData]);

  let consensus = "NEUTRO";
  let consensusColor = "text-muted-foreground";
  if (buyCount >= 3) {
    consensus = "FORTE COMPRA";
    consensusColor = "text-crypto-green font-bold";
  } else if (buyCount > sellCount) {
    consensus = "COMPRA";
    consensusColor = "text-crypto-green";
  } else if (sellCount >= 3) {
    consensus = "FORTE VENDA";
    consensusColor = "text-crypto-red font-bold";
  } else if (sellCount > buyCount) {
    consensus = "VENDA";
    consensusColor = "text-crypto-red";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
    >
      <Card className="glass-card card-accent-gold h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-crypto-gold" />
              <span>Análise Multi-Timeframe (RSI &amp; MACD Real)</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">
                {selectedSymbol.replace("USDT", "")}
              </span>
            </CardTitle>
            <button
              onClick={fetchRealTimeframeIndicators}
              disabled={refreshing}
              className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Recalcular indicadores reais"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 mb-1.5 px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span className="col-span-2">TF</span>
            <span className="col-span-3 text-center">RSI (14)</span>
            <span className="col-span-3 text-center">MACD Hist</span>
            <span className="col-span-4 text-center">Sinal Técnico</span>
          </div>

          {/* Rows */}
          <div className="space-y-1.5">
            {loading && tfData.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Calculando RSI e MACD em 5 timeframes com candles reais...
              </div>
            ) : (
              tfData.map((data, idx) => {
                const rsiColor = getRSIColor(data.rsi);
                const rsiBarWidth = Math.min(100, Math.max(0, data.rsi));
                const macdStyle = getMACDStyle(data.macdSignal);
                const overallStyle = getOverallStyle(data.overall);

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
                      <span className="text-[11px] font-bold text-foreground/80 font-mono">
                        {data.timeframe}
                      </span>
                    </div>

                    {/* RSI */}
                    <div className="col-span-3 flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1 font-mono">
                        <span className="text-[11px] font-bold" style={{ color: rsiColor }}>
                          {data.rsi}
                        </span>
                        <span
                          className={cn(
                            "text-[7px] font-semibold px-1 py-0.5 rounded",
                            getRSIBg(data.rsi),
                            data.rsi > 70 ? "text-crypto-red" : data.rsi < 30 ? "text-crypto-green" : "text-muted-foreground"
                          )}
                        >
                          {data.rsiSignal === "Overbought" ? "OB" : data.rsiSignal === "Oversold" ? "OS" : "—"}
                        </span>
                      </div>
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
                        {data.overall === "BUY" ? "🟢 BUY" : data.overall === "SELL" ? "🔴 SELL" : "⚪ HOLD"}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            )}
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
                <span className="text-[10px] text-muted-foreground font-semibold">{holdCount} Neutro</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-crypto-red" />
                <span className="text-[10px] text-crypto-red font-semibold">{sellCount} Vender</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground">Consenso:</span>
              <span className={cn("text-[11px] font-bold", consensusColor)}>{consensus}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
