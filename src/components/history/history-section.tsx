"use client";

import { useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TradeTable } from "./trade-table";
import { TradeReport } from "./trade-report";
import { exportTradesToCSV } from "@/lib/export-csv";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Target,
  Download,
  Search,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function HistorySection() {
  const { trades } = useCryptoStore();

  // Filter states
  const [symbolSearch, setSymbolSearch] = useState("");
  const [sideFilter, setSideFilter] = useState("ALL");
  const [strategyFilter, setStrategyFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [periodFilter, setPeriodFilter] = useState("ALL");

  // Reset all filters
  const handleResetFilters = () => {
    setSymbolSearch("");
    setSideFilter("ALL");
    setStrategyFilter("ALL");
    setModeFilter("ALL");
    setPeriodFilter("ALL");
  };

  // Filtered trades calculation
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // 1. Symbol search
      if (
        symbolSearch &&
        !t.symbol.toLowerCase().includes(symbolSearch.toLowerCase().trim())
      ) {
        return false;
      }
      // 2. Side filter
      if (sideFilter !== "ALL" && t.side !== sideFilter) {
        return false;
      }
      // 3. Strategy filter
      if (strategyFilter !== "ALL" && t.strategy !== strategyFilter) {
        return false;
      }
      // 4. Mode filter (live -> true/live, paper -> false/paper)
      if (modeFilter !== "ALL" && t.mode !== modeFilter) {
        return false;
      }
      // 5. Period filter
      if (periodFilter !== "ALL") {
        const tradeTime = new Date(t.timestamp).getTime();
        const now = Date.now();
        if (periodFilter === "24h" && now - tradeTime > 24 * 60 * 60 * 1000) return false;
        if (periodFilter === "7d" && now - tradeTime > 7 * 24 * 60 * 60 * 1000) return false;
        if (periodFilter === "30d" && now - tradeTime > 30 * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [trades, symbolSearch, sideFilter, strategyFilter, modeFilter, periodFilter]);

  // Compute summary stats dynamically based on filtered trades
  const stats = useMemo(() => {
    const closedTrades = filteredTrades.filter((t) => t.pnl !== 0);
    const wins = closedTrades.filter((t) => t.pnl > 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
    const winRate =
      closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

    return {
      totalTrades: filteredTrades.length,
      winRate,
      totalPnl,
      avgPnl,
    };
  }, [filteredTrades]);

  const summaryCards = [
    {
      label: "Total Trades (Filtrado)",
      value: stats.totalTrades.toString(),
      icon: BarChart3,
      color: "text-crypto-cyan",
      bgColor: "bg-crypto-cyan/10",
      accentClass: "card-accent-cyan",
    },
    {
      label: "Taxa de Acerto",
      value: `${stats.winRate.toFixed(1)}%`,
      icon: Target,
      color: stats.winRate >= 50 ? "text-crypto-green" : stats.winRate > 0 ? "text-crypto-red" : "text-muted-foreground",
      bgColor: stats.winRate >= 50 ? "bg-crypto-green/10" : stats.winRate > 0 ? "bg-crypto-red/10" : "bg-secondary/40",
      accentClass: stats.winRate >= 50 ? "card-accent-green" : stats.winRate > 0 ? "card-accent-red" : "",
    },
    {
      label: "PnL Total",
      value: `${stats.totalPnl >= 0 ? "+" : ""}$${formatPrice(stats.totalPnl)}`,
      icon: DollarSign,
      color: stats.totalPnl >= 0 ? "text-crypto-green" : "text-crypto-red",
      bgColor: stats.totalPnl >= 0 ? "bg-crypto-green/10" : "bg-crypto-red/10",
      accentClass: stats.totalPnl >= 0 ? "card-accent-green" : "card-accent-red",
    },
    {
      label: "L/P Médio por Trade",
      value: `${stats.avgPnl >= 0 ? "+" : ""}$${formatPrice(stats.avgPnl)}`,
      icon: TrendingUp,
      color: stats.avgPnl >= 0 ? "text-crypto-green" : "text-crypto-red",
      bgColor: stats.avgPnl >= 0 ? "bg-crypto-green/10" : "bg-crypto-red/10",
      accentClass: "card-accent-gold",
    },
  ];

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <Card className={`bg-card/60 backdrop-blur-md gradient-border overflow-hidden ${card.accentClass}`}>
              <CardContent className="p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-lg ${card.bgColor} flex items-center justify-center shadow-sm`}>
                    <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    {card.label}
                  </span>
                </div>
                <div className={`text-lg sm:text-xl font-bold font-mono ${card.color}`}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Advanced Filter Controls */}
      <Card className="bg-card/40 backdrop-blur-md border border-border/40 p-4">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <SlidersHorizontal className="w-4 h-4 text-crypto-cyan" />
              Filtros Avançados
            </h3>
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 text-xs gap-1.5 px-3 border-border/50 hover:bg-secondary/60 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpar Filtros
              </Button>
              <Button
                onClick={() => exportTradesToCSV(filteredTrades)}
                disabled={filteredTrades.length === 0}
                size="sm"
                className="h-8 text-xs gap-1.5 px-3 bg-crypto-green/10 text-crypto-green border border-crypto-green/30 hover:bg-crypto-green/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <input
                type="text"
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                placeholder="Buscar símbolo (ex: BTC)..."
                className="w-full bg-secondary/30 border border-border/60 rounded-lg text-xs pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-crypto-cyan/50 text-foreground placeholder-muted-foreground transition-all duration-150"
              />
            </div>

            {/* Side Filter */}
            <div className="flex flex-col space-y-1">
              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value)}
                className="w-full bg-secondary/30 border border-border/60 rounded-lg text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-crypto-cyan/50 text-foreground cursor-pointer transition-all duration-150"
              >
                <option value="ALL" className="bg-background">Lado: Todos</option>
                <option value="BUY" className="bg-background">BUY (Compra)</option>
                <option value="SELL" className="bg-background">SELL (Venda)</option>
              </select>
            </div>

            {/* Strategy Filter */}
            <div className="flex flex-col space-y-1">
              <select
                value={strategyFilter}
                onChange={(e) => setStrategyFilter(e.target.value)}
                className="w-full bg-secondary/30 border border-border/60 rounded-lg text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-crypto-cyan/50 text-foreground cursor-pointer transition-all duration-150"
              >
                <option value="ALL" className="bg-background">Estratégia: Todas</option>
                <option value="AI" className="bg-background">🤖 IA</option>
                <option value="RSI" className="bg-background">⚙️ RSI</option>
                <option value="MACD" className="bg-background">⚙️ MACD</option>
                <option value="Manual" className="bg-background">👤 Manual</option>
              </select>
            </div>

            {/* Mode Filter */}
            <div className="flex flex-col space-y-1">
              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="w-full bg-secondary/30 border border-border/60 rounded-lg text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-crypto-cyan/50 text-foreground cursor-pointer transition-all duration-150"
              >
                <option value="ALL" className="bg-background">Modo: Todos</option>
                <option value="live" className="bg-background">🟢 Real (Binance)</option>
                <option value="paper" className="bg-background">🔵 Simulado</option>
              </select>
            </div>

            {/* Period Filter */}
            <div className="flex flex-col space-y-1">
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="w-full bg-secondary/30 border border-border/60 rounded-lg text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-crypto-cyan/50 text-foreground cursor-pointer transition-all duration-150"
              >
                <option value="ALL" className="bg-background">Período: Todo Histórico</option>
                <option value="24h" className="bg-background">Últimas 24 horas</option>
                <option value="7d" className="bg-background">Últimos 7 dias</option>
                <option value="30d" className="bg-background">Últimos 30 dias</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Trade Table Card */}
      <Card className="bg-card/60 backdrop-blur-md gradient-border overflow-hidden">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Lista de Operações</h3>
            <span className="text-xs text-muted-foreground font-mono">
              Registrados: {filteredTrades.length} de {trades.length}
            </span>
          </div>
          <TradeTable trades={filteredTrades} />
        </CardContent>
      </Card>

      {/* Analytics Trade Report Section */}
      <TradeReport />
    </motion.div>
  );
}
