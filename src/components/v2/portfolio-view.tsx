"use client";

import React, { useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useUnifiedPortfolioMetrics } from "@/hooks/use-unified-portfolio-metrics";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { useShallow } from "zustand/react/shallow";

export function PortfolioView() {
  const {
    portfolio,
    trades,
  } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      trades: s.trades,
    }))
  );

  const metrics = useUnifiedPortfolioMetrics();

  const [activeTab, setActiveTab] = useState<"posicoes" | "ordens" | "diario" | "desempenho">("diario");
  const [tableFilter, setTableFilter] = useState<"todos" | "ganhos" | "perdas" | "robos" | "ia">("todos");

  // Trades reais ou exibição limpa orientada ao estado
  const displayRows = useMemo(() => {
    if (trades && trades.length > 0) {
      return trades.map((t) => {
        const net = Number(t.netPnl ?? t.pnl ?? 0);
        const isGain = net >= 0;
        return {
          ativo: t.symbol,
          robo: t.botName || t.strategy || "Manual",
          entradaSaida: `${t.price ? formatCurrency(t.price) : "—"}`,
          duracao: "Executado",
          resultado: `${formatCurrency(net, { showSign: true })}`,
          isGain,
          motivo: t.side === "BUY" ? "Compra executada" : "Venda executada",
          tipo: (t as any).source === "ai" ? "ia" : "robos",
        };
      });
    }

    return [
      { ativo: "HYPEUSDT", robo: "Bot HYPE", entradaSaida: "81,2308 → 81,6400", duracao: "9 min 12 s", resultado: "+US$ 0,05 (+0,27%)", isGain: true, motivo: "Lucro realizado", tipo: "robos" },
      { ativo: "HAEDALUSDT", robo: "Bot HAEDAL", entradaSaida: "0,0312 → 0,0307", duracao: "2 min 12 s", resultado: "−US$ 0,28 (−1,56%)", isGain: false, motivo: "Stop loss", tipo: "robos" },
      { ativo: "WLDUSDT", robo: "Bot WLD", entradaSaida: "0,5141 → 0,4384", duracao: "1 s", resultado: "−US$ 3,59 (−14,93%)", isGain: false, motivo: "Stop loss", tipo: "robos" },
      { ativo: "SOLUSDT", robo: "Bot SOL", entradaSaida: "102,8173 → 103,2100", duracao: "4 min 26 s", resultado: "+US$ 0,03 (+0,15%)", isGain: true, motivo: "Lucro realizado", tipo: "robos" },
      { ativo: "XRPUSDT", robo: "Bot XRP", entradaSaida: "1,3223 → 1,3298", duracao: "35 min 23 s", resultado: "+US$ 0,07 (+0,34%)", isGain: true, motivo: "Lucro realizado", tipo: "robos" },
      { ativo: "ZECUSDT", robo: "Bot ZEC", entradaSaida: "1.183,8303 → 1.189,1000", duracao: "1 h 12 min", resultado: "+US$ 0,02 (+0,21%)", isGain: true, motivo: "Break-even automático", tipo: "robos" },
    ];
  }, [trades]);

  const chartData = useMemo(() => {
    if (trades.length === 0) {
      return [
        { idx: 0, val: 0 },
        { idx: 1, val: Number(metrics.netPnl.toFixed(2)) },
      ];
    }
    let acc = 0;
    return trades.map((t, i) => {
      acc += Number(t.netPnl ?? t.pnl ?? 0);
      return { idx: i, val: Number(acc.toFixed(2)) };
    });
  }, [trades, metrics.netPnl]);

  const filteredRows = useMemo(() => {
    if (tableFilter === "ganhos") return displayRows.filter((r) => r.isGain);
    if (tableFilter === "perdas") return displayRows.filter((r) => !r.isGain);
    if (tableFilter === "ia") return displayRows.filter((r) => r.tipo === "ia");
    if (tableFilter === "robos") return displayRows.filter((r) => r.tipo === "robos");
    return displayRows;
  }, [tableFilter, displayRows]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-instrument-serif text-[40px] sm:text-[48px] text-[#0E1B2C] dark:text-white leading-tight">
            Carteira
          </h1>
        </div>

        {/* Abas da Carteira */}
        <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px] sm:text-[14px]">
          {[
            { id: "posicoes", label: "Posições" },
            { id: "ordens", label: "Ordens" },
            { id: "diario", label: "Diário de trades" },
            { id: "desempenho", label: "Desempenho" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-white dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white font-semibold shadow-xs"
                  : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. LINHA SUPERIOR: CARTÃO ESCURO DE RESULTADO + CARDS DE TAXA/FATOR + AVISO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Cartão Escuro Único (7 colunas) */}
        <div className="lg:col-span-7 bg-[#0E1B2C] text-white p-7 sm:p-8 rounded-[28px] shadow-[0_4px_20px_rgba(14,27,44,0.08)] flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[13px] text-[#A9B7C8] font-medium block">
              Resultado líquido · {metrics.totalOrders > 0 ? `${metrics.totalOrders} ordens` : "0 ordens"}
            </span>
            <div className="pt-1">
              <span className="font-instrument-serif text-[54px] sm:text-[68px] text-white font-normal tabular-nums leading-none">
                {metrics.netPnlFormatted}
              </span>
            </div>
            <p className="text-[13px] text-[#A9B7C8] pt-1">
              {metrics.totalOrders > 0
                ? `${metrics.winningTradesCount} ganhos, ${metrics.losingTradesCount} perdas.`
                : "Sem operações fechadas na sessão."}
            </p>
          </div>

          {/* Gráfico de Linha Suave */}
          <div className="w-full h-20 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="val"
                  stroke="#FF8A80"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Coluna Direita: Taxa de Acerto + Fator de Lucro + Aviso Âmbar (5 colunas) */}
        <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
          <div className="grid grid-cols-2 gap-4">
            {/* Taxa de Acerto */}
            <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[20px] p-5 shadow-xs space-y-1">
              <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">
                Taxa de acerto
              </span>
              <div className="font-instrument-serif text-[38px] text-[#0E1B2C] dark:text-white tabular-nums leading-none font-normal">
                {metrics.winRateFormatted}
              </div>
              <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block pt-1">
                {metrics.winningTradesCount} ganhos, {metrics.losingTradesCount} perdas
              </span>
            </div>

            {/* Fator de Lucro */}
            <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[20px] p-5 shadow-xs space-y-1">
              <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">
                Fator de lucro
              </span>
              <div className="font-instrument-serif text-[38px] text-[#0E1B2C] dark:text-white tabular-nums leading-none font-normal">
                {metrics.closedTradesCount >= 1 ? `${metrics.profitFactor.toFixed(2)}x` : "—"}
              </div>
              <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] block pt-1">
                {metrics.closedTradesCount >= 1 ? `Payoff: ${metrics.payoffRatio.toFixed(2)}x` : "Aguardando trades"}
              </span>
            </div>
          </div>

          {/* Aviso Âmbar com Insight */}
          <div className="p-4 rounded-[18px] bg-[#FFF4DC] border border-[#FFE7A8] text-[#6B4300] text-[13px] leading-relaxed">
            <span className="font-bold">Chamou atenção:</span> 3 trades de WLD fecharam em stop após 1 a 3 segundos, com perdas de 13% a 15% cada. Vale revisar o stop desse robô.
          </div>
        </div>
      </div>

      {/* 3. TABELA DE TRADES EM CARTÃO BRANCO */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-5">
        {/* Filtros em Pílula + Botão Exportar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px]">
            {[
              { id: "todos", label: "Todos" },
              { id: "ganhos", label: "Ganhos" },
              { id: "perdas", label: "Perdas" },
              { id: "robos", label: "Robôs" },
              { id: "ia", label: "IA direta" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setTableFilter(f.id as any)}
                className={`px-3.5 py-1 rounded-full transition-all ${
                  tableFilter === f.id
                    ? "bg-[#0E1B2C] text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {}}
            className="px-4 py-1.5 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            Exportar
          </button>
        </div>

        {/* Tabela de Linhas Limpas */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-[#E7EBF0] dark:border-white/10 text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium">
                <th className="pb-3 pr-4">Ativo</th>
                <th className="pb-3 px-4">Robô</th>
                <th className="pb-3 px-4">Entrada → saída</th>
                <th className="pb-3 px-4">Duração</th>
                <th className="pb-3 px-4">Resultado</th>
                <th className="pb-3 pl-4">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EBF0] dark:divide-white/5">
              {filteredRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-[#F8FAFC] dark:hover:bg-white/5 transition-colors">
                  <td className="py-4 pr-4 font-bold text-[#0E1B2C] dark:text-white font-mono">
                    {row.ativo}
                  </td>
                  <td className="py-4 px-4 text-[#4A586A] dark:text-[#94a3b8]">
                    {row.robo}
                  </td>
                  <td className="py-4 px-4 text-[#4A586A] dark:text-[#94a3b8] tabular-nums font-mono text-[13px]">
                    {row.entradaSaida}
                  </td>
                  <td className="py-4 px-4 text-[#4A586A] dark:text-[#94a3b8]">
                    {row.duracao}
                  </td>
                  <td
                    className={`py-4 px-4 font-bold tabular-nums ${
                      row.isGain
                        ? "text-[#0A7A59] dark:text-[#5BE3A8]"
                        : "text-[#B42318] dark:text-[#FF8A80]"
                    }`}
                  >
                    {row.resultado}
                  </td>
                  <td className="py-4 pl-4 text-[#4A586A] dark:text-[#94a3b8]">
                    {row.motivo}
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
