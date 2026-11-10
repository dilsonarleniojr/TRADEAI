"use client";

import React, { useState, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  AppCard,
  MetricDisplay,
  MetricStrip,
  AppChip,
  SegmentedControl,
  type SegmentedItem,
} from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import { HistorySection } from "@/components/history/history-section";
import { TradeJournalPanel } from "@/components/journal/trade-journal-panel";
import { EquityCurve } from "@/components/bot/equity-curve";
import { Briefcase, TrendingUp, TrendingDown, Layers, BookOpen, BarChart3 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function PortfolioView() {
  const {
    portfolio,
    positions,
    trades,
    closePosition,
  } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      positions: s.positions,
      trades: s.trades,
      closePosition: s.closePosition,
    }))
  );

  const [activeTab, setActiveTab] = useState<"trades" | "positions" | "journal" | "equity">("trades");

  // Métricas consolidadas da Carteira
  const realizedPnl = portfolio?.realizedPnlUsd ?? 0;
  const unrealizedPnl = portfolio?.unrealizedPnlUsd ?? 0;
  const netPnl = realizedPnl + unrealizedPnl;
  const isNetGain = netPnl >= 0;

  const totalTradesCount = trades.length;
  const winningTrades = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = totalTradesCount > 0 ? (winningTrades / totalTradesCount) * 100 : 0;

  const tabItems: SegmentedItem<"trades" | "positions" | "journal" | "equity">[] = [
    { id: "trades", label: "Histórico de Trades", badge: trades.length },
    { id: "positions", label: "Posições Abertas", badge: positions.length },
    { id: "journal", label: "Diário de Trades" },
    { id: "equity", label: "Curva de Equity" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* 1. CARTÃO ESCURO FOCAL DE RESULTADO LÍQUIDO */}
      <AppCard variant="focal" padding="lg">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#223652]">
          <div className="space-y-2">
            <span className="text-[13px] md:text-[14px] font-instrument-sans font-medium text-[#A9B7C8] flex items-center space-x-2">
              <Briefcase className="w-4 h-4 text-[#5BE3A8]" />
              <span>Resultado Líquido Consolidado</span>
            </span>

            <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
              <span className="font-instrument-serif text-[48px] sm:text-[64px] md:text-[76px] tracking-[-0.02em] leading-none text-white tabular-nums">
                {isNetGain ? "+" : ""}{formatCurrency(netPnl)}
              </span>

              <AppChip variant={isNetGain ? "focal-gain" : "focal-loss"} className="text-sm">
                {isNetGain ? "+" : ""}{formatPercent(portfolio?.totalReturnPercent ?? (netPnl / 10000) * 100)} total
              </AppChip>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-[#A9B7C8] block font-mono">
              Patrimônio sob Custódia
            </span>
            <span className="font-instrument-serif text-2xl text-white font-bold tabular-nums">
              {formatCurrency(portfolio?.totalBalanceUsd ?? 10000)}
            </span>
          </div>
        </div>

        {/* Linha de Métricas Secundárias */}
        <div className="pt-6">
          <MetricStrip onFocalDark={true}>
            <MetricDisplay
              label="Lucro Realizado"
              value={`${realizedPnl >= 0 ? "+" : ""}${formatCurrency(realizedPnl)}`}
              size="compact"
              isGain={realizedPnl >= 0}
              onFocalDark={true}
            />
            <MetricDisplay
              label="Lucro Não Realizado"
              value={`${unrealizedPnl >= 0 ? "+" : ""}${formatCurrency(unrealizedPnl)}`}
              size="compact"
              isGain={unrealizedPnl >= 0}
              onFocalDark={true}
            />
            <MetricDisplay
              label="Taxa de Acerto (Win Rate)"
              value={`${winRate.toFixed(1)}%`}
              size="compact"
              onFocalDark={true}
            />
            <MetricDisplay
              label="Operações Totais"
              value={totalTradesCount.toString()}
              size="compact"
              onFocalDark={true}
            />
          </MetricStrip>
        </div>
      </AppCard>

      {/* 2. BARRA DE ABAS DA CARTEIRA */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E7EBF0] dark:border-white/10">
        <SegmentedControl
          items={tabItems}
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
        />
      </div>

      {/* 3. CONTEÚDO DAS ABAS */}
      <div className="min-h-[500px]">
        {activeTab === "trades" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-4 sm:p-6 shadow-xs">
            <HistorySection />
          </div>
        )}

        {activeTab === "positions" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-6 shadow-xs space-y-4">
            <h3 className="font-instrument-serif text-[24px] text-[#0E1B2C] dark:text-[#f8fafc]">
              Posições em Aberto ({positions.length})
            </h3>
            {positions.length === 0 ? (
              <div className="text-center py-12 text-[#4A586A] dark:text-[#94a3b8] font-instrument-sans">
                Nenhuma posição aberta no momento. O capital está 100% protegido em caixa.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-instrument-sans text-sm">
                  <thead>
                    <tr className="border-b border-[#E7EBF0] dark:border-white/10 text-xs text-[#4A586A] dark:text-[#94a3b8] font-semibold">
                      <th className="py-3 px-4">Ativo</th>
                      <th className="py-3 px-4">Lado</th>
                      <th className="py-3 px-4">Quantidade</th>
                      <th className="py-3 px-4">Preço Entrada</th>
                      <th className="py-3 px-4">Preço Atual</th>
                      <th className="py-3 px-4">PnL Não Realizado</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7EBF0] dark:divide-white/5">
                    {positions.map((pos, idx) => {
                      const isGain = (pos.unrealizedPnl ?? 0) >= 0;
                      return (
                        <tr key={idx} className="hover:bg-[#EEF1F5]/50 dark:hover:bg-white/5">
                          <td className="py-3.5 px-4 font-bold text-[#0E1B2C] dark:text-white">
                            {pos.symbol}
                          </td>
                          <td className="py-3.5 px-4">
                            <AppChip variant={pos.side === "LONG" ? "success" : "danger"}>
                              {pos.side}
                            </AppChip>
                          </td>
                          <td className="py-3.5 px-4 font-mono tabular-nums">{pos.amount}</td>
                          <td className="py-3.5 px-4 font-mono tabular-nums">{formatCurrency(pos.entryPrice)}</td>
                          <td className="py-3.5 px-4 font-mono tabular-nums">{formatCurrency(pos.currentPrice)}</td>
                          <td className={`py-3.5 px-4 font-instrument-serif text-[16px] font-bold tabular-nums ${isGain ? "text-[#0A7A59]" : "text-[#B42318]"}`}>
                            {isGain ? "+" : ""}{formatCurrency(pos.unrealizedPnl ?? 0)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => closePosition(pos.symbol)}
                              className="px-3 py-1 text-xs rounded-full border border-[#B42318] text-[#B42318] hover:bg-[#FDF4F3] transition-colors font-medium"
                            >
                              Fechar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "journal" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-4 sm:p-6 shadow-xs">
            <TradeJournalPanel />
          </div>
        )}

        {activeTab === "equity" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-6 shadow-xs">
            <EquityCurve />
          </div>
        )}
      </div>
    </div>
  );
}

