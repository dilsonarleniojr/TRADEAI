"use client";

import { useEffect, useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { telemetry } from "@/lib/telemetry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Wifi,
  WifiOff,
  Database,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Clock,
  Layers,
} from "lucide-react";
import { formatTime } from "@/lib/format";

export function TelemetryPanel() {
  const { connectionStatus, syncMode, lastSyncAt } = useCryptoStore();
  const [queue, setQueue] = useState<any[]>([]);
  const [simulateFail, setSimulateFail] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setQueue([...telemetry.currentQueue]);
    setSimulateFail(telemetry.simulateFailureMode);

    const handleUpdate = () => {
      setQueue([...telemetry.currentQueue]);
    };

    window.addEventListener("telemetry-queue-updated", handleUpdate);
    
    // Heartbeat listener or periodic check
    const interval = setInterval(() => {
      setQueue([...telemetry.currentQueue]);
      setRefreshKey((k) => k + 1);
    }, 2000);

    return () => {
      window.removeEventListener("telemetry-queue-updated", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const toggleSimulateFail = () => {
    const nextState = !simulateFail;
    telemetry.setSimulateFailure(nextState);
    setSimulateFail(nextState);
  };

  const forceHeartbeat = () => {
    const portfolio = useCryptoStore.getState().portfolio;
    telemetry.emit("heartbeat", {
      status: "manual_trigger",
      pnl: portfolio?.pnl ?? 0,
      pnlPercent: portfolio?.pnlPercent ?? 0,
      cashBalance: portfolio?.cashBalance ?? 10000,
    });
  };

  return (
    <Card className="bg-card/30 backdrop-blur-md border-border/50 relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-crypto-cyan/5">
      {/* Background soft glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-crypto-cyan/5 rounded-full blur-3xl pointer-events-none" />

      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-crypto-cyan/10 text-crypto-cyan">
              <Activity className="w-4.5 h-4.5" />
            </div>
            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
              Telemetria & Conectividade
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border ${
              connectionStatus === "connected"
                ? "bg-green-500/10 text-green-400 border-green-500/30"
                : connectionStatus === "rest-api"
                ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                : "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse"
            }`}
          >
            {connectionStatus === "connected" && <Wifi className="w-3 h-3 mr-1 inline-block" />}
            {connectionStatus === "rest-api" && <Database className="w-3 h-3 mr-1 inline-block" />}
            {connectionStatus === "disconnected" && <WifiOff className="w-3 h-3 mr-1 inline-block" />}
            {connectionStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Status Indicators Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-secondary/20 rounded-xl p-2.5 border border-border/20">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Modo Sinc
            </span>
            <span className="text-xs font-semibold text-foreground capitalize mt-1 block">
              {syncMode}
            </span>
          </div>
          <div className="bg-secondary/20 rounded-xl p-2.5 border border-border/20">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Fila Pendente
            </span>
            <span
              className={`text-xs font-semibold mt-1 block ${
                queue.length > 0 ? "text-amber-400 font-bold" : "text-green-400"
              }`}
            >
              {queue.length} event{queue.length !== 1 ? "os" : ""}
            </span>
          </div>
          <div className="bg-secondary/20 rounded-xl p-2.5 border border-border/20">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Último Sync
            </span>
            <span className="text-xs font-semibold text-foreground mt-1 block truncate">
              {lastSyncAt > 0 ? formatTime(lastSyncAt) : "Nunca"}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSimulateFail}
            className={`flex-1 text-xs h-9 transition-all duration-200 ${
              simulateFail
                ? "bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30"
                : "border-border/60 hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            {simulateFail ? "Falha Simulada Ativa" : "Simular Queda de Rede"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={forceHeartbeat}
            className="text-xs h-9 border-border/60 hover:bg-secondary/50 text-muted-foreground hover:text-foreground shrink-0"
            title="Disparar Heartbeat de Teste"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Heartbeat
          </Button>
        </div>

        {/* Queue Events List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
            <div className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-crypto-cyan" />
              <span>Eventos Fila Recente</span>
            </div>
            <span>Status</span>
          </div>

          <div className="bg-background/40 border border-border/30 rounded-xl max-h-[140px] overflow-y-auto scrollbar-thin divide-y divide-border/20 text-xs">
            {queue.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground/60 flex flex-col items-center justify-center gap-1.5">
                <CheckCircle className="w-5 h-5 text-green-500/50" />
                <span>Fila vazia. Todos os eventos sincronizados!</span>
              </div>
            ) : (
              queue.slice(0, 10).map((event) => (
                <div
                  key={event.id}
                  className="p-2.5 flex items-center justify-between hover:bg-secondary/10 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground uppercase text-[10px]">
                        {event.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {event.id.replace("tele-", "")}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                      {JSON.stringify(event.payload)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3 text-muted-foreground/50" />
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        event.retryCount > 0
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      {event.retryCount > 0 ? `Retry ${event.retryCount}` : "Pendente"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
