"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, DollarSign, Zap, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { BotLogEntry } from "@/lib/store/types";

const INITIAL_LOG_ENTRIES: BotLogEntry[] = [
  {
    id: "l1",
    timestamp: Date.now() - 3600000,
    message: "Bot iniciado e escutando sinais",
    type: "system",
  },
];

function getLogIcon(type: BotLogEntry["type"]) {
  switch (type) {
    case "buy":
      return <TrendingUp className="w-3 h-3 text-crypto-green shrink-0" />;
    case "sell":
      return <TrendingDown className="w-3 h-3 text-crypto-red shrink-0" />;
    case "profit":
      return <DollarSign className="w-3 h-3 text-crypto-green shrink-0" />;
    case "loss":
      return <DollarSign className="w-3 h-3 text-crypto-red shrink-0" />;
    case "system":
      return <Zap className="w-3 h-3 text-crypto-cyan shrink-0" />;
    case "warning":
      return <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />;
    default:
      return <Activity className="w-3 h-3 text-muted-foreground shrink-0" />;
  }
}

function getBorderColor(type: BotLogEntry["type"]) {
  switch (type) {
    case "buy":
      return "border-l-crypto-green";
    case "sell":
      return "border-l-crypto-red";
    case "profit":
      return "border-l-crypto-green";
    case "loss":
      return "border-l-crypto-red";
    case "system":
      return "border-l-crypto-cyan";
    case "warning":
      return "border-l-amber-500";
    default:
      return "border-l-muted-foreground/30";
  }
}

function getLogColor(type: BotLogEntry["type"]) {
  switch (type) {
    case "buy":
      return "text-crypto-green";
    case "sell":
      return "text-crypto-red";
    case "profit":
      return "text-crypto-green";
    case "loss":
      return "text-crypto-red";
    case "system":
      return "text-crypto-cyan";
    case "warning":
      return "text-amber-500";
    default:
      return "text-muted-foreground";
  }
}

function getRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return "agora";
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BotActivityLog() {
  const { botActive, trades, botLogs } = useCryptoStore();
  const lastTradeIdRef = useRef<string>("");

  // Convert recent trades to log entries via useMemo
  const tradeLogs: BotLogEntry[] = useMemo(() => {
    if (!botActive || trades.length === 0) return [];
    const now = Date.now();
    return trades
      .filter((t) => {
        const tradeTime = new Date(t.timestamp).getTime();
        return now - tradeTime <= 20000;
      })
      .flatMap((trade) => {
        const tradeTime = new Date(trade.timestamp).getTime();
        const baseLog: BotLogEntry = {
          id: trade.id,
          timestamp: tradeTime,
          message: `${trade.side} ${trade.quantity} ${trade.symbol.split("USDT")[0]} at $${trade.price.toLocaleString()}`,
          type: trade.side === "BUY" ? "buy" : "sell",
        };
        const pnlLog: BotLogEntry | null =
          trade.pnl !== 0
            ? {
                id: `${trade.id}-pnl`,
                timestamp: tradeTime + 1,
                message: `L/P do Trade: ${trade.pnl >= 0 ? "+" : ""}$${Math.abs(trade.pnl).toFixed(2)}`,
                type: trade.pnl >= 0 ? "profit" : "loss",
              }
            : null;
        return pnlLog ? [baseLog, pnlLog] : [baseLog];
      });
  }, [trades, botActive]);

  // Merge all logs
  const allLogs = useMemo(() => {
    const merged = new Map<string, BotLogEntry>();
    for (const log of INITIAL_LOG_ENTRIES) {
      merged.set(log.id, log);
    }
    for (const log of tradeLogs) {
      merged.set(log.id, log);
    }
    for (const log of botLogs) {
      merged.set(log.id, log);
    }
    return Array.from(merged.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
  }, [tradeLogs, botLogs]);

  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border relative overflow-hidden">
      {/* Gradient border glow */}
      <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-b from-crypto-cyan/20 to-transparent pointer-events-none" />
      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-crypto-cyan" />
            Log de Atividade
          </CardTitle>
          <Badge variant="outline" className="text-[10px] border-border">
            {allLogs.length} entradas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative">
        <ScrollArea className="h-[400px]">
          <div className="px-4 pb-4 space-y-1">
            <AnimatePresence initial={false}>
              {allLogs.map((log, index) => (
                <motion.div
                  key={log.id}
                  initial={index === 0 ? { opacity: 0, y: -10, height: 0 } : false}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-start gap-2 py-1.5 px-2 rounded-md border-l-2 ${getBorderColor(log.type)} hover:bg-secondary/30 transition-colors`}
                  style={{ position: 'relative' }}
                >
                  <div className="absolute left-[-5px] top-2 w-1.5 h-1.5 rounded-full bg-card border border-current" style={{ color: log.type === 'buy' || log.type === 'profit' ? '#22c55e' : log.type === 'sell' || log.type === 'loss' ? '#ef4444' : log.type === 'system' ? '#06b6d4' : log.type === 'warning' ? '#f59e0b' : '#94a3b8' }} />
                  {getLogIcon(log.type)}
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${getLogColor(log.type)}`}>
                      {log.message}
                    </span>
                  </div>
                  <span
                    className="text-[10px] text-muted-foreground whitespace-nowrap font-mono shrink-0"
                    title={new Date(log.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                  >
                    {getRelativeTime(log.timestamp)}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
