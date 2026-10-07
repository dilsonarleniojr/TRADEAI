"use client";

import { useAlertStore, type AlertSeverity, type InstitutionalAlert } from "@/lib/store/institutional-stores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
  Zap,
  Filter,
  Check,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export function PredictiveAlertsPanel() {
  const { toast } = useToast();
  const alerts = useAlertStore((s) => s.alerts);
  const filterSeverity = useAlertStore((s) => s.filterSeverity);
  const setFilterSeverity = useAlertStore((s) => s.setFilterSeverity);
  const criticalPulseActive = useAlertStore((s) => s.criticalPulseActive);
  const dismissCriticalPulse = useAlertStore((s) => s.dismissCriticalPulse);
  const markAsRead = useAlertStore((s) => s.markAsRead);
  const clearAlerts = useAlertStore((s) => s.clearAlerts);

  // Filtragem
  const filteredAlerts = alerts.filter(
    (a) => filterSeverity === "all" || a.severity === filterSeverity
  );

  const handleApplyAction = (alert: InstitutionalAlert) => {
    markAsRead(alert.id);
    toast({
      title: "⚡ Recomendação IA Aplicada",
      description: `Medida de governança executada: "${alert.recommendedAction}".`,
    });
  };

  const getSeverityPill = (sev: AlertSeverity) => {
    switch (sev) {
      case "critico":
        return (
          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse text-[10px] font-mono">
            🔴 CRÍTICO
          </Badge>
        );
      case "risco":
        return (
          <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/50 text-[10px] font-mono">
            🟠 RISCO
          </Badge>
        );
      case "atencao":
        return (
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/50 text-[10px] font-mono">
            🟡 ATENÇÃO
          </Badge>
        );
      case "info":
      default:
        return (
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-[10px] font-mono">
            🟢 INFO
          </Badge>
        );
    }
  };

  return (
    <Card className="bg-[#080d17] border border-purple-500/20 shadow-xl overflow-hidden font-mono">
      <CardHeader className="p-4 pb-2 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              Alertas Inteligentes & Modelos Preditivos IA
              <Badge variant="outline" className="text-[10px] bg-purple-950/40 border-purple-500/30 text-purple-300 font-mono">
                {alerts.length} Ativos
              </Badge>
            </CardTitle>
            <p className="text-[11px] text-slate-400">
              Inferência em tempo real sobre PnL, Slippage, Microestrutura e Saúde da Frota
            </p>
          </div>
        </div>

        {/* Filtros de Severidade */}
        <div className="flex items-center gap-1 bg-[#0d1424] p-1 rounded-xl border border-white/[0.08] overflow-x-auto self-start sm:self-auto">
          {(["all", "critico", "risco", "atencao", "info"] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`text-[10px] px-2 py-0.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                filterSeverity === sev
                  ? "bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              {sev === "all" ? "Todos" : sev}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3 text-xs">
        {/* Banner de Pulso de Alerta Crítico */}
        <AnimatePresence>
          {criticalPulseActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-rose-950/60 border border-rose-500/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse"
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <span className="font-bold text-rose-200 block text-xs">
                    🚨 ALERTA CRÍTICO DE RISCO DETECTADO
                  </span>
                  <span className="text-[11px] text-rose-300/90">
                    O modelo preditivo identificou probabilidade iminente de slippage ou rompimento adverso.
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={dismissCriticalPulse}
                className="h-7 text-[10px] bg-rose-900/60 border-rose-500/50 text-white hover:bg-rose-800 cursor-pointer"
              >
                Dispensar Alerta
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista de Alertas */}
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center bg-[#0a101d] rounded-xl border border-white/[0.04]">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white">Nenhum Alerta Ativo</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Todos os modelos quantitativos (Temporal, Microestrutura, Volatilidade, Slippage) indicam condições nominais.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {filteredAlerts.map((alert) => {
              const isCrit = alert.severity === "critico";
              const borderCls = isCrit
                ? "border-rose-500/60 bg-rose-950/20 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                : alert.severity === "risco"
                ? "border-orange-500/40 bg-[#0d121e]"
                : alert.severity === "atencao"
                ? "border-amber-500/40 bg-[#0d121e]"
                : "border-white/[0.06] bg-[#0b101c]";

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl border ${borderCls} space-y-2 transition-all hover:border-purple-500/40`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getSeverityPill(alert.severity)}
                      <span className="font-bold text-white text-xs">{alert.title}</span>
                      <Badge variant="outline" className="text-[9px] bg-slate-900 border-white/10 text-slate-400">
                        {alert.category}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>Score IA: <strong className="text-purple-300 font-mono">{alert.score}%</strong></span>
                      <span>•</span>
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {alert.prediction}
                  </p>

                  {/* Contexto Operacional: Par, Estratégia, Bot */}
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 bg-black/30 px-2 py-1 rounded">
                    <span>Contexto:</span>
                    {alert.context.pair && (
                      <span className="text-cyan-300 font-semibold">{alert.context.pair}</span>
                    )}
                    {alert.context.strategy && (
                      <span className="text-amber-300">[{alert.context.strategy}]</span>
                    )}
                    <span className="ml-auto text-slate-500">Motivo: {alert.triggerReason}</span>
                  </div>

                  {/* Recomendação Automática & Ação Rápida */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                    <div className="text-[11px] text-emerald-400 flex items-center gap-1 truncate">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate"><strong>Recomendação:</strong> {alert.recommendedAction}</span>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleApplyAction(alert)}
                      className="h-6 text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-2 py-0 shrink-0 rounded cursor-pointer"
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
