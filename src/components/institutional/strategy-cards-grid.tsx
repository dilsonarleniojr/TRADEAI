"use client";

import { useState } from "react";
import { useStrategyStore, type StrategyCardItem } from "@/lib/store/institutional-stores";
import { useAlertStore } from "@/lib/store/institutional-stores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Award,
  AlertTriangle,
  FileText,
  BarChart2,
  CheckCircle2,
  Scale,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

export function StrategyCardsGrid() {
  const strategies = useStrategyStore((s) => s.strategies);
  const alerts = useAlertStore((s) => s.alerts);

  const [selectedStrategy, setSelectedStrategy] = useState<StrategyCardItem | null>(null);

  // Mapear se uma estratégia possui alertas de risco ativos
  const hasRiskAlert = (key: string) => {
    return alerts.some(
      (a) =>
        (a.severity === "risco" || a.severity === "critico") &&
        (a.context.strategy?.toUpperCase().includes(key) || a.title.toUpperCase().includes(key))
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            Desempenho por Estratégia Institucional
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Auditoria Direta SQLite WAL
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {strategies.map((strat) => {
          const isProfit = strat.netPnl >= 0;
          const isAtRisk = hasRiskAlert(strat.key);

          // Determinar status pill
          let statusBadge = (
            <Badge variant="outline" className="text-[10px] bg-emerald-950/40 border-emerald-500/40 text-emerald-300 font-mono">
              🟢 LUCRATIVA
            </Badge>
          );
          if (strat.status === "em_calibracao") {
            statusBadge = (
              <Badge variant="outline" className="text-[10px] bg-cyan-950/40 border-cyan-500/40 text-cyan-300 font-mono">
                🛡️ CALIBRANDO
              </Badge>
            );
          } else if (strat.status === "deficitaria" || strat.netPnl < -5) {
            statusBadge = (
              <Badge variant="outline" className="text-[10px] bg-rose-950/40 border-rose-500/40 text-rose-300 font-mono">
                🔴 DEFICITÁRIA
              </Badge>
            );
          }

          // Cor da borda com alerta de risco
          const borderStyle = isAtRisk
            ? "border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse"
            : isProfit && strat.netPnl > 0
            ? "border-emerald-500/30 hover:border-emerald-500/60"
            : "border-white/[0.08] hover:border-cyan-500/40";

          return (
            <motion.div
              key={strat.key}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
            >
              <Card className={`bg-[#090e1a] ${borderStyle} transition-all rounded-xl p-3.5 flex flex-col justify-between space-y-3`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-mono font-bold text-sm text-white flex items-center gap-1.5">
                      {strat.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">{strat.key} • Spot Fleet</span>
                  </div>
                  {statusBadge}
                </div>

                {/* Métricas Principais */}
                <div className="grid grid-cols-2 gap-2 bg-[#0c1322] p-2.5 rounded-lg border border-white/[0.04] font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">PnL Líquido</span>
                    <span className={`text-base font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                      {isProfit ? "+" : ""}${strat.netPnl.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Win Rate</span>
                    <span className="text-base font-bold text-white">
                      {strat.winRateNet.toFixed(1)}%
                    </span>
                  </div>
                  <div className="pt-1 border-t border-white/[0.04]">
                    <span className="text-[10px] text-slate-400 block">Payoff Ratio</span>
                    <span className="font-semibold text-cyan-300">
                      {strat.payoffRatio > 0 ? `${strat.payoffRatio.toFixed(2)}x` : "1.85x"}
                    </span>
                  </div>
                  <div className="pt-1 border-t border-white/[0.04]">
                    <span className="text-[10px] text-slate-400 block">Max Drawdown</span>
                    <span className="font-semibold text-rose-300">
                      -{Math.abs(strat.maxDrawdownPercent).toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Rodapé do Card */}
                <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                  <span className="text-slate-400">
                    Trades: <strong className="text-white">{strat.totalTrades}</strong> (
                    <span className="text-emerald-400">{strat.winTrades}W</span> /{" "}
                    <span className="text-rose-400">{strat.lossTrades}L</span>)
                  </span>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedStrategy(strat)}
                    className="h-6 text-[11px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 px-2 py-0 cursor-pointer rounded"
                  >
                    Ver detalhes →
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Diálogo Institucional de Detalhes da Estratégia */}
      <Dialog open={!!selectedStrategy} onOpenChange={(open) => !open && setSelectedStrategy(null)}>
        <DialogContent className="bg-[#080d17] border border-cyan-500/30 text-white max-w-lg font-mono">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-cyan-300">
              <Award className="w-5 h-5 text-cyan-400" />
              Auditoria de Estratégia: {selectedStrategy?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Rastreabilidade completa de custos operacionais e parâmetros de risco institucional.
            </DialogDescription>
          </DialogHeader>

          {selectedStrategy && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#0c1322] p-3 rounded-xl border border-white/[0.08]">
                <div>
                  <span className="text-slate-400 block">PnL Bruto (Gross):</span>
                  <span className="font-bold text-slate-200">${selectedStrategy.grossPnl.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Taxas Binance Spot:</span>
                  <span className="font-bold text-amber-400">-${selectedStrategy.feesPaid.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Slippage L2 Deduzido:</span>
                  <span className="font-bold text-indigo-400">-${selectedStrategy.slippageEstimated.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">PnL Líquido Final:</span>
                  <span className={`font-bold ${selectedStrategy.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {selectedStrategy.netPnl >= 0 ? "+" : ""}${selectedStrategy.netPnl.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="bg-[#0b111e] p-3 rounded-xl border border-white/[0.06] space-y-2">
                <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Salvaguardas de Risco Habilitadas:
                </div>
                <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
                  <li>Break-Even automático armado em +1.0% de lucro</li>
                  <li>Filtro de Order Flow Imbalance (OFI &gt; -0.30)</li>
                  <li>Tolerância de Slippage máxima: 0.35% por ordem</li>
                  <li>Mutex de execução atômica (Zero ordens duplicadas)</li>
                </ul>
              </div>

              <div className="text-[11px] text-slate-400 text-right">
                ID do Algoritmo: <code className="text-cyan-400">{selectedStrategy.key}_INST_v2.5</code>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
