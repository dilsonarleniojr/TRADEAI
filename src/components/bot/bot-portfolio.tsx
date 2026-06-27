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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface PortfolioHistoryPoint {
  time: string;
  value: number;
}

export function BotPortfolio() {
  const { portfolio, botConfig, trades, botActive, tickers } = useCryptoStore();
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
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
      const res = await fetch(`/api/account?mode=${mode}`, {
        headers: {
          'x-binance-api-key': state.binanceApiKey || '',
          'x-binance-api-secret': state.binanceApiSecret || '',
          'x-binance-testnet': state.binanceTestnet ? 'true' : 'false'
        }
      });
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

        {/* Asset Holdings */}
        {portfolio.assetQuantity > 0 && (
          <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Posição em Ativos
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {botConfig.symbol.replace("USDT", "")}
              </span>
              <span className="text-sm text-muted-foreground">
                {portfolio.assetQuantity.toFixed(6)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
