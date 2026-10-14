"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, TrendingUp, TrendingDown, DollarSign, Zap, AlertTriangle, Trash2 } from "lucide-react";
import type { BotLogEntry } from "@/lib/store/types";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer } from "@tanstack/react-virtual";

const INITIAL_LOG_ENTRIES: BotLogEntry[] = [];

function getLogIcon(type: BotLogEntry["type"]) {
  switch (type) {
    case "buy":
      return <TrendingUp className="w-3 h-3 text-crypto-green shrink-0" />;
    case "sell":
      return <TrendingDown className="w-3 h-3 text-crypto-red shrink-0" />;
    case "profit":
    case "success":
      return <DollarSign className="w-3 h-3 text-crypto-green shrink-0" />;
    case "loss":
    case "error":
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
    case "profit":
    case "success":
      return "border-l-crypto-green";
    case "sell":
    case "loss":
    case "error":
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
    case "profit":
    case "success":
      return "text-crypto-green";
    case "sell":
    case "loss":
    case "error":
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
  const { botActive, trades, botLogs } = useCryptoStore(
    useShallow((s) => ({ botActive: s.botActive, trades: s.trades, botLogs: s.botLogs }))
  );
  const clearBotLogs = useCryptoStore((s) => s.clearBotLogs);
  const parentRef = useRef<HTMLDivElement>(null);

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

  // Merge all logs (suporta até 1.000 entradas sem lentidão no DOM)
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
      .slice(0, 1000);
  }, [tradeLogs, botLogs]);

  // Virtualizador de alta performance
  const rowVirtualizer = useVirtualizer({
    count: allLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 8,
  });

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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-border">
              {allLogs.length} entradas
            </Badge>
            {allLogs.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-crypto-red hover:bg-crypto-red/10 transition-colors"
                title="Limpar logs de atividade"
                onClick={() => clearBotLogs()}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative">
        <div
          ref={parentRef}
          className="h-[400px] overflow-y-auto px-4 pb-4 space-y-1"
        >
          {allLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Nenhuma atividade registrada ainda.
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const log = allLogs[virtualRow.index];
                if (!log) return null;
                return (
                  <div
                    key={log.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`flex items-start gap-2 py-1.5 px-2 rounded-md border-l-2 ${getBorderColor(log.type)} hover:bg-secondary/30 transition-colors`}
                  >
                    <div
                      className="absolute left-[-5px] top-2 w-1.5 h-1.5 rounded-full bg-card border border-current"
                      style={{
                        color:
                          log.type === "buy" || log.type === "profit" || log.type === "success"
                            ? "#22c55e"
                            : log.type === "sell" || log.type === "loss" || log.type === "error"
                            ? "#ef4444"
                            : log.type === "system"
                            ? "#06b6d4"
                            : log.type === "warning"
                            ? "#f59e0b"
                            : "#94a3b8",
                      }}
                    />
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
