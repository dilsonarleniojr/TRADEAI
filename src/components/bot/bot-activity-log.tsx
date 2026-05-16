"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, DollarSign, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "buy" | "sell" | "profit" | "loss" | "system";
}

const INITIAL_LOG_ENTRIES: LogEntry[] = [
  {
    id: "l1",
    timestamp: Date.now() - 3600000,
    message: "Bot started - Strategy: AI, Symbol: BTCUSDT",
    type: "system",
  },
  {
    id: "l2",
    timestamp: Date.now() - 3500000,
    message: "Analyzing market conditions...",
    type: "info",
  },
  {
    id: "l3",
    timestamp: Date.now() - 3400000,
    message: "Signal: BUY BTCUSDT at $78,301.00",
    type: "buy",
  },
  {
    id: "l4",
    timestamp: Date.now() - 3300000,
    message: "Order placed: 0.01 BTC at $78,301.00",
    type: "buy",
  },
  {
    id: "l5",
    timestamp: Date.now() - 3000000,
    message: "Price update: BTCUSDT at $78,450.00 (+0.19%)",
    type: "info",
  },
  {
    id: "l6",
    timestamp: Date.now() - 2400000,
    message: "Take Profit triggered: +2.3% on BTCUSDT",
    type: "profit",
  },
  {
    id: "l7",
    timestamp: Date.now() - 2000000,
    message: "Signal: SELL ETHUSDT at $3,875.20",
    type: "sell",
  },
];

function getLogIcon(type: LogEntry["type"]) {
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
    default:
      return <Activity className="w-3 h-3 text-muted-foreground shrink-0" />;
  }
}

function getBorderColor(type: LogEntry["type"]) {
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
    default:
      return "border-l-muted-foreground/30";
  }
}

function getLogColor(type: LogEntry["type"]) {
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
    default:
      return "text-muted-foreground";
  }
}

function getRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BotActivityLog() {
  const { botActive, botConfig, trades } = useCryptoStore();
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);
  const lastTradeIdRef = useRef<string>("");

  // Convert recent trades to log entries via useMemo
  const tradeLogs: LogEntry[] = useMemo(() => {
    if (!botActive || trades.length === 0) return [];
    const now = Date.now();
    return trades
      .filter((t) => {
        const tradeTime = new Date(t.timestamp).getTime();
        return now - tradeTime <= 20000;
      })
      .flatMap((trade) => {
        const tradeTime = new Date(trade.timestamp).getTime();
        const baseLog: LogEntry = {
          id: trade.id,
          timestamp: tradeTime,
          message: `${trade.side} ${trade.quantity} ${trade.symbol.split("USDT")[0]} at $${trade.price.toLocaleString()}`,
          type: trade.side === "BUY" ? "buy" : "sell",
        };
        const pnlLog: LogEntry | null =
          trade.pnl !== 0
            ? {
                id: `${trade.id}-pnl`,
                timestamp: tradeTime + 1,
                message: `Trade PnL: ${trade.pnl >= 0 ? "+" : ""}$${Math.abs(trade.pnl).toFixed(2)}`,
                type: trade.pnl >= 0 ? "profit" : "loss",
              }
            : null;
        return pnlLog ? [baseLog, pnlLog] : [baseLog];
      });
  }, [trades, botActive]);

  // Merge all logs
  const allLogs = useMemo(() => {
    const merged = new Map<string, LogEntry>();
    for (const log of INITIAL_LOG_ENTRIES) {
      merged.set(log.id, log);
    }
    for (const log of tradeLogs) {
      merged.set(log.id, log);
    }
    for (const log of systemLogs) {
      merged.set(log.id, log);
    }
    return Array.from(merged.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }, [tradeLogs, systemLogs]);

  // Simulate system/info log entries when bot is active
  useEffect(() => {
    if (!botActive) return;

    const actions: Omit<LogEntry, "id" | "timestamp">[] = [
      { message: `Analyzing ${botConfig.symbol} market conditions...`, type: "info" },
      { message: `RSI check: ${botConfig.symbol} at neutral zone`, type: "info" },
      { message: `Stop loss check: All positions safe`, type: "info" },
      { message: `MACD crossover detected on ${botConfig.symbol}`, type: "system" },
      { message: `Volume spike alert on ${botConfig.symbol}`, type: "system" },
    ];

    const addLog = () => {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const newLog: LogEntry = {
        id: `l-${Date.now()}`,
        timestamp: Date.now(),
        ...action,
      };
      setSystemLogs((prev) => [newLog, ...prev].slice(0, 50));
    };

    const interval = setInterval(addLog, 8000);

    return () => clearInterval(interval);
  }, [botActive, botConfig.symbol]);

  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border relative overflow-hidden">
      {/* Gradient border glow */}
      <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-b from-crypto-cyan/20 to-transparent pointer-events-none" />
      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-crypto-cyan" />
            Activity Log
          </CardTitle>
          <Badge variant="outline" className="text-[10px] border-border">
            {allLogs.length} entries
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
                  {/* Timeline dot */}
                  <div className="absolute left-[-5px] top-2 w-1.5 h-1.5 rounded-full bg-card border border-current" style={{ color: log.type === 'buy' || log.type === 'profit' ? '#22c55e' : log.type === 'sell' || log.type === 'loss' ? '#ef4444' : log.type === 'system' ? '#06b6d4' : '#94a3b8' }} />
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
