"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical,
  Play,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Percent,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import type { BotStrategy } from "@/lib/store/types";
import type { BacktestResult } from "@/lib/bot/backtest-engine";

interface BotBacktestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSymbol?: string;
  initialStrategy?: BotStrategy;
}

export function BotBacktestDialog({
  open,
  onOpenChange,
  initialSymbol = "BTCUSDT",
  initialStrategy = "QUANT_ENSEMBLE",
}: BotBacktestDialogProps) {
  const { toast } = useToast();

  const [symbol, setSymbol] = useState(initialSymbol);
  const [strategy, setStrategy] = useState<BotStrategy>(initialStrategy);
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [candleCount, setCandleCount] = useState<number>(500);
  const [allocation, setAllocation] = useState<number>(100);
  const [takeProfit, setTakeProfit] = useState<number>(2.5);
  const [stopLoss, setStopLoss] = useState<number>(1.2);
  const [trailingStop, setTrailingStop] = useState<boolean>(true);
  const [trailingDistance, setTrailingDistance] = useState<number>(0.6);

  const [isLoading, setIsLoading] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [calibrationData, setCalibrationData] = useState<any | null>(null);

  useEffect(() => {
    if (open) {
      if (initialSymbol) setSymbol(initialSymbol);
      if (initialStrategy) setStrategy(initialStrategy);
    }
  }, [open, initialSymbol, initialStrategy]);

  const handleRunBacktest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/bot/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          strategy,
          interval: timeframe,
          limit: candleCount,
          allocationAmount: allocation,
          takeProfit,
          stopLoss,
          trailingStop,
          trailingStopDistance: trailingDistance,
          mode: "simulate",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setResult(data.data);
        toast({
          title: "Backtest Concluído! 📊",
          description: `Simulação de ${data.candlesCount} velas executada com sucesso para ${symbol}.`,
        });
      } else {
        throw new Error(data.error || "Erro ao processar simulação de backtest.");
      }
    } catch (err: any) {
      toast({
        title: "Falha no Backtest",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalibrateParameters = async () => {
    setIsCalibrating(true);
    try {
      const res = await fetch("/api/bot/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          interval: timeframe,
          limit: candleCount,
          allocationAmount: allocation,
          mode: "calibrate",
          targetStrategy: strategy,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.data?.bestCandidate) {
        setCalibrationData(data.data);
        const best = data.data.bestCandidate;
        setTakeProfit(best.takeProfit);
        setStopLoss(best.stopLoss);
        setTrailingDistance(best.trailingStopDistance);
        if (best.strategy) setStrategy(best.strategy);

        toast({
          title: "Calibração Grid Search Concluída! 🎯",
          description: `Parâmetros ótimos aplicados: TP ${best.takeProfit}%, SL ${best.stopLoss}%, Chandelier ${best.trailingStopDistance}%. Sharpe: ${best.sharpeRatio.toFixed(2)}.`,
        });
        // Dispara simulação com os novos parâmetros
        setTimeout(() => handleRunBacktest(), 300);
      } else {
        throw new Error(data.error || "Nenhuma configuração estatisticamente superior foi encontrada.");
      }
    } catch (err: any) {
      toast({
        title: "Falha na Calibração",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsCalibrating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col bg-[#0a0f1d]/95 backdrop-blur-xl border border-white/[0.1] text-foreground p-6 shadow-2xl overflow-hidden">
        <DialogHeader className="border-b border-white/[0.08] pb-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  Backtesting Express & Validação Quantitativa
                  <Badge variant="outline" className="border-purple-500/40 text-purple-400 text-[10px]">
                    Pilar 3 Fricção Real
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Simule a estratégia candle a candle nos dados reais da Binance com modelagem de corretagem e slippage.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCalibrateParameters}
                disabled={isCalibrating || isLoading}
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/15 font-bold h-8 text-xs shadow-sm bg-amber-500/10 cursor-pointer"
                title="Testar grade de multiplicadores de ATR, Stop Loss e Take Profit para encontrar a configuração de maior Sharpe Ratio"
              >
                {isCalibrating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-amber-400" />
                    Otimizando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                    Calibrar Grid Search
                  </>
                )}
              </Button>

              <Button
                size="sm"
                onClick={handleRunBacktest}
                disabled={isLoading || isCalibrating}
                className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 text-white font-bold h-8 text-xs shadow-md shadow-purple-500/20 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Simulando...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                    Executar Backtest
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body: Left Parameters + Right Results */}
        <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
          {/* Banner de Calibração Recomendada */}
          {calibrationData?.bestCandidate && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-indigo-500/15 border border-amber-500/30 flex items-center justify-between text-xs animate-in fade-in">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Configuração Ótima Encontrada (Grid Search)
                  </span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] py-0 font-mono">
                    Sharpe: {calibrationData.bestCandidate.sharpeRatio.toFixed(2)} | Profit Factor: {calibrationData.bestCandidate.profitFactor.toFixed(2)}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Estratégia: <strong className="text-foreground">{calibrationData.bestCandidate.strategy}</strong> | Take Profit: <strong className="text-emerald-400">{calibrationData.bestCandidate.takeProfit}%</strong> | Stop Loss: <strong className="text-red-400">{calibrationData.bestCandidate.stopLoss}%</strong> | Chandelier: <strong className="text-cyan-400">{calibrationData.bestCandidate.trailingStopDistance}%</strong> | Max DD: <strong className="text-foreground">{calibrationData.bestCandidate.maxDrawdownPercent}%</strong>
                </p>
              </div>
              <Badge variant="outline" className="border-amber-400/50 text-amber-300 bg-amber-500/10 text-[10px] px-2 py-1 font-mono">
                Score: {calibrationData.bestCandidate.score}
              </Badge>
            </div>
          )}
          {/* Controls Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Par</Label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="h-8 text-xs font-mono font-bold bg-black/40 border-white/[0.1]"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Estratégia</Label>
              <Select value={strategy} onValueChange={(val: any) => setStrategy(val)}>
                <SelectTrigger className="h-8 text-xs bg-black/40 border-white/[0.1]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0e1628] border-white/[0.1] text-xs">
                  <SelectItem value="QUANT_ENSEMBLE">QUANT_ENSEMBLE</SelectItem>
                  <SelectItem value="RSI">RSI Reversal</SelectItem>
                  <SelectItem value="MOMENTUM">MOMENTUM Breakout</SelectItem>
                  <SelectItem value="ATR_BREAKOUT">ATR_BREAKOUT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="h-8 text-xs bg-black/40 border-white/[0.1]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0e1628] border-white/[0.1] text-xs">
                  <SelectItem value="5m">5 Minutos</SelectItem>
                  <SelectItem value="15m">15 Minutos (Recomendado)</SelectItem>
                  <SelectItem value="1h">1 Hora</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Amostra (Velas)</Label>
              <Select value={String(candleCount)} onValueChange={(val) => setCandleCount(Number(val))}>
                <SelectTrigger className="h-8 text-xs bg-black/40 border-white/[0.1]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0e1628] border-white/[0.1] text-xs">
                  <SelectItem value="250">250 Velas (~2,5 dias)</SelectItem>
                  <SelectItem value="500">500 Velas (~5 dias)</SelectItem>
                  <SelectItem value="1000">1.000 Velas (~10 dias)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Take Profit (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={takeProfit}
                onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 2.5)}
                className="h-8 text-xs font-mono bg-black/40 border-white/[0.1] text-emerald-400 font-bold"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Stop Loss (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={stopLoss}
                onChange={(e) => setStopLoss(parseFloat(e.target.value) || 1.2)}
                className="h-8 text-xs font-mono bg-black/40 border-white/[0.1] text-red-400 font-bold"
              />
            </div>
          </div>

          {/* Results Display */}
          {result ? (
            <div className="space-y-4">
              {/* Scorecards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[11px] text-muted-foreground">Retorno Líquido</span>
                  <div className={`text-base font-bold font-mono ${result.netProfitUsdt >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {result.netProfitUsdt >= 0 ? "+" : ""}${result.netProfitUsdt.toFixed(2)} USDT
                    <span className="text-[10px] ml-1 opacity-80">({result.totalReturnPercent}%)</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[11px] text-muted-foreground">Taxa de Acerto</span>
                  <div className="text-base font-bold font-mono text-cyan-400">
                    {result.metrics.winRate}%
                    <span className="text-[10px] ml-1 text-muted-foreground">
                      ({result.metrics.winTrades}W / {result.metrics.lossTrades}L)
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[11px] text-muted-foreground">Fator de Lucro</span>
                  <div className="text-base font-bold font-mono text-purple-400">
                    {result.metrics.profitFactor.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[11px] text-muted-foreground">Sharpe Ratio (Anual)</span>
                  <div className="text-base font-bold font-mono text-foreground">
                    {result.metrics.sharpeRatio.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[11px] text-muted-foreground">Payoff Ratio</span>
                  <div className="text-base font-bold font-mono text-emerald-400">
                    {result.metrics.payoffRatio.toFixed(2)}x
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <span className="text-[11px] text-muted-foreground">Drawdown Máximo</span>
                  <div className="text-base font-bold font-mono text-rose-400">
                    -{result.metrics.maxDrawdownPercent}%
                  </div>
                </div>
              </div>

              {/* Curva de Equity Visual (SVG limpo) */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                    Curva de Evolução do Patrimônio (Equity Curve)
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Inicial: ${result.initialCapital} USDT → Final: ${result.finalCapital} USDT
                  </span>
                </div>

                {result.equityCurve.length > 1 ? (
                  <div className="w-full h-36 flex items-end pt-4 pb-1 relative">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Linha de Base (Capital Inicial) */}
                      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" strokeWidth="0.75" />

                      {/* Curva de Equity */}
                      {(() => {
                        const minEq = Math.min(...result.equityCurve.map((p) => p.equity)) * 0.98;
                        const maxEq = Math.max(...result.equityCurve.map((p) => p.equity)) * 1.02;
                        const range = Math.max(0.1, maxEq - minEq);

                        const points = result.equityCurve
                          .map((p, idx) => {
                            const x = (idx / (result.equityCurve.length - 1)) * 100;
                            const y = 100 - ((p.equity - minEq) / range) * 100;
                            return `${x},${y}`;
                          })
                          .join(" ");

                        return (
                          <polyline
                            fill="none"
                            stroke={result.netProfitUsdt >= 0 ? "#10b981" : "#ef4444"}
                            strokeWidth="2"
                            points={points}
                          />
                        );
                      })()}
                    </svg>
                  </div>
                ) : (
                  <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">
                    Nenhum trade executado no período com os parâmetros selecionados.
                  </div>
                )}
              </div>

              {/* Lista dos Trades Simulados */}
              <div className="rounded-xl border border-white/[0.07] overflow-hidden text-xs">
                <div className="p-2.5 bg-white/[0.02] border-b border-white/[0.06] font-semibold text-muted-foreground flex items-center justify-between">
                  <span>Trades Simulados ({result.trades.length})</span>
                  <span className="text-[10px]">Modelagem com 0.075% de taxa e 0.05% de slippage</span>
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-white/[0.04]">
                  {result.trades.map((t) => (
                    <div key={t.id} className="p-2.5 flex items-center justify-between hover:bg-white/[0.01]">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-foreground">{t.id}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1 py-0 font-semibold ${
                              t.exitReason === "TAKE_PROFIT"
                                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                : t.exitReason === "STOP_LOSS"
                                  ? "border-red-500/40 text-red-400 bg-red-500/10"
                                  : "border-purple-500/40 text-purple-400 bg-purple-500/10"
                            }`}
                          >
                            {t.exitReason}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          Entrada: ${t.entryPrice} → Saída: ${t.exitPrice}
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className={`font-bold ${t.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {t.netPnl >= 0 ? "+" : ""}${t.netPnl.toFixed(2)} USDT
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center text-muted-foreground gap-2 border border-dashed border-white/[0.08] rounded-xl">
              <FlaskConical className="w-8 h-8 text-purple-400/80" />
              <span className="text-xs font-semibold text-foreground">Pronto para Simulação</span>
              <p className="text-[11px] text-muted-foreground text-center max-w-sm">
                Selecione o par, o timeframe e clique em &quot;Executar Backtest&quot; para analisar o Sharpe Ratio e a Curva de Lucro.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
