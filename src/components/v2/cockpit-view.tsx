"use client";

import React, { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { AppSwitch } from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import { ResponsiveContainer, LineChart, Line, XAxis } from "recharts";
import { useShallow } from "zustand/react/shallow";

export function CockpitView() {
  const { proMode, toggleProMode } = useCryptoStore(
    useShallow((s) => ({
      proMode: s.proMode,
      toggleProMode: s.toggleProMode,
    }))
  );

  const [timeframe, setTimeframe] = useState<"5m" | "1h" | "24h" | "7d">("1h");

  const chartData = [
    { t: "12:00", val: 0 },
    { t: "12:15", val: 0 },
    { t: "12:30", val: 0 },
    { t: "12:45", val: -0.05 },
    { t: "13:00", val: -0.05 },
  ];

  const strategies = [
    { nome: "Breakout Fleet", tipo: "Rompimento", trades: 0, resultado: "US$ 0,00", estado: "Calibrando" },
    { nome: "RSI Reversal", tipo: "RSI", trades: 0, resultado: "US$ 0,00", estado: "Calibrando" },
    { nome: "Grid Scalper", tipo: "Grade", trades: 0, resultado: "US$ 0,00", estado: "Calibrando" },
    { nome: "Momentum MACD", tipo: "MACD", trades: 0, resultado: "US$ 0,00", estado: "Calibrando" },
    { nome: "Quant Ensemble", tipo: "Conjunto quant", trades: "1 (0 ganho, 1 perda)", resultado: "−US$ 0,05", estado: "Calibrando" },
    { nome: "Mean Reversion", tipo: "Reversão à média", trades: 0, resultado: "US$ 0,00", estado: "Calibrando" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. CABEÇALHO COM INTERRUPTOR DE MODO PROFISSIONAL */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-instrument-serif text-[40px] sm:text-[48px] text-[#0E1B2C] dark:text-white leading-tight">
            Cockpit
          </h1>
          <p className="text-[14px] text-[#4A586A] dark:text-[#94a3b8]">
            Visão técnica da frota. Aparece quando o modo profissional está ligado.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <span className="text-[14px] font-medium text-[#0E1B2C] dark:text-white">
            Modo profissional
          </span>
          <AppSwitch checked={proMode} onCheckedChange={toggleProMode} />
        </div>
      </div>

      {/* 2. METRICSTRIP */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E7EBF0] dark:divide-white/10 shadow-xs">
        <div className="pb-3 sm:pb-0 sm:pr-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Resultado líquido</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            −US$ 0,05
          </span>
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Depois de taxas e slippage</span>
        </div>

        <div className="py-3 sm:py-0 sm:px-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Slippage médio</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            0,050%
          </span>
          <span className="text-[12px] text-[#0A7A59] dark:text-[#5BE3A8] block font-medium">Dentro do limite de 0,350%</span>
        </div>

        <div className="py-3 sm:py-0 sm:px-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Latência (P95)</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            28 ms
          </span>
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Decisão até envio à Binance</span>
        </div>

        <div className="pt-3 sm:pt-0 sm:pl-6">
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Fluxo de ordens (BTC)</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            0,00
          </span>
          <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block">Equilibrado</span>
        </div>
      </div>

      {/* 3. GRID: RESULTADO AO LONGO DO TEMPO + SAÚDE DO SISTEMA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Resultado ao longo do tempo (8 colunas) */}
        <div className="lg:col-span-8 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white">
                Resultado ao longo do tempo
              </h3>
              <div className="inline-flex p-0.5 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] text-[12px]">
                {(["5m", "1h", "24h", "7d"] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded-full transition-all ${
                      timeframe === tf
                        ? "bg-[#0E1B2C] text-white font-semibold"
                        : "text-[#4A586A] hover:text-[#0E1B2C]"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-36 bg-[#F8FAFC] dark:bg-white/5 rounded-[16px] p-4 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <Line type="stepAfter" dataKey="val" stroke="#0E1B2C" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 pt-6 border-t border-[#E7EBF0] dark:border-white/10 text-[13px]">
            <div>
              <span className="text-[#4A586A] block text-[11px]">Resultado bruto</span>
              <span className="font-bold text-[#0E1B2C] dark:text-white">US$ 0,00</span>
            </div>
            <div>
              <span className="text-[#4A586A] block text-[11px]">Taxas (0,10%)</span>
              <span className="font-bold text-[#0E1B2C] dark:text-white">−US$ 0,05</span>
            </div>
            <div>
              <span className="text-[#4A586A] block text-[11px]">Slippage estimado</span>
              <span className="font-bold text-[#0E1B2C] dark:text-white">−US$ 0,01</span>
            </div>
          </div>
        </div>

        {/* Saúde do Sistema (4 colunas) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
          <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white pb-2 border-b border-[#E7EBF0] dark:border-white/10">
            Saúde do sistema
          </h3>

          <div className="divide-y divide-[#E7EBF0] dark:divide-white/5 text-[13px]">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Conexão em tempo real</span>
              <span className="font-semibold text-[#0E1B2C] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0B8F6A]" /> Conectada
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Banco de dados</span>
              <span className="font-semibold text-[#0E1B2C] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0B8F6A]" /> Sincronizado
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Erros da Binance</span>
              <span className="font-semibold text-[#0E1B2C] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0B8F6A]" /> 0
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Varreduras por minuto</span>
              <span className="font-semibold text-[#0E1B2C] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0B8F6A]" /> 14
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Livro de ofertas</span>
              <span className="font-semibold text-amber-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Indisponível
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4A586A]">Disjuntor de perda</span>
              <span className="font-semibold text-[#0E1B2C] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0B8F6A]" /> Armado
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. ALERTAS */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white">
            Alertas
          </h3>
          <button className="text-[13px] font-semibold text-[#1F5FD6] hover:underline">
            Ver todos (2)
          </button>
        </div>

        {/* Aviso Âmbar com Botão Tentar Novamente */}
        <div className="p-4 rounded-[18px] bg-[#FFF4DC] border border-[#FFE7A8] text-[#6B4300] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
          <div>
            <h5 className="font-bold text-[14px]">
              Dados insuficientes para avaliar o slippage em 6 pares
            </h5>
            <p className="text-[12px] opacity-90 pt-0.5">
              O livro de ofertas não carregou. BTC, ETH, SOL, AAVE, INJ e AVAX ficam sem análise até os dados voltarem. Nenhum risco foi medido.
            </p>
          </div>
          <button className="px-4 py-2 rounded-full border border-[#6B4300] text-[#6B4300] font-semibold text-[13px] hover:bg-black/5 transition-colors shrink-0">
            Tentar novamente
          </button>
        </div>

        <div className="p-4 rounded-[18px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] text-[#4A586A] text-[13px]">
          Nenhuma divergência encontrada entre as fontes de resultado. 3 trades conferidos.
        </div>
      </div>

      {/* 5. TABELA DE ESTRATÉGIAS */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
        <h3 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white">
          Estratégias
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-[#E7EBF0] dark:border-white/10 text-[12px] text-[#4A586A] font-medium">
                <th className="pb-3 pr-4">Estratégia</th>
                <th className="pb-3 px-4">Tipo</th>
                <th className="pb-3 px-4">Trades</th>
                <th className="pb-3 px-4">Resultado</th>
                <th className="pb-3 pl-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EBF0] dark:divide-white/5">
              {strategies.map((st, idx) => (
                <tr key={idx} className="hover:bg-[#F8FAFC] dark:hover:bg-white/5 transition-colors">
                  <td className="py-3.5 pr-4 font-bold text-[#0E1B2C] dark:text-white">
                    {st.nome}
                  </td>
                  <td className="py-3.5 px-4 text-[#4A586A]">
                    {st.tipo}
                  </td>
                  <td className="py-3.5 px-4 text-[#4A586A] tabular-nums">
                    {st.trades}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[#0E1B2C] tabular-nums">
                    {st.resultado}
                  </td>
                  <td className="py-3.5 pl-4">
                    <span className="px-2.5 py-1 rounded-full bg-[#EEF1F5] text-[#4A586A] text-[12px] font-medium">
                      {st.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

