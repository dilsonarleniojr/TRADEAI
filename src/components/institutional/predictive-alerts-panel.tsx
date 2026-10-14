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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { FastCloseBadge } from "@/components/bot/fast-close-badge";

export function PredictiveAlertsPanel() {
  const { toast } = useToast();
  const activePositions = useCryptoStore(
    useShallow((s) =>
      s.bots
        .filter((b) => b.active && b.position && b.position.quantity > 0)
        .map((b) => ({
          symbol: b.symbol.toUpperCase(),
          currentPrice: b.position?.currentPrice || 0,
          entryPrice: b.position?.entryPrice || 0,
          unrealizedPnlPercent: b.position?.unrealizedPnlPercent || 0,
        }))
    )
  );
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

  // Encontrar o alerta crítico ou de maior risco ativo para guiar a sugestão de correção
  const activeCriticalAlert =
    alerts.find((a) => a.severity === "critico" && !a.isRead) ||
    alerts.find((a) => a.severity === "critico") ||
    alerts.find((a) => a.severity === "risco");

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
              className={`text-[10px] px-2.5 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
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
        {/* Banner de Pulso de Alerta Crítico com Sugestão de Correção Imediata */}
        <AnimatePresence>
          {criticalPulseActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gradient-to-r from-rose-950/80 via-rose-900/40 to-slate-950/90 border-2 border-rose-500/90 rounded-xl p-3.5 space-y-3 shadow-[0_0_25px_rgba(244,63,94,0.35)]"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-rose-500/20 border border-rose-500/50 shrink-0 text-rose-400 mt-0.5">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-rose-200 text-xs tracking-wide">
                        🚨 ALERTA CRÍTICO DE RISCO DETECTADO
                      </span>
                      <Badge className="bg-rose-500/30 text-rose-300 border border-rose-500/60 font-mono text-[9px]">
                        AÇÃO URGENTE
                      </Badge>
                    </div>
                    <p className="text-[11px] text-rose-200/95 mt-1 leading-relaxed">
                      {activeCriticalAlert?.prediction || "O modelo preditivo identificou probabilidade iminente de slippage ou rompimento adverso no livro de ofertas."}
                    </p>
                    {activeCriticalAlert?.triggerReason && (
                      <p className="text-[10px] text-rose-300/70 mt-0.5 font-mono">
                        Gatilho: {activeCriticalAlert.triggerReason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (activeCriticalAlert) handleApplyAction(activeCriticalAlert);
                      else dismissCriticalPulse();
                    }}
                    className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 shadow-[0_0_12px_rgba(16,185,129,0.4)] cursor-pointer flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Aplicar Correção
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={dismissCriticalPulse}
                    className="h-7 text-[10px] bg-rose-950/60 border-rose-500/50 text-rose-200 hover:bg-rose-900/60 cursor-pointer"
                  >
                    Dispensar
                  </Button>
                </div>
              </div>

              {/* Box de Sugestão de Correção Obrigatória */}
              <div className="p-3 rounded-lg bg-black/60 border border-emerald-500/40 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 w-full">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    💡 Sugestão para Correção / Mitigação Imediata:
                  </span>
                  <p className="text-xs text-emerald-100 font-sans leading-relaxed">
                    {activeCriticalAlert?.recommendedAction ||
                      "Forçar ordens LIMIT / IOC exclusivas, suspender temporariamente ordens a mercado e ajustar Stop Loss para o suporte S1 com tolerância de slippage limitada a 0.2%."}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista de Alertas */}
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center bg-[#0a101d] rounded-xl border border-white/[0.04]">
            {filterSeverity === "critico" && criticalPulseActive ? (
              <div className="space-y-2">
                <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-1 animate-pulse" />
                <p className="text-sm font-semibold text-rose-300">Alerta Crítico em Monitoramento Ativo</p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-md mx-auto">
                  Consulte a sugestão de correção indicada no banner acima para mitigar a probabilidade de slippage ou rompimento adverso.
                </p>
              </div>
            ) : filterSeverity !== "all" ? (
              <div>
                <CheckCircle2 className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-white">Nenhum Alerta Ativo na Categoria "{filterSeverity.toUpperCase()}"</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Não foram detectadas anomalias nesta faixa de risco. Consulte a aba "Todos" para acompanhar os {alerts.length} alertas ativos.
                </p>
              </div>
            ) : (
              <div>
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-white">Nenhum Alerta Ativo</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Todos os modelos quantitativos (Temporal, Microestrutura, Volatilidade, Slippage) indicam condições nominais.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
            {filteredAlerts.map((alert) => {
              const isCrit = alert.severity === "critico";
              const borderCls = isCrit
                ? "border-rose-500/70 bg-rose-950/25 shadow-[0_0_14px_rgba(244,63,94,0.2)]"
                : alert.severity === "risco"
                ? "border-orange-500/40 bg-[#0d121e]"
                : alert.severity === "atencao"
                ? "border-amber-500/40 bg-[#0d121e]"
                : "border-white/[0.06] bg-[#0b101c]";

              const pairSym = alert.context.pair ? (alert.context.pair.endsWith("USDT") ? alert.context.pair.toUpperCase() : `${alert.context.pair.toUpperCase()}USDT`) : null;
              const pos = pairSym ? activePositions.find((p) => p.symbol === pairSym) : null;
              const isBotInPosition = !!pos;
              let floatingPnlPct = 0;
              let hasFloatingPnl = false;
              if (pos && pairSym) {
                const curPrice = pos.currentPrice || (useCryptoStore.getState().tickers[pairSym]?.price ?? 0);
                const entryPrice = pos.entryPrice;
                if (curPrice > 0 && entryPrice > 0) {
                  floatingPnlPct = ((curPrice - entryPrice) / entryPrice) * 100;
                  hasFloatingPnl = true;
                } else if (typeof pos.unrealizedPnlPercent === "number") {
                  floatingPnlPct = pos.unrealizedPnlPercent;
                  hasFloatingPnl = true;
                }
              }
              const isFloatingProfit = floatingPnlPct >= 0;

              return (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-xl border ${borderCls} space-y-2.5 transition-all hover:border-purple-500/40`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getSeverityPill(alert.severity)}
                      <span className="font-bold text-white text-xs">{alert.title}</span>
                      <Badge variant="outline" className="text-[9px] bg-slate-900 border-white/10 text-slate-400">
                        {alert.category}
                      </Badge>
                      {pairSym && (
                        <FastCloseBadge
                          symbol={pairSym}
                          size="xs"
                          showInactiveBadge={false}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>Score IA: <strong className="text-purple-300 font-mono">{alert.score}%</strong></span>
                      <span>•</span>
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    {alert.prediction}
                  </p>

                  {/* Contexto Operacional: Par, Estratégia, Bot */}
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 bg-black/40 px-2.5 py-1 rounded-lg border border-white/[0.04]">
                    <span>Contexto:</span>
                    {alert.context.pair && (
                      <span className="text-cyan-300 font-semibold">{alert.context.pair}</span>
                    )}
                    {alert.context.strategy && (
                      <span className="text-amber-300">[{alert.context.strategy}]</span>
                    )}
                    {activeBot && (
                      <span className="text-emerald-400 font-mono font-medium">({activeBot.name})</span>
                    )}
                    <span className="ml-auto text-slate-500">Motivo: {alert.triggerReason}</span>
                  </div>

                  {/* Sugestão de Correção & Ação de Mitigação */}
                  <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                          💡 Sugestão para Correção:
                        </span>
                        <p className="text-xs text-emerald-100 font-sans leading-relaxed">
                          {alert.recommendedAction || "Monitorar condições de liquidez L2 e restringir ordens a mercado."}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleApplyAction(alert)}
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 shrink-0 rounded-lg cursor-pointer self-end sm:self-center shadow-[0_0_10px_rgba(16,185,129,0.3)] flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3" />
                      Aplicar Correção
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
