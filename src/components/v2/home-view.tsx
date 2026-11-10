"use client";

import React, { useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  AppCard,
  MetricDisplay,
  MetricStrip,
  AppChip,
  AppSwitch,
} from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";
import { useShallow } from "zustand/react/shallow";

export function HomeView() {
  const {
    portfolio,
    bots,
    toggleBot,
    fearGreedIndex,
    setActiveSection,
    trades,
  } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      bots: s.bots,
      toggleBot: s.toggleBot,
      fearGreedIndex: s.fearGreedIndex,
      setActiveSection: s.setActiveSection,
      trades: s.trades,
    }))
  );

  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h");
  const [aiFilter, setAiFilter] = useState<"todas" | "altas" | "quedas" | "favoritas">("todas");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Métricas de patrimônio
  const totalBalance = portfolio?.totalBalanceUsd ?? 10011.30;
  const inCash = portfolio?.availableBalanceUsd ?? 9986.30;
  const invested = portfolio?.inTradeBalanceUsd ?? 25.00;
  const executedTrades = trades.length || 3;

  const dailyGainPct = 0.11;
  const dailyGainUsd = 11.30;

  // Curva de patrimônio fiel ao artboard
  const chartData = useMemo(() => {
    return [
      { time: "23:12", value: 9998 },
      { time: "02:00", value: 10002 },
      { time: "05:12", value: 10005 },
      { time: "08:00", value: 10007 },
      { time: "11:12", value: 10009 },
      { time: "14:00", value: 10010 },
      { time: "17:12", value: 10011.30 },
    ];
  }, []);

  const activeBotsCount = bots.filter((b) => b.active).length;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. AVISO CONDICIONAL DE DADOS ATRASADOS */}
      {!bannerDismissed && (
        <div className="flex items-center justify-between px-5 py-3 rounded-[16px] bg-[#FFF4DC] border border-[#FFE7A8] text-[#6B4300] text-[14px]">
          <span>Os preços estão com 3 min de atraso. Espere normalizar para operar.</span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="font-semibold underline hover:opacity-80 transition-opacity ml-4 cursor-pointer"
          >
            Atualizar
          </button>
        </div>
      )}

      {/* 2. LINHA DE FOCO: CARTÃO ESCURO DE PATRIMÔNIO + SEUS ROBÔS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Cartão Escuro Focal (8 colunas em desktop) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between bg-[#0E1B2C] text-white p-7 sm:p-9 rounded-[28px] shadow-[0_4px_20px_rgba(14,27,44,0.08)]">
          <div>
            {/* Topo do Card: Rótulo + Seletor de Período */}
            <div className="flex items-center justify-between pb-2">
              <span className="text-[14px] text-[#A9B7C8] font-medium">Patrimônio</span>
              <div className="inline-flex p-0.5 bg-[#17273d] rounded-full border border-white/10 text-[13px]">
                {(["24h", "7d", "30d"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-full transition-all ${
                      period === p
                        ? "bg-white text-[#0E1B2C] font-semibold shadow-xs"
                        : "text-[#A9B7C8] hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Número Heroico em Serifa */}
            <div className="pt-1">
              <span className="font-instrument-serif text-[50px] sm:text-[68px] md:text-[76px] tracking-[-0.02em] leading-none text-white tabular-nums">
                {formatCurrency(totalBalance)}
              </span>
            </div>

            {/* Pílula de Variação 24h */}
            <div className="flex items-center space-x-2 pt-2 pb-4">
              <span className="px-2.5 py-0.5 rounded-full bg-[rgba(91,227,168,0.16)] text-[#5BE3A8] text-[13px] font-semibold tabular-nums border border-[rgba(91,227,168,0.3)]">
                +{formatPercent(dailyGainPct)}
              </span>
              <span className="text-[13px] text-[#A9B7C8]">
                +{formatCurrency(dailyGainUsd)} nas últimas 24 horas
              </span>
            </div>

            {/* Gráfico de Área Suave */}
            <div className="w-full h-32 sm:h-36 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="neonGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5BE3A8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#5BE3A8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6A7B92", fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#5BE3A8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#neonGreen)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rodapé do Card Escuro: MetricStrip Separado por Linhas Verticais */}
          <div className="pt-6 mt-4 border-t border-[#223652] grid grid-cols-3 divide-x divide-[#223652]">
            <div className="pr-4">
              <span className="text-[12px] text-[#A9B7C8] block">Em caixa</span>
              <span className="font-instrument-serif text-[22px] sm:text-[26px] text-white font-bold tabular-nums">
                {formatCurrency(inCash)}
              </span>
            </div>
            <div className="px-4">
              <span className="text-[12px] text-[#A9B7C8] block">Investido</span>
              <span className="font-instrument-serif text-[22px] sm:text-[26px] text-white font-bold tabular-nums">
                {formatCurrency(invested)}
              </span>
            </div>
            <div className="pl-4">
              <span className="text-[12px] text-[#A9B7C8] block">Ordens executadas</span>
              <span className="font-instrument-serif text-[22px] sm:text-[26px] text-white font-bold tabular-nums">
                {executedTrades}
              </span>
            </div>
          </div>
        </div>

        {/* Card Branco: Seus Robôs (5 colunas em desktop) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#E7EBF0] dark:border-white/10">
              <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Seus robôs
              </h3>
              <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                {activeBotsCount} de 5 ligados
              </span>
            </div>

            {/* Lista dos 5 Robôs */}
            <div className="divide-y divide-[#E7EBF0] dark:divide-white/5">
              {bots.slice(0, 5).map((bot) => (
                <div key={bot.id} className="py-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-[15px] text-[#0E1B2C] dark:text-white">
                      {bot.name}
                    </h4>
                    <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                      {bot.pair} · {bot.strategy}
                    </p>
                  </div>
                  <AppSwitch
                    checked={bot.active}
                    onCheckedChange={() => toggleBot(bot.id)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Botão Largo Inferior */}
          <button
            onClick={() => setActiveSection("bot")}
            className="w-full mt-4 py-2.5 rounded-full bg-[#EEF1F5] dark:bg-white/10 hover:bg-[#E4E8ED] text-[#0E1B2C] dark:text-white text-[14px] font-semibold transition-colors cursor-pointer"
          >
            Gerenciar robôs
          </button>
        </div>
      </div>

      {/* 3. LINHA DE CONTEXTO: 3 COLUNAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Humor do Mercado */}
        <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 space-y-3 shadow-xs">
          <span className="text-[14px] font-medium text-[#4A586A] dark:text-[#94a3b8] block">
            Humor do mercado
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="font-instrument-serif text-[44px] leading-none text-[#0E1B2C] dark:text-white tabular-nums">
              50
            </span>
            <span className="text-[15px] font-medium text-[#0E1B2C] dark:text-white">
              Neutro
            </span>
          </div>

          {/* Barra com bolinha marcadora */}
          <div className="pt-2">
            <div className="relative w-full h-1.5 bg-[#E4E8ED] dark:bg-white/10 rounded-full">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#0E1B2C] dark:bg-white border-2 border-white shadow-xs"
                style={{ left: "50%" }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#4A586A] dark:text-[#94a3b8] pt-1.5">
              <span>Medo</span>
              <span>Ganância</span>
            </div>
          </div>

          <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] pt-2">
            Nenhuma das 503 moedas monitoradas está em alta ou em baixa agora.
          </p>
        </div>

        {/* Exposição */}
        <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 space-y-3 shadow-xs">
          <span className="text-[14px] font-medium text-[#4A586A] dark:text-[#94a3b8] block">
            Exposição
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="font-instrument-serif text-[44px] leading-none text-[#0E1B2C] dark:text-white tabular-nums">
              99,8%
            </span>
            <span className="text-[15px] font-medium text-[#0E1B2C] dark:text-white">
              em caixa
            </span>
          </div>

          {/* Barra de Progresso em Caixa */}
          <div className="pt-2">
            <div className="w-full h-2 bg-[#E4E8ED] dark:bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#7C99B6] rounded-full" style={{ width: "99.8%" }} />
            </div>
          </div>

          <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] pt-2">
            Pouca exposição a quedas, mas também pouco retorno possível. Sharpe e Sortino aparecem depois de mais operações.
          </p>
        </div>

        {/* Ordens Abertas */}
        <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 flex flex-col justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-[14px] font-medium text-[#4A586A] dark:text-[#94a3b8] block">
              Ordens abertas
            </span>
            <h4 className="font-bold text-[15px] text-[#0E1B2C] dark:text-white pt-1">
              Nenhuma ordem pendente
            </h4>
            <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
              Ordens Limit, Stop Loss e OCO ficam aqui até serem executadas.
            </p>
          </div>

          <button
            onClick={() => setActiveSection("chart")}
            className="w-fit px-5 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer mt-4"
          >
            Criar ordem
          </button>
        </div>
      </div>

      {/* 4. SEÇÃO: SUGESTÕES DA IA */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
        {/* Cabeçalho com Pílulas de Filtro */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
            Sugestões da IA
          </h3>

          <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px]">
            {[
              { id: "todas", label: "Todas" },
              { id: "altas", label: "Em alta" },
              { id: "quedas", label: "Quedas" },
              { id: "favoritas", label: "Favoritas" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setAiFilter(f.id as any)}
                className={`px-3.5 py-1 rounded-full transition-all ${
                  aiFilter === f.id
                    ? "bg-[#0E1B2C] text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Caixa Interna Cinza com Ação */}
        <div className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 rounded-[18px] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-bold text-[15px] text-[#0E1B2C] dark:text-white">
              Escaneie o mercado para ver as melhores entradas e saídas
            </h4>
            <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] max-w-xl">
              A IA compara tendência, suporte e resistência de 503 moedas e lista só as que passam nos seus critérios.
            </p>
          </div>

          <button
            onClick={() => setActiveSection("ai")}
            className="px-6 py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] text-[14px] font-semibold hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
          >
            Escanear mercado
          </button>
        </div>
      </div>
    </div>
  );
}
