"use client";

import React, { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { SegmentedControl, type SegmentedItem, AppChip } from "./atoms";
import { ChartSection } from "@/components/chart/chart-section";
import { ChatSection } from "@/components/ai/chat-section";
import { TradeHubSection } from "@/components/trade-hub";
import { formatCurrency, formatPercent } from "@/lib/format";
import { TrendingUp, Sparkles, Zap, BarChart2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function MarketView() {
  const { selectedSymbol, tickers } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      tickers: s.tickers,
    }))
  );

  const [activeTab, setActiveTab] = useState<"chart" | "ai" | "hub">("chart");

  const ticker = tickers[selectedSymbol];
  const price = ticker?.price ?? 84000;
  const change24h = ticker?.change24h ?? 1.25;
  const isGain = change24h >= 0;

  const tabItems: SegmentedItem<"chart" | "ai" | "hub">[] = [
    { id: "chart", label: "Gráfico & Livro L2", icon: <BarChart2 className="w-4 h-4" /> },
    { id: "ai", label: "Ideias da IA & Copilot", icon: <Sparkles className="w-4 h-4" /> },
    { id: "hub", label: "Terminal Rápido", icon: <Zap className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* CABEÇALHO DO MERCADO COM ATIVO ATUAL */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-[#E7EBF0] dark:border-white/10">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-instrument-serif text-[32px] sm:text-[40px] text-[#0E1B2C] dark:text-[#f8fafc] leading-tight">
              {selectedSymbol}
            </h1>
            <AppChip variant={isGain ? "success" : "danger"} className="text-xs">
              {isGain ? "+" : ""}{formatPercent(change24h)}
            </AppChip>
          </div>
          <div className="flex items-baseline space-x-3">
            <span className="font-instrument-serif text-[26px] sm:text-[32px] font-bold text-[#0E1B2C] dark:text-[#f8fafc] tabular-nums">
              {formatCurrency(price)}
            </span>
            <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
              Cotação ao vivo via Binance
            </span>
          </div>
        </div>

        {/* Segmented Control para alternar visão do Mercado */}
        <div className="self-start sm:self-auto">
          <SegmentedControl
            items={tabItems}
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
          />
        </div>
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="min-h-[600px]">
        {activeTab === "chart" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-4 sm:p-6 shadow-xs">
            <ChartSection />
          </div>
        )}

        {activeTab === "ai" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-4 sm:p-6 shadow-xs">
            <ChatSection />
          </div>
        )}

        {activeTab === "hub" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-4 sm:p-6 shadow-xs">
            <TradeHubSection />
          </div>
        )}
      </div>
    </div>
  );
}

