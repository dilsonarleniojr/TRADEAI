"use client";

import { useCryptoStore, TradeData } from "@/lib/store";
import { formatPrice, formatTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ExportTrades } from "@/components/dashboard/export-trades";
import { useShallow } from "zustand/react/shallow";

function getSideIcon(side: TradeData["side"]) {
  return side === "BUY" ? ArrowUpRight : ArrowDownRight;
}

function getSideColor(side: TradeData["side"]) {
  return side === "BUY" ? "text-crypto-green" : "text-crypto-red";
}

function getSideBg(side: TradeData["side"]) {
  return side === "BUY" ? "bg-crypto-green/10" : "bg-crypto-red/10";
}

export function RecentTrades() {
  const { trades } = useCryptoStore(
  useShallow((s) => ({ trades: s.trades }))
);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md gradient-border h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-crypto-gold" />
              Trades Recentes
            </CardTitle>
            <ExportTrades />
          </div>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon bg-crypto-gold/10">
                <FileText className="w-6 h-6 text-crypto-gold/60" />
              </div>
              <p className="empty-state-title">Nenhum trade ainda</p>
              <p className="empty-state-desc">
                Comece a operar com o Quick Trade ou ative o robô de trading
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {trades.slice(0, 6).map((trade) => {
                const SideIcon = getSideIcon(trade.side);
                return (
                  <div
                    key={trade.id}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg border-l-2 transition-colors hover:bg-secondary/40 hover:shadow-sm",
                      trade.side === "BUY" ? "border-l-crypto-green bg-crypto-green/[0.03]" : "border-l-crypto-red bg-crypto-red/[0.03]"
                    )}
                  >
                    <div
                      className={cn(
                        "p-1.5 rounded-md",
                        getSideBg(trade.side)
                      )}
                    >
                      <SideIcon
                        className={cn("w-3.5 h-3.5", getSideColor(trade.side))}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">
                          {trade.symbol.replace("USDT", "")}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1 py-0",
                            trade.side === "BUY"
                              ? "border-crypto-green/30 text-crypto-green"
                              : "border-crypto-red/30 text-crypto-red"
                          )}
                        >
                          {trade.side}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground border-border">
                          {trade.strategy}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[8px] px-1 py-0 font-medium",
                            trade.mode === "live"
                              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                              : "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
                          )}
                        >
                          {trade.mode === "live" ? "Real" : "Simulado"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">
                          ${formatPrice(trade.price)}
                        </span>
                        <span>·</span>
                        <span>{formatTime(new Date(trade.timestamp).getTime())}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-medium">
                        ${formatPrice(trade.total)}
                      </span>
                      {trade.pnl !== 0 && (
                        <p
                          className={cn(
                            "text-[10px] font-mono",
                            trade.pnl >= 0
                              ? "text-crypto-green"
                              : "text-crypto-red"
                          )}
                        >
                          {trade.pnl >= 0 ? "+" : ""}
                          {formatPrice(trade.pnl)}
                        </p>
                      )}
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
