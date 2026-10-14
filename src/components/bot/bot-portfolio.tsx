"use client";

import { useEffect, useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Zap,
  ShieldAlert,
  Bot,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  liquidateWalletPosition,
  adoptOrphanPositionWithBot,
  startAiExitBotForAsset,
} from "@/lib/bot/multi-bot-engine";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useShallow } from "zustand/react/shallow";

interface PortfolioHistoryPoint {
  time: string;
  value: number;
}

export function BotPortfolio() {
  const { portfolio, botConfig, trades, botActive, tickers, tradingMode, bots } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      botConfig: s.botConfig,
      trades: s.trades,
      botActive: s.botActive,
      tickers: s.tickers,
      tradingMode: s.tradingMode,
      bots: s.bots,
    }))
  );
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [liquidatingSymbol, setLiquidatingSymbol] = useState<string | null>(null);
  const [isLiquidatingAll, setIsLiquidatingAll] = useState(false);
  const { toast } = useToast();

  const dailyChange = useMemo(() => {
    const initial = botConfig.initialBalance;
    const current = portfolio.totalValue;
    const change = current - initial;
    const changePercent = initial > 0 ? (change / initial) * 100 : 0;
    return { value: change, percent: changePercent };
  }, [portfolio.totalValue, botConfig.initialBalance]);

  const todayTrades = trades.filter((t) => {
    const tradeDate = new Date(t.timestamp).toDateString();
    const today = new Date().toDateString();
    return tradeDate === today;
  });

  const pnlIsPositive = portfolio.pnl >= 0;

  const forceSync = async () => {
    setIsSyncing(true);
    try {
      const state = useCryptoStore.getState();
      const mode = state.tradingMode;
      const res = await fetch(`/api/account?mode=${mode}`);
      const result = await res.json();
      if (res.ok && result.success && result.data) {
        state.setAccount(result.data);
        toast({
          title: "Sincronização Concluída",
          description: `Os dados da conta (${mode === "live" ? "Real" : "Simulado"}) foram atualizados.`,
        });
      } else {
        toast({
          title: "Erro de Sincronização",
          description: result.error || "Não foi possível sincronizar os dados da conta.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Erro de Sincronização",
        description: e.message || "Ocorreu um erro ao sincronizar.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Track portfolio history (last 20 data points)
  useEffect(() => {
    if (!botActive) return;

    const interval = setInterval(() => {
      const currentPortfolio = useCryptoStore.getState().portfolio;
      const now = new Date();
      const timeLabel = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      setPortfolioHistory((prev) => {
        const newHistory = [
          ...prev,
          { time: timeLabel, value: currentPortfolio.totalValue },
        ];
        // Keep last 20 data points
        return newHistory.slice(-20);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [botActive]);

  // Sincronização automática contínua do portfólio com a Binance em tempo real
  useEffect(() => {
    let mounted = true;
    const syncAccount = async () => {
      try {
        const state = useCryptoStore.getState();
        const mode = state.tradingMode;
        const res = await fetch(`/api/account?mode=${mode}`);
        if (res.ok) {
          const result = await res.json();
          if (mounted && result.success && result.data) {
            state.setAccount(result.data);
          }
        }
      } catch {}
    };

    syncAccount();
    const interval = setInterval(syncAccount, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tradingMode]);

  const orphanPositions = useMemo(() => {
    const list = portfolio.positions ?? [];
    return list.filter((p) => {
      return !bots.some((b) => b.active && ((b.position && b.position.symbol === p.symbol) || b.symbol === p.symbol));
    });
  }, [portfolio.positions, bots]);

  const handleLiquidateSingle = async (symbol: string) => {
    setLiquidatingSymbol(symbol);
    try {
      await liquidateWalletPosition(symbol, {
        onToast: (t) => toast(t),
      });
    } finally {
      setLiquidatingSymbol(null);
    }
  };

  const handleAdoptSingle = (symbol: string) => {
    adoptOrphanPositionWithBot(symbol, {
      onToast: (t) => toast(t),
    });
  };

  const handleStartAiExit = async (symbol: string) => {
    await startAiExitBotForAsset(symbol, {
      onToast: (t) => toast(t),
    });
  };

  const handleStartAllAiExit = async () => {
    if (orphanPositions.length === 0) return;
    for (const pos of orphanPositions) {
      await startAiExitBotForAsset(pos.symbol, {
        onToast: (t) => toast(t),
      });
    }
  };

  const handleLiquidateAllOrphans = async () => {
    if (orphanPositions.length === 0) return;
    setIsLiquidatingAll(true);
    try {
      for (const pos of orphanPositions) {
        await liquidateWalletPosition(pos.symbol, {
          onToast: (t) => toast(t),
        });
      }
    } finally {
      setIsLiquidatingAll(false);
    }
  };

  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border relative overflow-hidden">
      {/* Gradient border effect */}
      <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-crypto-cyan/20 via-crypto-green/20 to-crypto-gold/20 pointer-events-none" />
      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="w-4 h-4 text-crypto-cyan" />
            Status do Portfólio
            {botActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-pulse ml-1" />
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[10px] font-medium border-border/50 hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5"
            onClick={forceSync}
            disabled={isSyncing}
            title="Forçar Sincronização"
          >
            <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
            Sincronizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 relative">
        {/* Total Balance */}
        <div className="bg-secondary/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Saldo Atual</span>
            </div>
            {/* Daily Change Indicator */}
            <div
              className={`flex items-center gap-1 text-xs font-medium ${
                dailyChange.value >= 0 ? "text-crypto-green" : "text-crypto-red"
              }`}
            >
              {dailyChange.value >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>
                {dailyChange.value >= 0 ? "+" : ""}${formatPrice(Math.abs(dailyChange.value))}
              </span>
              <span className="opacity-75">
                ({dailyChange.percent >= 0 ? "+" : ""}
                {dailyChange.percent.toFixed(2)}%)
              </span>
            </div>
          </div>
          <motion.div
            key={portfolio.totalValue}
            initial={{ scale: 1.03 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-2xl font-bold tracking-tight"
          >
            ${formatPrice(portfolio.totalValue)}
          </motion.div>
        </div>

        {/* Mini Line Chart */}
        {portfolioHistory.length > 1 && (
          <div className="bg-secondary/20 rounded-lg p-3 relative">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-crypto-cyan/5 to-transparent pointer-events-none" />
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={portfolioHistory}>
                <XAxis dataKey="time" hide />
                <YAxis
                  domain={["dataMin - 10", "dataMax + 10"]}
                  hide
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(20, 20, 30, 0.9)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: "#e2e8f0",
                  }}
                  formatter={(value: number) => [`$${formatPrice(value)}`, "Portfólio"]}
                  labelFormatter={(label: string) => `Hora: ${label}`}
                />
                <ReferenceLine
                  y={botConfig.initialBalance}
                  stroke="rgba(100, 116, 139, 0.4)"
                  strokeDasharray="3 3"
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={pnlIsPositive ? "#22c55e" : "#ef4444"}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 3,
                    fill: pnlIsPositive ? "#22c55e" : "#ef4444",
                    stroke: "none",
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Cash & Assets */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 relative">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Caixa
            </span>
            <motion.div
              key={portfolio.cashBalance}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-sm font-medium"
            >
              ${formatPrice(portfolio.cashBalance)}
            </motion.div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Ativos
            </span>
            <motion.div
              key={portfolio.assetBalance}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-sm font-medium"
            >
              ${formatPrice(portfolio.assetBalance)}
            </motion.div>
          </div>
        </div>

        {/* Unrealized PnL */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {pnlIsPositive ? (
              <TrendingUp className="w-4 h-4 text-crypto-green" />
            ) : (
              <TrendingDown className="w-4 h-4 text-crypto-red" />
            )}
            <span className="text-xs text-muted-foreground">L/P Não Realizado</span>
          </div>
          <div className="flex items-center gap-2">
            <motion.span
              key={portfolio.pnl}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`text-sm font-semibold ${
                pnlIsPositive ? "text-crypto-green" : "text-crypto-red"
              }`}
            >
              {pnlIsPositive ? "+" : ""}${formatPrice(Math.abs(portfolio.pnl))}
            </motion.span>
            <Badge
              className={`text-[10px] ${
                pnlIsPositive
                  ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                  : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
              }`}
            >
              {pnlIsPositive ? "+" : ""}
              {portfolio.pnlPercent.toFixed(2)}%
            </Badge>
          </div>
        </div>

        {/* Daily Trades */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Trades Diários</span>
            </div>
            <span className="text-xs font-medium">
              {todayTrades.length}/{botConfig.maxDailyTrades}
            </span>
          </div>
          <Progress
            value={(todayTrades.length / botConfig.maxDailyTrades) * 100}
            className="h-1.5"
          />
        </div>

        {/* Multi-Asset Holdings Across All Simultaneous Bots */}
        {((portfolio.positions && portfolio.positions.length > 0) || portfolio.assetQuantity > 0) && (
          <div className="bg-secondary/30 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">
                Posições em Carteira ({portfolio.positions?.length || (portfolio.assetQuantity > 0 ? 1 : 0)})
              </span>
              {orphanPositions.length > 0 && (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={handleStartAllAiExit}
                    className="h-5 px-2 text-[10px] font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white cursor-pointer shadow-sm border-0 flex items-center gap-1"
                    title="Iniciar robôs com IA para vender todos os ativos órfãos no melhor momento"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                    Saída por IA ({orphanPositions.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleLiquidateAllOrphans}
                    disabled={isLiquidatingAll || liquidatingSymbol !== null}
                    className="h-5 px-1.5 text-[10px] font-semibold bg-rose-600/80 hover:bg-rose-700 text-white cursor-pointer shadow-sm"
                    title="Vender a mercado todos os ativos órfãos imediatamente"
                  >
                    <Zap className="w-2.5 h-2.5 mr-0.5" />
                    {isLiquidatingAll ? "..." : `Liquidar`}
                  </Button>
                </div>
              )}
            </div>

            {portfolio.positions && portfolio.positions.length > 0 ? (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {portfolio.positions.map((pos) => {
                  const symClean = pos.symbol.replace("USDT", "");
                  const pnl = pos.unrealizedPnl || 0;
                  const managingBot = bots.find(
                    (b) => b.active && ((b.position && b.position.symbol === pos.symbol) || b.symbol === pos.symbol)
                  );
                  const isOrphan = !managingBot;
                  const isAiManaging = Boolean(
                    managingBot?.active && (managingBot?.useAiExit || managingBot?.strategy === "AI")
                  );
                  const isThisLiquidating = liquidatingSymbol === pos.symbol;

                  return (
                    <div
                      key={pos.symbol}
                      className={cn(
                        "text-xs p-2.5 rounded-md border transition-all space-y-2",
                        isAiManaging
                          ? "bg-purple-950/20 border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.1)]"
                          : isOrphan
                          ? "bg-amber-500/10 border-amber-500/30"
                          : "bg-secondary/40 border-border/20"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-foreground">{symClean}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            ({pos.quantity.toFixed(4)})
                          </span>
                          {isAiManaging ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 border-purple-500/50 text-purple-300 bg-purple-500/20 flex items-center gap-1 animate-pulse"
                              title="A IA está analisando fluxo e indicadores para vender este ativo no pico de lucro"
                            >
                              <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                              Saída por IA Ativa
                            </Badge>
                          ) : isOrphan ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-400 bg-amber-500/10 flex items-center gap-0.5"
                            >
                              <ShieldAlert className="w-2.5 h-2.5" />
                              Sem Robô
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 flex items-center gap-0.5"
                            >
                              <Bot className="w-2.5 h-2.5" />
                              {managingBot.name.replace(/Bot\s*/i, "").slice(0, 14)}
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold font-mono">${formatPrice(pos.marketValue)}</div>
                          <div
                            className={`text-[10px] font-mono ${
                              pnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                            }`}
                          >
                            {pnl >= 0 ? "+" : ""}${formatPrice(Math.abs(pnl))}
                          </div>
                        </div>
                      </div>

                      {/* Ações Inteligentes para a Posição */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
                        {isAiManaging ? (
                          <>
                            <div className="flex-1 text-[10px] text-purple-300 flex items-center gap-1 font-medium">
                              <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                              <span className="truncate">IA rastreando pico para vender no lucro</span>
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleLiquidateSingle(pos.symbol)}
                              disabled={isThisLiquidating || isLiquidatingAll}
                              className="h-6 px-2 text-[10px] font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shrink-0"
                              title="Encerrar agora a mercado na Binance sem esperar a IA"
                            >
                              <Zap className="w-2.5 h-2.5 mr-1" />
                              {isThisLiquidating ? "..." : "Vender Agora"}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleStartAiExit(pos.symbol)}
                              disabled={isThisLiquidating || isLiquidatingAll}
                              className="h-6.5 flex-1 text-[10px] font-semibold bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-sm cursor-pointer border-0 flex items-center justify-center gap-1"
                              title="Inicia robô com Inteligência Artificial para vender este ativo no melhor momento"
                            >
                              <Sparkles className="w-3 h-3 text-amber-300" />
                              Iniciar Bot (Venda por IA)
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleLiquidateSingle(pos.symbol)}
                              disabled={isThisLiquidating || isLiquidatingAll}
                              className="h-6.5 px-2 text-[10px] font-medium border-rose-500/40 text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                              title="Vender a mercado imediatamente na Binance"
                            >
                              <Zap className="w-2.5 h-2.5 mr-0.5" />
                              {isThisLiquidating ? "..." : "Vender"}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {botConfig.symbol.replace("USDT", "")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {portfolio.assetQuantity.toFixed(6)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
