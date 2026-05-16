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
      return "bg-crypto-green/15 text-crypto-green border-crypto-green/30";
    case "SELL":
      return "bg-crypto-red/15 text-crypto-red border-crypto-red/30";
    case "HOLD":
      return "bg-crypto-gold/15 text-crypto-gold border-crypto-gold/30";
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
      <Card className="bg-card border-border h-full">
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
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {aiSignals.slice(0, 8).map((signal) => (
                <div
                  key={signal.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
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
                      <span className="text-xs text-muted-foreground ml-1">
                        @ ${formatPrice(signal.priceAtSignal)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {getConfidenceBars(signal.confidence).map((filled, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-1 h-3 rounded-full",
                          filled ? "bg-crypto-cyan" : "bg-secondary"
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
