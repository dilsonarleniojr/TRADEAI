"use client";

import { useCryptoStore, AISignalData } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Sparkles } from "lucide-react";
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
  const { aiSignals } = useCryptoStore();

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
            AI Quick Signals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiSignals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
              No signals yet
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
                      borderColor
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
                        <span className="text-xs font-medium">
                          {signal.symbol.replace("USDT", "")}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          @ ${formatPrice(signal.priceAtSignal)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
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
