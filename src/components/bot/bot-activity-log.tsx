"use client";

import { useState, useEffect, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, DollarSign, Zap } from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "buy" | "sell" | "profit" | "loss" | "system";
}

const MOCK_LOG_ENTRIES: LogEntry[] = [
  {
    id: "l1",
    timestamp: new Date(Date.now() - 3600000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Bot started - Strategy: AI, Symbol: BTCUSDT",
    type: "system",
  },
  {
    id: "l2",
    timestamp: new Date(Date.now() - 3500000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Analyzing market conditions...",
    type: "info",
  },
  {
    id: "l3",
    timestamp: new Date(Date.now() - 3400000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Signal: BUY BTCUSDT at $78,301.00",
    type: "buy",
  },
  {
    id: "l4",
    timestamp: new Date(Date.now() - 3300000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Order placed: 0.01 BTC at $78,301.00",
    type: "buy",
  },
  {
    id: "l5",
    timestamp: new Date(Date.now() - 3000000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Price update: BTCUSDT at $78,450.00 (+0.19%)",
    type: "info",
  },
  {
    id: "l6",
    timestamp: new Date(Date.now() - 2400000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Take Profit triggered: +2.3% on BTCUSDT",
    type: "profit",
  },
  {
    id: "l7",
    timestamp: new Date(Date.now() - 2000000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Signal: SELL ETHUSDT at $3,875.20",
    type: "sell",
  },
  {
    id: "l8",
    timestamp: new Date(Date.now() - 1800000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Order placed: 0.5 ETH at $3,875.20",
    type: "sell",
  },
  {
    id: "l9",
    timestamp: new Date(Date.now() - 1200000).toLocaleTimeString("en-US", { hour12: false }),
    message: "RSI analysis: BTCUSDT RSI at 45.2 (Neutral)",
    type: "info",
  },
  {
    id: "l10",
    timestamp: new Date(Date.now() - 600000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Stop loss check: All positions within safe range",
    type: "info",
  },
  {
    id: "l11",
    timestamp: new Date(Date.now() - 300000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Signal: BUY SOLUSDT at $178.45",
    type: "buy",
  },
  {
    id: "l12",
    timestamp: new Date(Date.now() - 60000).toLocaleTimeString("en-US", { hour12: false }),
    message: "Daily trade limit: 7/10 used",
    type: "system",
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

export function BotActivityLog() {
  const { botActive, botConfig } = useCryptoStore();
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOG_ENTRIES);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simulate new log entries when bot is active
  useEffect(() => {
    if (!botActive) return;

    const actions: Omit<LogEntry, "id" | "timestamp">[] = [
      { message: `Analyzing ${botConfig.symbol} market conditions...`, type: "info" },
      { message: `RSI check: ${botConfig.symbol} at neutral zone`, type: "info" },
      { message: `Signal: BUY ${botConfig.symbol} at $${(78000 + Math.random() * 2000).toFixed(2)}`, type: "buy" },
      { message: `Order placed: ${(0.01 + Math.random() * 0.05).toFixed(4)} ${botConfig.symbol.split("USDT")[0]}`, type: "buy" },
      { message: `Take Profit triggered: +${(1 + Math.random() * 4).toFixed(1)}% on ${botConfig.symbol}`, type: "profit" },
      { message: `Stop loss check: All positions safe`, type: "info" },
      { message: `Signal: SELL ${botConfig.symbol} at $${(78000 + Math.random() * 2000).toFixed(2)}`, type: "sell" },
    ];

    const interval = setInterval(() => {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const newLog: LogEntry = {
        id: `l-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        ...action,
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 50));
    }, 5000);

    return () => clearInterval(interval);
  }, [botActive, botConfig.symbol]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-crypto-cyan" />
            Activity Log
          </CardTitle>
          <Badge variant="outline" className="text-[10px] border-border">
            {logs.length} entries
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="px-4 pb-4 space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0"
              >
                {getLogIcon(log.type)}
                <div className="flex-1 min-w-0">
                  <span className={`text-xs ${getLogColor(log.type)}`}>
                    {log.message}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                  {log.timestamp}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
