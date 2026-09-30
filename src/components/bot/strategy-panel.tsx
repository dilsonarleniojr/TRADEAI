"use client";

import { useState, useMemo } from "react";
import { useCryptoStore, type TradeData } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  Grid,
  Calendar,
  Activity,
  Layers,
  Bot,
  Zap,
  Check,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STRATEGY_LIST = [
  { id: "AI", name: "AI Quant Engine", icon: Cpu, desc: "Algoritmos neurais baseados em confluência de sentimento, volume e fluxo de ordens." },
  { id: "GRID", name: "Grid Trading", icon: Grid, desc: "Compra/Venda automatizada em faixas de preço pré-configuradas (modo mercado lateral)." },
  { id: "DCA", name: "DCA (Dollar Cost)", icon: Calendar, desc: "Aportes periódicos com quantidade fixa para mitigar volatilidade de entrada." },
  { id: "BREAKOUT", name: "Volume Breakout", icon: Activity, desc: "Compra ao romper resistência de 20 períodos com volume confirmado, stop na mínima." },
  { id: "MEAN_REVERSION", name: "Bollinger Reversion", icon: Layers, desc: "Opera retorno à média comprando na banda inferior e vendendo na superior." },
  { id: "RSI", name: "RSI Oscillator", icon: Bot, desc: "Gera ordens de compra em sobrevenda (<30) e venda em sobrecompra (>70)." },
  { id: "MACD", name: "MACD Crossover", icon: Zap, desc: "Entradas e saídas baseadas no cruzamento da linha de sinal e histograma." },
];

export function StrategyPanel() {
  const { botConfig, setBotConfig, trades, botActive } = useCryptoStore();
  const [selectedId, setSelectedId] = useState<string>(botConfig.strategy);
  
  // Custom inputs state mapped to strategy config
  const [gridLower, setGridLower] = useState("50000");
  const [gridUpper, setGridUpper] = useState("90000");
  const [gridCount, setGridCount] = useState("5");
  const [dcaInterval, setDcaInterval] = useState("10");
  const [dcaAmount, setDcaAmount] = useState("100");
  const [breakoutVolumeMult, setBreakoutVolumeMult] = useState("1.5");
  const [bollingerPeriod, setBollingerPeriod] = useState("20");
  const [bollingerMult, setBollingerMult] = useState("2");
  const [aiMinConf, setAiMinConf] = useState("75");

  // Group trades by strategy to calculate P&L dynamically
  const strategyStats = useMemo(() => {
    const stats: Record<string, { pnl: number; count: number; wins: number }> = {};
    
    trades.forEach((t) => {
      const strat = t.strategy || "Manual";
      if (!stats[strat]) {
        stats[strat] = { pnl: 0, count: 0, wins: 0 };
      }
      stats[strat].count += 1;
      stats[strat].pnl += t.pnl;
      if (t.pnl > 0) {
        stats[strat].wins += 1;
      }
    });

    return stats;
  }, [trades]);

  const handleApplyStrategy = () => {
    // Save settings to store
    setBotConfig({
      ...botConfig,
      strategy: selectedId as any,
      rsiPeriod: selectedId === "RSI" ? 14 : botConfig.rsiPeriod,
      buyThreshold: selectedId === "RSI" ? 30 : botConfig.buyThreshold,
      sellThreshold: selectedId === "RSI" ? 70 : botConfig.sellThreshold,
      // Grid params
      gridLower: parseFloat(gridLower),
      gridUpper: parseFloat(gridUpper),
      gridCount: parseInt(gridCount),
      // DCA params
      dcaInterval: parseInt(dcaInterval),
      dcaAmount: parseFloat(dcaAmount),
      // Breakout/Bollinger params
      breakoutVolumeMultiplier: parseFloat(breakoutVolumeMult),
      bollingerPeriod: parseInt(bollingerPeriod),
      bollingerMultiplier: parseFloat(bollingerMult),
      signalConfidenceThreshold: parseFloat(aiMinConf),
    } as any);
  };

  return (
    <Card className="glass-card gradient-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sliders className="w-4 h-4 text-crypto-cyan" />
          Modo Pro: Estratégias
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Top: Strategy Selection & Config Form */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          
          {/* Strategy Tabs list */}
          <div className="md:col-span-5 space-y-2 max-h-[350px] overflow-y-auto pr-1 cyan-scrollbar">
            {STRATEGY_LIST.map((strat) => {
              const Icon = strat.icon;
              const isSelected = selectedId === strat.id;
              const activeRunning = botConfig.strategy === strat.id && botActive;

              return (
                <div
                  key={strat.id}
                  onClick={() => !botActive && setSelectedId(strat.id)}
                  className={cn(
                    "p-3 rounded-lg border transition-all duration-150 flex gap-3 items-center select-none",
                    botActive ? "opacity-65 cursor-not-allowed" : "cursor-pointer",
                    isSelected
                      ? "bg-crypto-cyan/10 border-crypto-cyan/40 shadow-sm"
                      : "bg-secondary/10 border-border/40 hover:bg-secondary/25"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-lg shrink-0",
                    isSelected ? "bg-crypto-cyan/20 text-crypto-cyan" : "bg-secondary/40 text-muted-foreground"
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">{strat.name}</span>
                      {activeRunning && (
                        <span className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-ping" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{strat.desc}</p>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-crypto-cyan shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* Configuration Form container */}
          <div className="md:col-span-7 p-4 rounded-xl bg-secondary/15 border border-border/40 min-h-[260px] flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-border/40 pb-2">
                <h4 className="text-xs font-bold text-foreground">
                  Configuração: {STRATEGY_LIST.find((s) => s.id === selectedId)?.name}
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {STRATEGY_LIST.find((s) => s.id === selectedId)?.desc}
                </p>
              </div>

              {/* Strategy Parameters Inputs */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {selectedId === "GRID" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Preço Inferior (USD)</label>
                      <Input type="number" value={gridLower} onChange={(e) => setGridLower(e.target.value)} className="h-8 font-mono text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Preço Superior (USD)</label>
                      <Input type="number" value={gridUpper} onChange={(e) => setGridUpper(e.target.value)} className="h-8 font-mono text-xs" />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] font-semibold text-muted-foreground">Quantidade de Grades (Linhas)</label>
                      <Input type="number" value={gridCount} onChange={(e) => setGridCount(e.target.value)} className="h-8 font-mono text-xs" />
                    </div>
                  </>
                )}

                {selectedId === "DCA" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Intervalo de Compra (Ticks)</label>
                      <Input type="number" value={dcaInterval} onChange={(e) => setDcaInterval(e.target.value)} className="h-8 font-mono text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Valor por Compra (USD)</label>
                      <Input type="number" value={dcaAmount} onChange={(e) => setDcaAmount(e.target.value)} className="h-8 font-mono text-xs" />
                    </div>
                  </>
                )}

                {selectedId === "BREAKOUT" && (
                  <>
                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] font-semibold text-muted-foreground">Multiplicador de Volume Mínimo</label>
                      <Input type="number" step="0.1" value={breakoutVolumeMult} onChange={(e) => setBreakoutVolumeMult(e.target.value)} className="h-8 font-mono text-xs" />
                      <p className="text-[9px] text-muted-foreground mt-1">Sinaliza compra se volume for X vezes maior que a média histórica.</p>
                    </div>
                  </>
                )}

                {selectedId === "MEAN_REVERSION" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Período Bollinger</label>
                      <Input type="number" value={bollingerPeriod} onChange={(e) => setBollingerPeriod(e.target.value)} className="h-8 font-mono text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Desvio Padrão (Multiplier)</label>
                      <Input type="number" value={bollingerMult} onChange={(e) => setBollingerMult(e.target.value)} className="h-8 font-mono text-xs" />
                    </div>
                  </>
                )}

                {selectedId === "AI" && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-semibold text-muted-foreground">Confiança Mínima do Sinal (%)</label>
                    <Input type="number" value={aiMinConf} onChange={(e) => setAiMinConf(e.target.value)} className="h-8 font-mono text-xs" />
                  </div>
                )}

                {(selectedId === "RSI" || selectedId === "MACD") && (
                  <div className="col-span-2 p-3 bg-secondary/35 rounded-lg border border-border/30 text-center text-muted-foreground text-[11px]">
                    <Info className="w-4 h-4 mx-auto mb-1.5 text-crypto-cyan" />
                    Esta estratégia utiliza os períodos e limiares padrão calculados automaticamente pelo Quant Engine.
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={handleApplyStrategy}
              disabled={botActive || botConfig.strategy === selectedId}
              className="w-full mt-4 bg-crypto-cyan hover:bg-crypto-cyan/80 text-black font-bold h-9 text-xs cursor-pointer shadow-md shadow-crypto-cyan/15"
            >
              {botConfig.strategy === selectedId ? "Estratégia Aplicada" : "Salvar Configurações"}
            </Button>
          </div>

        </div>

        {/* Bottom: Strategy performance telemetry */}
        <div className="border-t border-border/40 pt-4 space-y-3">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-crypto-cyan" />
            Performance por Estratégia (Trades Fechados)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {["AI", "GRID", "DCA", "BREAKOUT", "MEAN_REVERSION", "RSI", "MACD"].map((id) => {
              const stat = strategyStats[id] || { pnl: 0, count: 0, wins: 0 };
              const wr = stat.count > 0 ? (stat.wins / stat.count) * 100 : 0;
              const hasPnl = stat.pnl !== 0;
              const isPositive = stat.pnl >= 0;

              return (
                <div
                  key={id}
                  className={cn(
                    "p-2.5 rounded-lg border flex flex-col justify-between space-y-1.5 transition-all duration-150",
                    hasPnl
                      ? isPositive
                        ? "bg-crypto-green/5 border-crypto-green/20"
                        : "bg-crypto-red/5 border-crypto-red/20"
                      : "bg-secondary/10 border-border/30 opacity-70"
                  )}
                >
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-foreground">{id}</span>
                    <span className="text-muted-foreground font-mono">{stat.count}T</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground block leading-none">PnL Acumulado</span>
                    <span className={cn(
                      "text-xs font-bold font-mono",
                      stat.pnl > 0 ? "text-crypto-green" : stat.pnl < 0 ? "text-crypto-red" : "text-muted-foreground"
                    )}>
                      {stat.pnl > 0 ? "+" : ""}{hasPnl ? `$${formatPrice(stat.pnl)}` : "—"}
                    </span>
                  </div>
                  {stat.count > 0 && (
                    <div className="flex items-center justify-between text-[9px] font-semibold text-muted-foreground pt-1 border-t border-border/20">
                      <span>Win Rate</span>
                      <span className={wr >= 50 ? "text-crypto-green" : "text-crypto-red"}>
                        {wr.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

// Sliders helper to avoid compile issues
function Sliders({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="2" y1="14" x2="6" y2="14" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="18" y1="16" x2="22" y2="16" />
    </svg>
  );
}
