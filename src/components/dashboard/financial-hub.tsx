"use client";

import { useMemo, useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { DataSourceBadge, SyncModeBadge } from "@/components/ui/data-source-badge";
import {
  Wallet,
  ArrowUpDown,
  Bot,
  TrendingUp,
  TrendingDown,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  DollarSign,
  PieChart,
  History,
  BarChart3,
  Bell,
  BellRing,
  Plus,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useCountUp } from "@/hooks/use-count-up";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_SYMBOLS } from "@/lib/crypto-meta";

function AnimatedValue({ value, prefix = "", suffix = "", decimals = 2 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const animatedValue = useCountUp(value, 500, true);
  return (
    <span className="number-animate">
      {prefix}{decimals > 0 ? animatedValue.toFixed(decimals) : Math.round(animatedValue)}{suffix}
    </span>
  );
}

export function FinancialHub() {
  const { portfolio, trades, botActive, tickers, connectionStatus, tradingMode, setActiveSection, addAlert } = useCryptoStore();
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState("BTCUSDT");
  const [alertTargetPrice, setAlertTargetPrice] = useState("");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const handleCreateAlert = () => {
    const targetVal = parseFloat(alertTargetPrice);
    if (isNaN(targetVal) || targetVal <= 0) return;

    addAlert({
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: alertSymbol,
      targetPrice: targetVal,
      direction: alertDirection,
      currentPrice: tickers[alertSymbol]?.price || 0,
      isTriggered: false,
      createdAt: new Date().toISOString(),
      type: "price",
    });

    setAlertTargetPrice("");
    setAlertDialogOpen(false);
  };

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

  // P&L calculations (authoritative backend source of truth)
  const realizedPnl = portfolio.realizedPnl ?? 0;
  const unrealizedPnl = portfolio.unrealizedPnl ?? 0;

  // Recent trades (last 5)
  const recentTrades = useMemo(() => trades.slice(0, 5), [trades]);

  // Best performer
  const tickerValues = Object.values(tickers);
  const bestPerformer = tickerValues.length > 0
    ? tickerValues.reduce((best, t) =>
        t.priceChangePercent > best.priceChangePercent ? t : best
      )
    : null;

  const todayTrades = trades.length;
  const isPositive = portfolio.pnl >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan gradient-border overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-crypto-cyan/20 to-crypto-green/10 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-crypto-cyan" />
              </div>
              Financial Hub
            </CardTitle>
            <div className="flex items-center gap-2">
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
              <DataSourceBadge />
              <SyncModeBadge />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Top Row: 4 stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Saldo */}
            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 card-accent-cyan">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-md bg-crypto-cyan/10">
                  <Wallet className="w-3.5 h-3.5 text-crypto-cyan" />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Saldo Total
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight leading-none mb-1">
                <AnimatedValue value={portfolio.totalValue} prefix="$" decimals={2} />
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  Cash: ${formatPrice(portfolio.cashBalance)}
                </span>
                <span className="text-muted-foreground">
                  Ativos: ${formatPrice(portfolio.assetBalance)}
                </span>
              </div>
            </div>

            {/* Card 2: P&L Total */}
            <div className={cn(
              "p-3 rounded-lg bg-secondary/30 border border-border/50",
              isPositive ? "card-accent-green" : "card-accent-red"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-md", isPositive ? "bg-crypto-green/10" : "bg-crypto-red/10")}>
                  {isPositive ? (
                    <TrendingUp className="w-3.5 h-3.5 text-crypto-green" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-crypto-red" />
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  P&L Total
                </span>
              </div>
              <p className={cn(
                "text-xl font-bold tracking-tight leading-none mb-1",
                isPositive ? "gradient-text-green" : "text-crypto-red"
              )}>
                {isPositive ? "+" : ""}${formatPrice(Math.abs(portfolio.pnl))}
              </p>
              <span className={cn(
                "text-xs font-semibold",
                isPositive ? "text-crypto-green" : "text-crypto-red"
              )}>
                {formatPercent(portfolio.pnlPercent)}
              </span>
            </div>

            {/* Card 3: Realizado vs Não Realizado */}
            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 card-accent-gold">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-md bg-crypto-gold/10">
                  <PieChart className="w-3.5 h-3.5 text-crypto-gold" />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  P&L Breakdown
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Realizado</span>
                  <span className={cn(
                    "text-xs font-bold",
                    realizedPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                  )}>
                    {realizedPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(realizedPnl))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Não Realizado</span>
                  <span className={cn(
                    "text-xs font-bold",
                    unrealizedPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
                  )}>
                    {unrealizedPnl >= 0 ? "+" : ""}${formatPrice(Math.abs(unrealizedPnl))}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4: Trades Hoje + Bot */}
            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  "p-1.5 rounded-md",
                  botActive ? "bg-crypto-green/10" : "bg-secondary"
                )}>
                  <ArrowUpDown className="w-3.5 h-3.5 text-crypto-gold" />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Atividade
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight leading-none mb-1">
                {todayTrades}
                <span className="text-xs text-muted-foreground font-normal ml-1">trades</span>
              </p>
              <div className="flex items-center gap-2">
                {botActive ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-crypto-green">
                    <span className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-pulse" />
                    Bot Ativo
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Bot Inativo</span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {trades.filter((t) => t.pnl > 0).length}W / {trades.filter((t) => t.pnl < 0).length}L
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Row: Recent Trades */}
          {recentTrades.length > 0 && (
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Trades Recentes
                  </span>
                </div>
                <span className="text-[9px] text-muted-foreground">
                  Últimos {recentTrades.length}
                </span>
              </div>
              <div className="space-y-1">
                {recentTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between py-1 px-2 rounded-md hover:bg-secondary/30 transition-colors text-[11px] font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-bold",
                        trade.side === "BUY"
                          ? "bg-crypto-green/10 text-crypto-green"
                          : "bg-crypto-red/10 text-crypto-red"
                      )}>
                        {trade.side}
                      </span>
                      <span className="text-foreground">{trade.symbol.replace("USDT", "")}</span>
                      <span className="text-muted-foreground">{trade.quantity.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">${formatPrice(trade.price)}</span>
                      <span className={cn(
                        "font-semibold min-w-[60px] text-right",
                        trade.pnl > 0 ? "text-crypto-green" : trade.pnl < 0 ? "text-crypto-red" : "text-muted-foreground"
                      )}>
                        {trade.pnl !== 0 ? `${trade.pnl > 0 ? "+" : ""}$${formatPrice(Math.abs(trade.pnl))}` : "—"}
                      </span>
                      {/* Strategy badge */}
                      <span className={cn(
                        "px-1 py-0.5 rounded text-[8px]",
                        trade.strategy === "AI" ? "bg-purple-500/10 text-purple-400" :
                        trade.strategy === "RSI" || trade.strategy === "MACD" ? "bg-crypto-cyan/10 text-crypto-cyan" :
                        "bg-secondary text-muted-foreground"
                      )}>
                        {trade.strategy === "AI" ? "🤖 IA" :
                         trade.strategy === "Manual" ? "👤" :
                         `⚙️ ${trade.strategy}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions Row */}
          <div className="flex flex-wrap gap-2 border-t border-border/30 pt-3 flex-row justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveSection("chart")}
              className="h-8 text-[11px] font-semibold border-crypto-green/30 text-crypto-green hover:bg-crypto-green/10 cursor-pointer flex items-center gap-1"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Comprar / Vender
            </Button>

            <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const activeTicker = tickers[alertSymbol];
                    if (activeTicker) {
                      setAlertTargetPrice(activeTicker.price.toFixed(2));
                    }
                  }}
                  className="h-8 text-[11px] font-semibold border-crypto-gold/30 text-crypto-gold hover:bg-crypto-gold/10 cursor-pointer flex items-center gap-1"
                >
                  <Bell className="w-3.5 h-3.5" />
                  Criar Alerta
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-background border-border sm:max-w-md glass">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <BellRing className="w-5 h-5 text-crypto-gold" />
                    Criar Alerta Rápido
                  </DialogTitle>
                  <DialogDescription>
                    Configure um gatilho de preço para receber notificações instantâneas.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Símbolo</label>
                    <Select value={alertSymbol} onValueChange={(val) => {
                      setAlertSymbol(val);
                      const t = tickers[val];
                      if (t) setAlertTargetPrice(t.price.toFixed(2));
                    }}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px] overflow-y-auto">
                        {ALL_SYMBOLS.map((sym) => (
                          <SelectItem key={sym} value={sym}>
                            {sym.replace("USDT", "")}/USDT
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">Direção</label>
                      <Select value={alertDirection} onValueChange={(val) => setAlertDirection(val as any)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="above">Acima de</SelectItem>
                          <SelectItem value="below">Abaixo de</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">Preço Alvo (USD)</label>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={alertTargetPrice}
                        onChange={(e) => setAlertTargetPrice(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setAlertDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateAlert}
                    className="bg-crypto-gold text-black hover:bg-crypto-gold/80 font-bold cursor-pointer"
                  >
                    Confirmar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveSection("chart")}
              className="h-8 text-[11px] font-semibold border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/10 cursor-pointer flex items-center gap-1"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Gráfico Avançado
            </Button>
          </div>

          {/* Gradient line at bottom */}
          <div className="h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        </CardContent>
      </Card>
    </motion.div>
  );
}
