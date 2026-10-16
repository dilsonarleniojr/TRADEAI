"use client";

import { useState, useMemo, useEffect } from "react";
import { useCryptoStore, type BotInstance, type TradeData } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { formatPrice, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Bot,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  Percent,
  RotateCcw,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Trophy,
  Award,
  Sparkles,
  Play,
  Pause,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  calculateBotProfitabilityScore,
  rotateFleetWithTopScanner,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
} from "@/lib/bot/multi-bot-engine";

interface BotRowData {
  bot: BotInstance;
  tradesCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: TradeData[];
  hasPosition: boolean;
  unrealizedPnl: number;
  profitScore: number;
  rank: number;
  recommendation: "CHAMPION" | "PROFITABLE" | "NEUTRAL" | "DEFICIT";
}

export function BotPnLRegistry() {
  const {
    bots,
    trades,
    tradingMode,
    activateTopProfitableBots,
    pauseDeficitBots,
    toggleBotActive,
    setOpenBinanceScannerModal,
    fleetAutoRotationEnabled,
    setFleetAutoRotationEnabled,
  } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      trades: s.trades,
      tradingMode: s.tradingMode,
      activateTopProfitableBots: s.activateTopProfitableBots,
      pauseDeficitBots: s.pauseDeficitBots,
      toggleBotActive: s.toggleBotActive,
      setOpenBinanceScannerModal: s.setOpenBinanceScannerModal,
      fleetAutoRotationEnabled: s.fleetAutoRotationEnabled,
      setFleetAutoRotationEnabled: s.setFleetAutoRotationEnabled,
    }))
  );

  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "top_ranked" | "profit" | "loss" | "in_position" | "active">("all");
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [cbStatus, setCbStatus] = useState(() => getCircuitBreakerStatus());

  // Polling periódico do status do circuit breaker para manter a UI em sincronia imediata
  useEffect(() => {
    const checkCb = () => {
      setCbStatus(getCircuitBreakerStatus());
    };
    const interval = setInterval(checkCb, 2000);
    return () => clearInterval(interval);
  }, []);

  // Computa as informações de Lucro e Perda para cada robô com Score Institucional de Lucratividade
  const botRows: BotRowData[] = useMemo(() => {
    const raw = bots.map((bot) => {
      // Trades vinculados a este robô
      const botTrades = trades.filter(
        (t) =>
          t.botId === bot.id ||
          (t.botName && t.botName === bot.name) ||
          (!t.botId && t.symbol === bot.symbol)
      );

      // Trades fechados (com PnL apurado ou SELL)
      const closedTrades = botTrades.filter((t) => typeof t.pnl === "number" && t.pnl !== 0);

      let grossProfit = 0;
      let grossLoss = 0;
      let winCount = 0;
      let lossCount = 0;

      closedTrades.forEach((t) => {
        const pnl = t.netPnl ?? t.pnl;
        if (pnl > 0) {
          grossProfit += pnl;
          winCount++;
        } else if (pnl < 0) {
          grossLoss += Math.abs(pnl);
          lossCount++;
        }
      });

      // Se não há trades no array global (ou após limpeza), usa os acumuladores de bot.stats
      if (closedTrades.length === 0 && bot.stats) {
        winCount = bot.stats.winTrades || 0;
        lossCount = bot.stats.lossTrades || 0;
        const statPnl = bot.stats.realizedPnl || 0;
        if (statPnl > 0) grossProfit = statPnl;
        else if (statPnl < 0) grossLoss = Math.abs(statPnl);
      }

      const totalClosed = winCount + lossCount;
      const netPnl = grossProfit - grossLoss;
      const winRate = totalClosed > 0 ? (winCount / totalClosed) * 100 : (bot.stats?.winRate ?? 100);
      const avgWin = winCount > 0 ? grossProfit / winCount : 0;
      const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.9 : 0);

      const hasPosition = !!bot.position && bot.position.quantity > 0;
      const unrealizedPnl = bot.position?.unrealizedPnl || 0;
      const profitScore = calculateBotProfitabilityScore(bot);

      return {
        bot,
        tradesCount: totalClosed,
        winCount,
        lossCount,
        winRate,
        grossProfit,
        grossLoss,
        netPnl,
        avgWin,
        avgLoss,
        profitFactor,
        trades: botTrades,
        hasPosition,
        unrealizedPnl,
        profitScore,
      };
    });

    // Ordena cópia por profitScore decrescente para determinar o ranking institucional
    const sorted = [...raw].sort((a, b) => b.profitScore - a.profitScore);
    const rankMap = new Map<string, number>();
    sorted.forEach((item, index) => {
      rankMap.set(item.bot.id, index + 1);
    });

    return raw.map((r) => {
      const rank = rankMap.get(r.bot.id) || 99;
      let recommendation: "CHAMPION" | "PROFITABLE" | "NEUTRAL" | "DEFICIT" = "NEUTRAL";
      if (rank === 1 && (r.netPnl > 0 || r.unrealizedPnl > 0)) {
        recommendation = "CHAMPION";
      } else if (r.netPnl > 0 || (r.hasPosition && r.unrealizedPnl > 0) || (r.profitFactor >= 1.5 && r.winCount > 0)) {
        recommendation = "PROFITABLE";
      } else if (r.netPnl < -0.10 && r.lossCount > r.winCount) {
        recommendation = "DEFICIT";
      }

      return {
        ...r,
        rank,
        recommendation,
      };
    });
  }, [bots, trades]);

  // Top 3 Robôs Mais Lucrativos para Sugestão Institucional
  const topChampions = useMemo(() => {
    return [...botRows]
      .filter((r) => r.recommendation !== "DEFICIT")
      .sort((a, b) => b.profitScore - a.profitScore)
      .slice(0, 3);
  }, [botRows]);

  const handleActivateProfitable = () => {
    const res = activateTopProfitableBots(5);
    toast({
      title: "🏆 Frota Otimizada por Lucratividade",
      description: res.activated.length > 0
        ? `${res.activated.length} robô(s) lucrativos priorizados. Robôs em prejuízo foram pausados.`
        : "Os robôs mais lucrativos já estão selecionados e operando.",
    });
  };

  const handlePauseDeficit = () => {
    const res = pauseDeficitBots();
    toast({
      title: res.pausedCount > 0 ? "🛡️ Robôs Deficitários Pausados" : "Nenhum Robô Deficitário Ativo",
      description: res.pausedCount > 0
        ? `${res.pausedCount} robô(s) em prejuízo foram pausados imediatamente (${res.pausedNames.join(", ")}).`
        : "Todos os robôs em prejuízo já estão pausados ou em quarentena.",
      variant: res.pausedCount > 0 ? "destructive" : "default",
    });
  };

  const handleManualRotation = async () => {
    setIsRotating(true);
    try {
      const res = await rotateFleetWithTopScanner(5);
      if (res.rotatedCount > 0) {
        toast({
          title: "🔄 Frota Rotacionada com Sucesso",
          description: `${res.rotatedCount} robô(s) ociosos foram atualizados para os pares líderes da Binance: ${res.newPairs.join(", ")}.`,
        });
      } else {
        toast({
          title: "Frota Já Atualizada",
          description: "Os robôs ativos já estão operando os melhores pares ou possuem operações abertas em andamento.",
        });
      }
    } finally {
      setIsRotating(false);
    }
  };

  const handleResetKillSwitch = async () => {
    try {
      resetCircuitBreaker();
      setCbStatus(getCircuitBreakerStatus());
      fetch("/api/bot/circuit-breaker", { method: "POST" }).catch(() => {});
      toast({
        title: "🛡️ Circuit Breakers Destravados",
        description: "Os limites diários e cooldowns de proteção foram zerados. Robôs reativados e operando normalmente.",
      });
    } catch {
      toast({
        title: "Erro ao destravar",
        description: "Não foi possível reiniciar o circuit breaker.",
        variant: "destructive",
      });
    }
  };

  // Totais consolidados da frota
  const summary = useMemo(() => {
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let botsInProfit = 0;
    let botsInLoss = 0;

    botRows.forEach((r) => {
      totalGrossProfit += r.grossProfit;
      totalGrossLoss += r.grossLoss;
      totalWins += r.winCount;
      totalLosses += r.lossCount;
      if (r.netPnl > 0) botsInProfit++;
      else if (r.netPnl < 0) botsInLoss++;
    });

    const netPnl = totalGrossProfit - totalGrossLoss;
    const totalTrades = totalWins + totalLosses;
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 100;

    return {
      totalGrossProfit,
      totalGrossLoss,
      netPnl,
      totalWins,
      totalLosses,
      totalTrades,
      winRate,
      botsInProfit,
      botsInLoss,
      totalBots: botRows.length,
    };
  }, [botRows]);

  // Filtros de listagem
  const filteredRows = useMemo(() => {
    const list = botRows.filter((r) => {
      const q = search.toLowerCase().trim();
      if (q) {
        const matchName = r.bot.name.toLowerCase().includes(q);
        const matchSymbol = r.bot.symbol.toLowerCase().includes(q);
        const matchStrategy = r.bot.strategy.toLowerCase().includes(q);
        if (!matchName && !matchSymbol && !matchStrategy) return false;
      }

      if (filter === "profit" && r.netPnl <= 0) return false;
      if (filter === "loss" && r.netPnl >= 0) return false;
      if (filter === "in_position" && !r.hasPosition) return false;
      if (filter === "active" && !r.bot.active) return false;
      if (filter === "top_ranked" && (r.recommendation === "DEFICIT" || r.netPnl < 0)) return false;

      return true;
    });

    if (filter === "top_ranked") {
      return [...list].sort((a, b) => b.profitScore - a.profitScore);
    }

    return list;
  }, [botRows, search, filter]);

  // Exportar dados do registro para CSV
  const handleExportCSV = () => {
    if (botRows.length === 0) {
      toast({ title: "Sem dados", description: "Nenhum robô encontrado para exportar.", variant: "destructive" });
      return;
    }

    const headers = [
      "Ranking",
      "Robô",
      "Par",
      "Estratégia",
      "Status",
      "Classificação",
      "Lucro Bruto (USD)",
      "Perda Bruta (USD)",
      "PnL Líquido (USD)",
      "Trades Fechados",
      "Vitórias",
      "Derrotas",
      "Taxa de Acerto (%)",
      "Fator de Lucro",
      "Score Lucratividade",
      "Posição Aberta",
      "PnL Não Realizado (USD)",
    ];

    const rows = [...botRows]
      .sort((a, b) => b.profitScore - a.profitScore)
      .map((r, idx) => [
        `#${idx + 1}`,
        r.bot.name,
        r.bot.symbol,
        r.bot.strategy,
        r.bot.active ? (r.hasPosition ? "Em Operação" : "Ativo") : "Pausado",
        r.recommendation === "CHAMPION"
          ? "Top 1 Campeão"
          : r.recommendation === "PROFITABLE"
          ? "Lucrativo (Recomendado)"
          : r.recommendation === "DEFICIT"
          ? "Deficitário (Pausar)"
          : "Neutro/Novo",
        r.grossProfit.toFixed(2),
        r.grossLoss.toFixed(2),
        r.netPnl.toFixed(2),
        r.tradesCount,
        r.winCount,
        r.lossCount,
        r.winRate.toFixed(1),
        r.profitFactor.toFixed(2),
        r.profitScore.toFixed(1),
        r.hasPosition ? "SIM" : "NÃO",
        r.unrealizedPnl.toFixed(2),
      ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `registro_bots_lucro_perda_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Exportação Concluída",
      description: "O registro consolidado com ranking de lucratividade dos robôs foi baixado com sucesso.",
    });
  };

  return (
    <Card className="border border-border/40 bg-card/60 backdrop-blur-md shadow-xl overflow-hidden">
      <CardHeader className="p-4 sm:p-5 border-b border-border/30 bg-secondary/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-crypto-green/10 text-crypto-green border border-crypto-green/20">
                <DollarSign className="w-4 h-4" />
              </div>
              <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                Registro de Lucro & Perda dos Robôs
              </CardTitle>
              <Badge variant="outline" className="text-[10px] bg-crypto-cyan/10 text-crypto-cyan border-crypto-cyan/30">
                Modo {tradingMode === "live" ? "Real" : "Simulado"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Quadro direto e transparente do desempenho financeiro de cada robô da frota em tempo real com ranking de lucratividade.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-8 px-3 text-xs border-border/60 hover:bg-secondary/60 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-crypto-cyan" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RESUMO SIMPLES E DIRETO (METRIC CARDS) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
          {/* Lucro Total Acumulado */}
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Lucro Total (Ganhos)
              </span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-emerald-400 mt-1">
              +${formatPrice(summary.totalGrossProfit)}
            </div>
            <div className="text-[11px] text-emerald-400/80 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {summary.totalWins} {summary.totalWins === 1 ? "operação vencedora" : "operações vencedoras"}
            </div>
          </div>

          {/* Perda Total Acumulada */}
          <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Perda Total (Prejuízos)
              </span>
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-rose-400 mt-1">
              -${formatPrice(summary.totalGrossLoss)}
            </div>
            <div className="text-[11px] text-rose-400/80 mt-0.5 flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              {summary.totalLosses} {summary.totalLosses === 1 ? "operação perdedora" : "operações perdedoras"}
            </div>
          </div>

          {/* PnL Líquido Consolidado */}
          <div
            className={`p-3 rounded-xl border relative overflow-hidden ${
              summary.netPnl >= 0
                ? "border-crypto-green/30 bg-crypto-green/10"
                : "border-crypto-red/30 bg-crypto-red/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Resultado Líquido (PnL)
              </span>
              <DollarSign
                className={`w-4 h-4 ${summary.netPnl >= 0 ? "text-crypto-green" : "text-crypto-red"}`}
              />
            </div>
            <div
              className={`text-lg sm:text-xl font-black mt-1 ${
                summary.netPnl >= 0 ? "text-crypto-green" : "text-crypto-red"
              }`}
            >
              {summary.netPnl >= 0 ? "+" : ""}${formatPrice(summary.netPnl)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {summary.botsInProfit} robôs no lucro • {summary.botsInLoss} no prejuízo
            </div>
          </div>

          {/* Taxa de Acerto (Win Rate) */}
          <div className="p-3 rounded-xl border border-crypto-cyan/20 bg-crypto-cyan/5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Assertividade Geral
              </span>
              <Percent className="w-4 h-4 text-crypto-cyan" />
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-crypto-cyan mt-1">
              {summary.winRate.toFixed(1)}%
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {summary.totalTrades} {summary.totalTrades === 1 ? "trade finalizado" : "trades finalizados"}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* ========================================================================= */}
        {/* COCKPIT DE SUGESTÃO E SELEÇÃO INTELIGENTE DOS MAIS LUCRATIVOS */}
        {/* ========================================================================= */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-emerald-500/5 to-cyan-500/10 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Trophy className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  Sugestão da Frota · Priorização por Lucratividade
                  <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/40 font-mono">
                    {topChampions.length} Recomendado(s)
                  </Badge>
                </h3>
              </div>
              <p className="text-xs text-muted-foreground max-w-2xl">
                O motor algorítmico avalia o retorno real de cada robô (PnL líquido, Fator de Lucro e Win Rate).
                Ative com 1 clique apenas os robôs que comprovadamente geram lucro e pause os robôs com prejuízo acumulado.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {cbStatus.tripped && (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
                  <span className="font-semibold text-[11px]">Kill Switch Ativado (3% NAV)</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleResetKillSwitch}
                    className="h-6 px-2 text-[10px] ml-1 font-bold cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Destravar
                  </Button>
                </div>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenBinanceScannerModal(true)}
                className="h-8 px-3 border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs font-bold cursor-pointer transition-all duration-200"
              >
                <Trophy className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                Escanear Binance (764+ Pares)
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={isRotating}
                onClick={handleManualRotation}
                className="h-8 px-3 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-xs font-bold cursor-pointer transition-all duration-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-cyan-400 ${isRotating ? "animate-spin" : ""}`} />
                {isRotating ? "Rotacionando..." : "Rotacionar Campeões"}
              </Button>

              <Button
                size="sm"
                variant={fleetAutoRotationEnabled ? "secondary" : "outline"}
                onClick={() => {
                  const next = !fleetAutoRotationEnabled;
                  setFleetAutoRotationEnabled(next);
                  toast({
                    title: next ? "🔄 Auto-Rotação Ativada" : "Auto-Rotação Desativada",
                    description: next
                      ? "A frota atualizará os robôs ociosos automaticamente a cada 4 horas com os líderes da Binance."
                      : "A rotação automática periódica da frota foi pausada.",
                  });
                }}
                className={`h-8 px-2.5 text-xs font-bold cursor-pointer border transition-all duration-200 ${
                  fleetAutoRotationEnabled
                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25"
                    : "text-muted-foreground border-border/40 hover:bg-secondary/40"
                }`}
              >
                <Zap className={`w-3.5 h-3.5 mr-1.5 ${fleetAutoRotationEnabled ? "text-cyan-400" : "text-muted-foreground"}`} />
                Auto-4h: {fleetAutoRotationEnabled ? "ON" : "OFF"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handlePauseDeficit}
                className="h-8 px-3 border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-bold cursor-pointer transition-all duration-200"
              >
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-rose-400" />
                Pausar Deficitários
              </Button>

              <Button
                size="sm"
                onClick={handleActivateProfitable}
                className="h-8 px-3.5 bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-500 hover:from-amber-400 hover:to-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 border border-amber-400/40 cursor-pointer transition-all duration-200 hover:scale-[1.02]"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-200 animate-pulse" />
                Ativar & Priorizar Mais Lucrativos
              </Button>
            </div>
          </div>

          {/* Destaque dos Top Bots Mais Lucrativos */}
          {topChampions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-border/30">
              {topChampions.map((top, idx) => (
                <div
                  key={top.bot.id}
                  className="p-2.5 rounded-lg border border-border/40 bg-background/50 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-foreground truncate" title={top.bot.name}>
                        {top.bot.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                        <span>{top.bot.symbol}</span>
                        <span>•</span>
                        <span className={top.netPnl >= 0 ? "text-emerald-400 font-bold" : "text-rose-400"}>
                          {top.netPnl >= 0 ? "+" : ""}${top.netPnl.toFixed(2)}
                        </span>
                        {top.tradesCount > 0 && (
                          <>
                            <span>•</span>
                            <span>PF {top.profitFactor.toFixed(1)}x</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 shrink-0 ${
                      top.bot.active
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}
                  >
                    {top.bot.active ? "Ativo" : "Pausado"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BARRA DE FILTROS E PESQUISA */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                filter === "all" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
              }`}
            >
              Todos ({botRows.length})
            </Button>
            <Button
              size="sm"
              variant={filter === "top_ranked" ? "default" : "outline"}
              onClick={() => setFilter("top_ranked")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                filter === "top_ranked" ? "bg-amber-500 text-slate-950 font-bold" : "text-muted-foreground"
              }`}
            >
              <Trophy className="w-3 h-3 mr-1" />
              Mais Lucrativos (Rank)
            </Button>
            <Button
              size="sm"
              variant={filter === "profit" ? "default" : "outline"}
              onClick={() => setFilter("profit")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                filter === "profit" ? "bg-emerald-500 text-white font-bold" : "text-muted-foreground"
              }`}
            >
              No Lucro ({summary.botsInProfit})
            </Button>
            <Button
              size="sm"
              variant={filter === "loss" ? "default" : "outline"}
              onClick={() => setFilter("loss")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                filter === "loss" ? "bg-rose-500 text-white font-bold" : "text-muted-foreground"
              }`}
            >
              No Prejuízo ({summary.botsInLoss})
            </Button>
            <Button
              size="sm"
              variant={filter === "in_position" ? "default" : "outline"}
              onClick={() => setFilter("in_position")}
              className={`h-7 px-2.5 text-xs cursor-pointer ${
                filter === "in_position" ? "bg-amber-500 text-slate-900 font-bold" : "text-muted-foreground"
              }`}
            >
              Em Operação ({botRows.filter((r) => r.hasPosition).length})
            </Button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar robô ou moeda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-secondary/30 border-border/50"
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* LISTAGEM DIRETA DE CADA ROBÔ COM LUCRO E PERDA */}
        {/* ========================================================================= */}
        {filteredRows.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border/40 rounded-xl bg-secondary/10">
            <Bot className="w-8 h-8 mx-auto text-muted-foreground opacity-50 mb-2" />
            <p className="text-sm font-semibold text-foreground">Nenhum robô encontrado</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tente alterar o filtro ou termo de busca.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map((row) => {
              const isExpanded = expandedBotId === row.bot.id;
              const isProfit = row.netPnl >= 0;

              return (
                <div
                  key={row.bot.id}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                    row.hasPosition
                      ? "border-amber-500/40 bg-card/90 shadow-sm"
                      : isProfit && row.netPnl > 0
                      ? "border-emerald-500/30 bg-card/80"
                      : row.netPnl < 0
                      ? "border-rose-500/30 bg-card/80"
                      : "border-border/30 bg-card/60"
                  }`}
                >
                  {/* Linha Principal do Robô */}
                  <div className="p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    {/* Identificação do Robô */}
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          row.bot.active
                            ? "bg-crypto-green/15 text-crypto-green border border-crypto-green/30"
                            : "bg-secondary text-muted-foreground border border-border/40"
                        }`}
                      >
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded bg-secondary/80 border border-border/50 text-foreground">
                            {row.rank === 1 ? "🥇 #1" : row.rank === 2 ? "🥈 #2" : row.rank === 3 ? "🥉 #3" : `#${row.rank}`}
                          </span>
                          <h4 className="text-sm font-bold text-foreground">{row.bot.name}</h4>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-border/50 text-foreground font-mono">
                            {row.bot.symbol}
                          </Badge>
                          {row.recommendation === "CHAMPION" && (
                            <Badge className="text-[9px] py-0 px-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold border-none shadow-xs">
                              ⭐ Top Campeão
                            </Badge>
                          )}
                          {row.recommendation === "PROFITABLE" && (
                            <Badge className="text-[9px] py-0 px-1.5 bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold">
                              ✓ Recomendado
                            </Badge>
                          )}
                          {row.recommendation === "DEFICIT" && (
                            <Badge className="text-[9px] py-0 px-1.5 bg-rose-500/15 text-rose-300 border-rose-500/30">
                              ⚠️ Deficitário
                            </Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className="text-[9px] py-0 px-1 bg-secondary text-muted-foreground uppercase"
                          >
                            {row.bot.strategy}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                row.bot.active ? (row.hasPosition ? "bg-amber-400 animate-pulse" : "bg-emerald-400") : "bg-zinc-500"
                              }`}
                            />
                            {row.bot.active
                              ? row.hasPosition
                                ? "Em Operação"
                                : "Analisando Mercado"
                              : "Pausado"}
                          </span>
                          <span>•</span>
                          <span>Alocação: ${row.bot.allocationAmount || 40} USDT</span>
                        </div>
                      </div>
                    </div>

                    {/* Bloco de Lucro, Perda e PnL Líquido */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-4 w-full md:w-auto items-center">
                      {/* Lucro Bruto */}
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Lucro</span>
                        <div className="text-xs sm:text-sm font-bold text-emerald-400">
                          +${formatPrice(row.grossProfit)}
                        </div>
                        <span className="text-[10px] text-emerald-400/80">{row.winCount} wins</span>
                      </div>

                      {/* Perda Bruta */}
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Perda</span>
                        <div className="text-xs sm:text-sm font-bold text-rose-400">
                          -${formatPrice(row.grossLoss)}
                        </div>
                        <span className="text-[10px] text-rose-400/80">{row.lossCount} losses</span>
                      </div>

                      {/* Resultado Líquido (PnL) */}
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-muted-foreground uppercase block font-semibold">PnL Líquido</span>
                        <div
                          className={`text-xs sm:text-sm font-black ${
                            row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {row.netPnl >= 0 ? "+" : ""}${formatPrice(row.netPnl)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {row.winRate.toFixed(0)}% acerto
                        </span>
                      </div>

                      {/* Posição Aberta (se houver) */}
                      <div className="hidden sm:block text-right">
                        <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Posição Atual</span>
                        {row.hasPosition ? (
                          <div>
                            <span
                              className={`text-xs font-bold ${
                                row.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {row.unrealizedPnl >= 0 ? "+" : ""}${formatPrice(row.unrealizedPnl)}
                            </span>
                            <span className="text-[10px] text-amber-400 block font-semibold">Aberta</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Nenhuma</span>
                        )}
                      </div>
                    </div>

                    {/* Ações Rápidas: Ativar/Pausar e Expandir Trades */}
                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                      <Button
                        size="sm"
                        variant={row.bot.active ? "outline" : "default"}
                        onClick={() => {
                          toggleBotActive(row.bot.id);
                          toast({
                            title: row.bot.active ? "Robô Pausado" : "Robô Ativado",
                            description: `${row.bot.name} (${row.bot.symbol}) foi ${row.bot.active ? "pausado" : "ativado"}.`,
                          });
                        }}
                        className={`h-8 px-2.5 text-xs font-semibold cursor-pointer ${
                          row.bot.active
                            ? "border-border/60 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/40"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                        }`}
                      >
                        {row.bot.active ? (
                          <>
                            <Pause className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                            Pausar
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 mr-1 text-white fill-current" />
                            Ativar
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedBotId(isExpanded ? null : row.bot.id)}
                        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            Ocultar Trades <ChevronUp className="w-3.5 h-3.5 ml-1" />
                          </>
                        ) : (
                          <>
                            Ver Trades ({row.trades.length}) <ChevronDown className="w-3.5 h-3.5 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Detalhe Expansível: Lista de Trades do Robô */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-border/30 bg-secondary/15 p-3 sm:p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-crypto-cyan" />
                            Histórico de Operações de {row.bot.name} ({row.bot.symbol})
                          </h5>
                          <span className="text-[10px] text-muted-foreground">
                            Fator de Lucro: <strong className="text-foreground">{row.profitFactor.toFixed(2)}x</strong>
                            {row.avgWin > 0 && ` • Ganho Médio: +$${row.avgWin.toFixed(2)}`}
                            {row.avgLoss > 0 && ` • Perda Média: -$${row.avgLoss.toFixed(2)}`}
                          </span>
                        </div>

                        {row.trades.length === 0 ? (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            Nenhuma operação individual gravada no cache recente para este robô.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px] text-left">
                              <thead>
                                <tr className="border-b border-border/30 text-muted-foreground text-[10px] uppercase font-semibold">
                                  <th className="py-1.5 px-2">Data/Hora</th>
                                  <th className="py-1.5 px-2">Lado</th>
                                  <th className="py-1.5 px-2">Preço</th>
                                  <th className="py-1.5 px-2">Montante</th>
                                  <th className="py-1.5 px-2">PnL Líquido</th>
                                  <th className="py-1.5 px-2">Estratégia</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/20">
                                {row.trades.map((t) => {
                                  const pnlVal = t.netPnl ?? t.pnl;
                                  const isTradeProfit = pnlVal > 0;
                                  const isTradeLoss = pnlVal < 0;

                                  return (
                                    <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                                        {new Date(t.timestamp).toLocaleDateString("pt-BR")}{" "}
                                        {new Date(t.timestamp).toLocaleTimeString("pt-BR", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          second: "2-digit",
                                        })}
                                      </td>
                                      <td className="py-2 px-2">
                                        <Badge
                                          variant="outline"
                                          className={`text-[9px] py-0 px-1.5 font-bold ${
                                            t.side === "BUY"
                                              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                              : "border-rose-500/40 text-rose-400 bg-rose-500/10"
                                          }`}
                                        >
                                          {t.side === "BUY" ? "COMPRA" : "VENDA"}
                                        </Badge>
                                      </td>
                                      <td className="py-2 px-2 font-mono font-medium text-foreground">
                                        ${formatPrice(t.price)}
                                      </td>
                                      <td className="py-2 px-2 font-mono text-muted-foreground">
                                        ${t.total.toFixed(2)} USDT
                                      </td>
                                      <td className="py-2 px-2 font-mono font-bold">
                                        {pnlVal !== 0 ? (
                                          <span className={isTradeProfit ? "text-emerald-400" : "text-rose-400"}>
                                            {isTradeProfit ? "+" : ""}${formatPrice(pnlVal)}
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">-</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2 text-muted-foreground">
                                        {t.strategy || row.bot.strategy}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
