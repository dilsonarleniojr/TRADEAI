"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { useCryptoStore, type BotLogEntry, type LogChannel, type LogSeverity } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity,
  Trash2,
  Download,
  Pause,
  Play,
  Search,
  Radio,
  SlidersHorizontal,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Terminal,
} from "lucide-react";
import { flightRecorder } from "@/lib/telemetry/flight-recorder";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatMillisecondTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function getChannelBadge(channel?: LogChannel) {
  switch (channel) {
    case "MARKET_DATA":
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">MKT</span>;
    case "SIGNALS":
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">SIG</span>;
    case "RISK_ENGINE":
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">RISK</span>;
    case "BINANCE_API":
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">API</span>;
    default:
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">SYS</span>;
  }
}

function getSeverityBadge(severity?: LogSeverity) {
  switch (severity) {
    case "CRITICAL":
      return <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-rose-600/30 text-rose-300 border border-rose-500/50 animate-pulse">CRIT</span>;
    case "ERROR":
      return <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">ERR</span>;
    case "WARN":
      return <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">WARN</span>;
    case "INFO":
    default:
      return <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-700/40 text-slate-400">INFO</span>;
  }
}

function getLogIcon(type: BotLogEntry["type"], severity?: LogSeverity) {
  if (severity === "CRITICAL") return <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />;
  if (severity === "ERROR" || type === "error") return <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
  if (severity === "WARN" || type === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;

  switch (type) {
    case "buy":
      return <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
    case "sell":
      return <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
    case "profit":
    case "success":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
    case "loss":
      return <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
    case "system":
      return <Radio className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />;
    default:
      return <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />;
  }
}

function getLogBorderColor(type: BotLogEntry["type"], severity?: LogSeverity) {
  if (severity === "CRITICAL") return "border-rose-500 bg-rose-950/20";
  if (severity === "ERROR" || type === "error") return "border-red-500 bg-red-950/15";
  if (severity === "WARN" || type === "warning") return "border-amber-500 bg-amber-950/10";
  if (type === "buy" || type === "profit" || type === "success") return "border-emerald-500 bg-emerald-950/10";
  if (type === "sell" || type === "loss") return "border-red-500 bg-red-950/10";
  if (type === "system") return "border-cyan-500 bg-cyan-950/10";
  return "border-slate-700 bg-transparent";
}

function getLogTextColor(type: BotLogEntry["type"], severity?: LogSeverity) {
  if (severity === "CRITICAL") return "text-rose-300 font-bold";
  if (severity === "ERROR" || type === "error") return "text-red-400";
  if (severity === "WARN" || type === "warning") return "text-amber-300";
  if (type === "buy" || type === "profit" || type === "success") return "text-emerald-300";
  if (type === "sell" || type === "loss") return "text-rose-400";
  if (type === "system") return "text-cyan-300";
  return "text-slate-300";
}

export function BotActivityLog() {
  const { botActive, trades, botLogs, structuredLogs, isLogAutoScrollPaused } = useCryptoStore(
    useShallow((s) => ({
      botActive: s.botActive,
      trades: s.trades,
      botLogs: s.botLogs,
      structuredLogs: s.structuredLogs,
      isLogAutoScrollPaused: s.isLogAutoScrollPaused,
    }))
  );
  const clearBotLogs = useCryptoStore((s) => s.clearBotLogs);
  const toggleLogAutoScroll = useCryptoStore((s) => s.toggleLogAutoScroll);
  const { toast } = useToast();

  const parentRef = useRef<HTMLDivElement>(null);

  // Filtros
  const [selectedChannel, setSelectedChannel] = useState<LogChannel | "ALL">("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<LogSeverity | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Converte trades recentes em logs
  const tradeLogs: BotLogEntry[] = useMemo(() => {
    if (!botActive || trades.length === 0) return [];
    const now = Date.now();
    return trades
      .filter((t) => {
        const tradeTime = new Date(t.timestamp).getTime();
        return now - tradeTime <= 30000;
      })
      .map((trade) => {
        const tradeTime = new Date(trade.timestamp).getTime();
        return {
          id: trade.id,
          timestamp: tradeTime,
          message: `${trade.side} ${trade.quantity} ${trade.symbol.replace("USDT", "")} @ $${trade.price.toLocaleString()} ${trade.pnl !== 0 ? `| PnL: ${trade.pnl > 0 ? "+" : ""}$${trade.pnl.toFixed(2)}` : ""}`,
          type: trade.side === "BUY" ? "buy" : "sell",
          channel: "BINANCE_API" as LogChannel,
          severity: "INFO" as LogSeverity,
        };
      });
  }, [trades, botActive]);

  // Merge e Deduplicação dos logs (mantém até 2.000 entradas)
  const allLogs = useMemo(() => {
    const merged = new Map<string, BotLogEntry>();

    // 1. Structured logs primeiro (maior precisão)
    for (const log of structuredLogs) {
      merged.set(log.id, {
        id: log.id,
        timestamp: log.timestamp,
        message: log.message,
        type:
          log.severity === "CRITICAL"
            ? "error"
            : log.severity === "ERROR"
            ? "error"
            : log.severity === "WARN"
            ? "warning"
            : "info",
        channel: log.channel,
        severity: log.severity,
        botId: log.botId,
        botName: log.botName,
      });
    }

    // 2. Trade logs
    for (const log of tradeLogs) {
      if (!merged.has(log.id)) merged.set(log.id, log);
    }

    // 3. Bot logs convencionais
    for (const log of botLogs) {
      if (!merged.has(log.id)) merged.set(log.id, log);
    }

    return Array.from(merged.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 2000);
  }, [structuredLogs, tradeLogs, botLogs]);

  // Logs filtrados
  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (selectedChannel !== "ALL" && log.channel !== selectedChannel) return false;
      if (selectedSeverity !== "ALL" && log.severity !== selectedSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMsg = log.message.toLowerCase().includes(q);
        const matchesBot = (log.botName || "").toLowerCase().includes(q);
        if (!matchesMsg && !matchesBot) return false;
      }
      return true;
    });
  }, [allLogs, selectedChannel, selectedSeverity, searchQuery]);

  // Virtualizador de alta performance (60 FPS contínuos com 2.000 itens)
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  // Auto-scroll para o topo (onde os mais novos chegam) se não estiver pausado
  useEffect(() => {
    if (!isLogAutoScrollPaused && parentRef.current && filteredLogs.length > 0) {
      parentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [filteredLogs.length, isLogAutoScrollPaused]);

  // Exportar snapshot do Flight Recorder
  const handleExportFlightRecorderSnapshot = () => {
    const json = flightRecorder.exportSnapshotJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tradeai-flight-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Snapshot Pós-Mortem Exportado",
      description: "Arquivo JSON gerado contendo Order Book L2, 20 trades e estado dos bots.",
    });
  };

  return (
    <Card className="bg-[#0b1019]/90 backdrop-blur-xl border border-white/[0.08] relative overflow-hidden rounded-xl shadow-2xl flex flex-col h-full">
      <CardHeader className="p-3 border-b border-white/[0.06] space-y-2.5">
        {/* Linha 1: Título, contadores e ações principais */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-crypto-cyan/10 border border-crypto-cyan/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-crypto-cyan" />
            </div>
            <div>
              <CardTitle className="text-xs font-bold tracking-wider uppercase text-foreground flex items-center gap-2">
                Blackbox & Telemetria em Tempo Real
                <Badge variant="outline" className="text-[10px] font-mono border-white/[0.1] bg-white/[0.02]">
                  {filteredLogs.length} / {allLogs.length}
                </Badge>
              </CardTitle>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Auto-Scroll Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleLogAutoScroll()}
              className={cn(
                "h-7 px-2 text-[11px] font-medium border-white/[0.1] transition-all",
                isLogAutoScrollPaused
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
              )}
              title="Pressione Espaço para pausar/retomar auto-scroll"
            >
              {isLogAutoScrollPaused ? (
                <>
                  <Pause className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">Pausado (Espaço)</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">Auto-Scroll</span>
                </>
              )}
            </Button>

            {/* Flight Recorder Snapshot Export */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportFlightRecorderSnapshot}
              className="h-7 px-2 text-[11px] font-medium border-white/[0.1] hover:bg-white/[0.05] text-slate-300"
              title="Exportar snapshot pós-mortem do Flight Recorder (JSON)"
            >
              <Download className="w-3 h-3 mr-1 text-crypto-cyan" />
              <span className="hidden sm:inline">Flight Snapshot</span>
            </Button>

            {/* Clear Logs */}
            {allLogs.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                title="Limpar buffer de telemetria"
                onClick={() => clearBotLogs()}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Linha 2: Barra de Canais e Severidade */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
          {/* Canais */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mr-1">
              Canal:
            </span>
            {(["ALL", "MARKET_DATA", "SIGNALS", "RISK_ENGINE", "BINANCE_API"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setSelectedChannel(ch)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all",
                  selectedChannel === ch
                    ? "bg-crypto-cyan/20 text-crypto-cyan border border-crypto-cyan/40 font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                )}
              >
                {ch === "ALL" ? "TODOS" : ch}
              </button>
            ))}
          </div>

          {/* Severidades e Busca */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {(["ALL", "INFO", "WARN", "ERROR", "CRITICAL"] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSelectedSeverity(sev)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition-all",
                    selectedSeverity === sev
                      ? sev === "CRITICAL"
                        ? "bg-rose-500/30 text-rose-300 border border-rose-500/50"
                        : sev === "ERROR"
                        ? "bg-red-500/30 text-red-300 border border-red-500/50"
                        : sev === "WARN"
                        ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                        : "bg-slate-700 text-slate-100"
                      : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  {sev}
                </button>
              ))}
            </div>

            <div className="relative w-28 sm:w-36">
              <Search className="w-3 h-3 absolute left-2 top-2 text-muted-foreground" />
              <Input
                placeholder="Filtrar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-6 text-[10px] pl-6 py-0 bg-black/40 border-white/[0.08] rounded"
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 relative min-h-[350px]">
        <div ref={parentRef} className="h-full max-h-[480px] overflow-y-auto px-2 py-2 space-y-1 cyan-scrollbar">
          {filteredLogs.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-xs text-muted-foreground gap-1.5">
              <Activity className="w-5 h-5 text-slate-600 animate-pulse" />
              <span>Nenhum evento registrado para os filtros selecionados.</span>
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
                const log = filteredLogs[virtualRow.index];
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
                    className={cn(
                      "flex items-center gap-2 py-1 px-2.5 rounded border-l-2 transition-colors hover:bg-white/[0.04]",
                      getLogBorderColor(log.type, log.severity)
                    )}
                  >
                    {/* Timestamp em milissegundos */}
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 select-all font-semibold">
                      {formatMillisecondTime(log.timestamp)}
                    </span>

                    {/* Canal Badge */}
                    {getChannelBadge(log.channel)}

                    {/* Severidade Badge */}
                    {getSeverityBadge(log.severity)}

                    {/* Ícone */}
                    {getLogIcon(log.type, log.severity)}

                    {/* Nome do Bot / ID */}
                    {log.botName && (
                      <span className="text-[10px] font-semibold text-crypto-cyan/80 shrink-0 font-mono">
                        [{log.botName}]
                      </span>
                    )}

                    {/* Mensagem Estruturada */}
                    <div className="flex-1 min-w-0 truncate">
                      <span className={cn("text-xs leading-none", getLogTextColor(log.type, log.severity))}>
                        {log.message}
                      </span>
                    </div>
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
