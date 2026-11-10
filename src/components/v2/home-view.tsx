"use client";

import React, { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  AppCard,
  MetricDisplay,
  MetricStrip,
  AppChip,
  AppSwitch,
} from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Bot,
  PieChart,
  BarChart3,
  Clock,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { useShallow } from "zustand/react/shallow";

export function HomeView() {
  const {
    portfolio,
    bots,
    toggleBot,
    marketSentiment,
    fearGreedIndex,
    setActiveSection,
    positions,
    trades,
    aiSuggestions,
  } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      bots: s.bots,
      toggleBot: s.toggleBot,
      marketSentiment: s.marketSentiment,
      fearGreedIndex: s.fearGreedIndex,
      setActiveSection: s.setActiveSection,
      positions: s.positions,
      trades: s.trades,
      aiSuggestions: s.aiSuggestions,
    }))
  );

  // Cálculos de métricas do patrimônio
  const totalBalance = portfolio?.totalBalanceUsd ?? 10000;
  const dailyPnl = portfolio?.dailyPnlUsd ?? 0;
  const dailyPnlPct = portfolio?.dailyPnlPercent ?? (totalBalance > 0 ? (dailyPnl / totalBalance) * 100 : 0);
  const isDailyGain = dailyPnl >= 0;

  const availableBalance = portfolio?.availableBalanceUsd ?? totalBalance * 0.7;
  const inTradeBalance = portfolio?.inTradeBalanceUsd ?? totalBalance * 0.3;

  // Mini gráfico histórico sintético baseado nos últimos trades ou curva de equity
  const chartData = useMemo(() => {
    const points = [];
    let current = totalBalance - dailyPnl;
    const step = dailyPnl / 6;
    const hours = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "Agora"];
    for (let i = 0; i < 7; i++) {
      points.push({
        time: hours[i],
        value: Math.round(current + (i * step) + (Math.sin(i) * 15)),
      });
    }
    return points;
  }, [totalBalance, dailyPnl]);

  // Alocação real de ativos
  const assetAllocation = useMemo(() => {
    const total = totalBalance || 1;
    let btcValue = 0;
    let ethValue = 0;
    let solValue = 0;
    let otherValue = 0;

    positions.forEach((p) => {
      const val = (p.amount ?? 0) * (p.currentPrice || p.entryPrice || 0);
      if (p.symbol.startsWith("BTC")) btcValue += val;
      else if (p.symbol.startsWith("ETH")) ethValue += val;
      else if (p.symbol.startsWith("SOL")) solValue += val;
      else otherValue += val;
    });

    const usdtValue = Math.max(0, total - (btcValue + ethValue + solValue + otherValue));

    return [
      { symbol: "USDT", percent: Math.round((usdtValue / total) * 100), color: "#0B8F6A" },
      { symbol: "BTC", percent: Math.round((btcValue / total) * 100), color: "#F7931A" },
      { symbol: "ETH", percent: Math.round((ethValue / total) * 100), color: "#627EEA" },
      { symbol: "Outros", percent: Math.max(0, 100 - Math.round((usdtValue / total) * 100) - Math.round((btcValue / total) * 100) - Math.round((ethValue / total) * 100)), color: "#A9B7C8" },
    ].filter((a) => a.percent > 0);
  }, [totalBalance, positions]);

  // Rótulo do Fear & Greed
  const fearGreedText = useMemo(() => {
    const idx = fearGreedIndex ?? 52;
    if (idx >= 75) return "Ganância Extrema";
    if (idx >= 55) return "Ganância";
    if (idx >= 45) return "Neutro";
    if (idx >= 25) return "Medo";
    return "Medo Extremo";
  }, [fearGreedIndex]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* 1. CARTÃO ESCURO FOCAL DE PATRIMÔNIO (Ponto focal único da tela) */}
      <AppCard variant="focal" padding="lg" className="relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#223652]">
          <div className="space-y-2">
            <span className="text-[13px] md:text-[14px] font-instrument-sans font-medium text-[#A9B7C8] flex items-center space-x-2">
              <span>Patrimônio Total Líquido</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#5BE3A8]" />
              <span className="text-[12px] text-[#A9B7C8]">Atualizado em tempo real</span>
            </span>

            <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
              <span className="font-instrument-serif text-[48px] sm:text-[64px] md:text-[76px] tracking-[-0.02em] leading-none text-white tabular-nums">
                {formatCurrency(totalBalance)}
              </span>

              <AppChip variant={isDailyGain ? "focal-gain" : "focal-loss"} className="text-sm">
                {isDailyGain ? "+" : ""}
                {formatPercent(dailyPnlPct)} ({isDailyGain ? "+" : ""}
                {formatCurrency(dailyPnl)}) hoje
              </AppChip>
            </div>
          </div>

          {/* Mini-gráfico discreto de tendência */}
          <div className="w-full md:w-56 h-16 sm:h-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isDailyGain ? "#5BE3A8" : "#FF8A80"} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={isDailyGain ? "#5BE3A8" : "#FF8A80"} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isDailyGain ? "#5BE3A8" : "#FF8A80"}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#equityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Linha de Métricas Secundárias (MetricStrip) */}
        <div className="pt-6">
          <MetricStrip onFocalDark={true}>
            <MetricDisplay
              label="Disponível para operar"
              value={formatCurrency(availableBalance)}
              size="compact"
              onFocalDark={true}
            />
            <MetricDisplay
              label="Em operações ativas"
              value={formatCurrency(inTradeBalance)}
              size="compact"
              onFocalDark={true}
            />
            <MetricDisplay
              label="Resultado do dia"
              value={`${isDailyGain ? "+" : ""}${formatCurrency(dailyPnl)}`}
              size="compact"
              isGain={isDailyGain}
              onFocalDark={true}
            />
          </MetricStrip>
        </div>
      </AppCard>

      {/* 2. GRID PRINCIPAL: SEUS ROBÔS + CONTEXTO DE MERCADO & IA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        {/* Coluna Esquerda: Lista limpa dos 5 Robôs (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-instrument-serif text-[26px] sm:text-[30px] text-[#0E1B2C] dark:text-[#f8fafc] leading-tight">
                Seus robôs de lucro
              </h2>
              <p className="text-[14px] text-[#4A586A] dark:text-[#94a3b8] font-instrument-sans">
                Estratégias automáticas operando em modo protegido
              </p>
            </div>
            <button
              onClick={() => setActiveSection("bot")}
              className="inline-flex items-center space-x-1.5 text-[13px] font-semibold text-[#1F5FD6] hover:text-[#1F4FB0] transition-colors"
            >
              <span>Configurar robôs</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {bots.slice(0, 5).map((bot) => {
              const isProfit = (bot.totalProfit ?? 0) >= 0;
              return (
                <AppCard
                  key={bot.id}
                  padding="sm"
                  className="flex items-center justify-between hover:border-[#1F5FD6]/30 transition-all cursor-pointer"
                  onClick={() => setActiveSection("bot")}
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#EEF1F5] dark:bg-white/5 flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-[#0E1B2C] dark:text-[#f8fafc]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-semibold text-[15px] truncate text-[#0E1B2C] dark:text-[#f8fafc]">
                          {bot.name}
                        </h4>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EEF1F5] dark:bg-white/10 text-[#4A586A] dark:text-[#94a3b8] font-medium uppercase font-mono">
                          {bot.pair}
                        </span>
                      </div>
                      <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] truncate">
                        {bot.strategy}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 shrink-0">
                    <div className="text-right">
                      <div
                        className={`text-[15px] font-instrument-serif tabular-nums font-bold ${
                          isProfit ? "text-[#0A7A59] dark:text-[#5BE3A8]" : "text-[#B42318] dark:text-[#FF8A80]"
                        }`}
                      >
                        {isProfit ? "+" : ""}
                        {formatCurrency(bot.totalProfit || 0)}
                      </div>
                      <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] font-mono">
                        {bot.tradesCount || 0} trades
                      </span>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <AppSwitch
                        checked={bot.active}
                        onCheckedChange={() => toggleBot(bot.id)}
                      />
                    </div>
                  </div>
                </AppCard>
              );
            })}
          </div>
        </div>

        {/* Coluna Direita: Contexto de Mercado & Sugestões IA (5 colunas) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Humor do Mercado (Fear & Greed) */}
          <AppCard padding="md">
            <div className="flex items-center justify-between pb-3 border-b border-[#E7EBF0] dark:border-white/10">
              <span className="text-[13px] font-medium text-[#4A586A] dark:text-[#94a3b8]">
                Humor do mercado
              </span>
              <AppChip variant="blue">Índice Geral</AppChip>
            </div>

            <div className="pt-4 flex items-baseline justify-between">
              <div>
                <span className="font-instrument-serif text-[42px] leading-none text-[#0E1B2C] dark:text-[#f8fafc] tabular-nums">
                  {fearGreedIndex ?? 52}
                </span>
                <span className="text-[14px] text-[#4A586A] dark:text-[#94a3b8] ml-1.5 font-medium">
                  / 100
                </span>
              </div>
              <span className="text-[16px] font-semibold text-[#0E1B2C] dark:text-[#f8fafc]">
                {fearGreedText}
              </span>
            </div>

            {/* Barra de sentimento */}
            <div className="mt-3 w-full bg-[#E4E8ED] dark:bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#1F5FD6] h-full rounded-full transition-all duration-500"
                style={{ width: `${fearGreedIndex ?? 52}%` }}
              />
            </div>
          </AppCard>

          {/* Card: Exposição da Carteira */}
          <AppCard padding="md">
            <div className="flex items-center justify-between pb-3 border-b border-[#E7EBF0] dark:border-white/10">
              <span className="text-[13px] font-medium text-[#4A586A] dark:text-[#94a3b8]">
                Exposição por moeda
              </span>
              <button
                onClick={() => setActiveSection("history")}
                className="text-[12px] font-medium text-[#1F5FD6] hover:underline"
              >
                Ver carteira
              </button>
            </div>

            <div className="pt-4 space-y-3">
              {/* Barra segmentada de alocação */}
              <div className="w-full h-3 rounded-full flex overflow-hidden bg-[#EEF1F5] dark:bg-white/5">
                {assetAllocation.map((asset, i) => (
                  <div
                    key={i}
                    style={{ width: `${asset.percent}%`, backgroundColor: asset.color }}
                    title={`${asset.symbol}: ${asset.percent}%`}
                  />
                ))}
              </div>

              {/* Legenda de moedas */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {assetAllocation.map((asset, i) => (
                  <div key={i} className="flex items-center space-x-2 text-[13px]">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span className="font-medium text-[#0E1B2C] dark:text-[#f8fafc]">
                      {asset.symbol}
                    </span>
                    <span className="text-[#4A586A] dark:text-[#94a3b8] font-mono ml-auto">
                      {asset.percent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </AppCard>

          {/* Card: Sugestões e Alertas da IA */}
          <AppCard padding="md" className="border-l-4 border-l-[#1F5FD6]">
            <div className="flex items-center space-x-2 pb-2">
              <Sparkles className="w-4 h-4 text-[#1F5FD6]" />
              <span className="text-[14px] font-semibold text-[#0E1B2C] dark:text-[#f8fafc]">
                Radar Quantitativo IA
              </span>
            </div>
            <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] leading-relaxed">
              O modelo detectou compressão de volatilidade em BTC/USDT com suporte sólido em 84.200. Estratégia de rompimento recomendada com stop em 1,8%.
            </p>
            <div className="mt-3 pt-3 border-t border-[#E7EBF0] dark:border-white/10 flex items-center justify-between">
              <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] font-mono">
                Confiabilidade 82%
              </span>
              <button
                onClick={() => setActiveSection("chart")}
                className="text-[12px] font-semibold text-[#1F5FD6] hover:underline"
              >
                Analisar no gráfico →
              </button>
            </div>
          </AppCard>
        </div>
      </div>
    </div>
  );
}

