"use client";

import { useCryptoStore, AISignalData } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

function getActionColor(action: AISignalData["action"]) {
  switch (action) {
    case "BUY":
      return "bg-crypto-green/15 text-crypto-green border-crypto-green/30 glow-green";
    case "SELL":
      return "bg-crypto-red/15 text-crypto-red border-crypto-red/30 glow-red";
    case "HOLD":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  }
}

function getConfidenceBarColor(action: AISignalData["action"]) {
  switch (action) {
    case "BUY":
      return "bg-crypto-green";
    case "SELL":
      return "bg-crypto-red";
    case "HOLD":
      return "bg-amber-400";
  }
}

function getConfidenceBars(confidence: number) {
  const filled = Math.round(confidence * 5);
  return Array.from({ length: 5 }, (_, i) => i < filled);
}

export function AISignals() {
  const { aiSignals, botConfig, botActive, trades } = useCryptoStore();

  // Determine which signals have had trades executed via auto-trade
  const executedSignalSymbols = new Set<string>();
  if (botActive && botConfig.autoTradeSignals) {
    const threshold = botConfig.signalConfidenceThreshold / 100;
    for (const signal of aiSignals) {
      if (signal.action === "HOLD") continue;
      if (signal.confidence < threshold) continue;
      // Check if there's a recent AI-Signal trade for this symbol
      const hasTrade = trades.some(
        (t) =>
          t.strategy === "AI-Signal" &&
          t.symbol === signal.symbol &&
          Math.abs(new Date(t.timestamp).getTime() - new Date(signal.createdAt).getTime()) < 120000
      );
      if (hasTrade) {
        executedSignalSymbols.add(signal.id);
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md gradient-border h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4 text-crypto-cyan" />
            Sinais Rápidos da IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiSignals.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon bg-crypto-cyan/10">
                <Sparkles className="w-6 h-6 text-crypto-cyan/60" />
              </div>
              <p className="empty-state-title">Nenhum sinal ainda</p>
              <p className="empty-state-desc">
                Sinais da IA aparecerão aqui conforme padrões de mercado são detectados
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {aiSignals.slice(0, 8).map((signal) => {
                const isPositive = signal.action === "BUY";
                const isNegative = signal.action === "SELL";
                const borderColor = isPositive ? "border-l-crypto-green" : isNegative ? "border-l-crypto-red" : "border-l-amber-400";

                return (
                  <div
                    key={signal.id}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-lg border-l-2 transition-colors hover:bg-secondary/40 glass-hover",
                      borderColor,
                      executedSignalSymbols.has(signal.id) && "ring-1 ring-crypto-cyan/30"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 shrink-0",
                          getActionColor(signal.action)
                        )}
                      >
                        {signal.action}
                      </Badge>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">
                            {signal.symbol.replace("USDT", "")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            @ ${formatPrice(signal.priceAtSignal)}
                          </span>
                        </div>
                        {(signal.stopLoss > 0 || signal.takeProfit > 0) && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-crypto-red flex items-center gap-0.5">
                              🛑 SL: ${formatPrice(signal.stopLoss)}
                            </span>
                            <span className="text-[9px] text-crypto-green flex items-center gap-0.5">
                              ✅ TP: ${formatPrice(signal.takeProfit)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {executedSignalSymbols.has(signal.id) && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        >
                          <Badge className="text-[8px] px-1 py-0 bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/30 gap-0.5">
                            <Zap className="w-2.5 h-2.5" />
                            Executado
                          </Badge>
                        </motion.div>
                      )}
                      {getConfidenceBars(signal.confidence).map((filled, i) => (
                        <div
                          key={i}
                          className={cn(
                            "w-1 h-3 rounded-full relative overflow-hidden",
                            filled
                              ? getConfidenceBarColor(signal.action)
                              : "bg-secondary"
                          )}
                        >
                          {filled && i === Math.round(signal.confidence * 5) - 1 && (
                            <div className="absolute inset-0 shimmer" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
