import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import {
  selectPortfolioMetrics,
  type PortfolioMetrics,
  type UnifiedPortfolioInput,
  type UnifiedTrade,
} from "@/lib/selectors/portfolioMetrics";

/**
 * Hook canônico de métricas de portfólio e performance para o TradeAI.
 * Garante que Painel Principal, Cockpit, Diário, Barra Inferior e Robôs
 * exibam rigorosamente os mesmos números e obedeçam ao mesmo filtro de modo (paper vs live).
 */
export function useUnifiedPortfolioMetrics(overrideMode?: "paper" | "live" | "all"): PortfolioMetrics {
  const { portfolio, trades, tradingMode } = useCryptoStore(
    useShallow((s) => ({
      portfolio: s.portfolio,
      trades: s.trades,
      tradingMode: s.tradingMode,
    }))
  );

  const activeMode = overrideMode ?? (tradingMode === "live" ? "live" : "paper");

  return useMemo(() => {
    const portfolioInput: UnifiedPortfolioInput = {
      totalBalance: portfolio?.totalValue ?? 10000,
      cashBalance: portfolio?.cashBalance ?? 10000,
      positions: portfolio?.positions ?? [],
      initialBalance: 10000,
      pnl: portfolio?.pnl,
      pnlPercent: portfolio?.pnlPercent,
    };

    return selectPortfolioMetrics(
      portfolioInput,
      (trades || []) as UnifiedTrade[],
      { mode: activeMode }
    );
  }, [portfolio, trades, activeMode]);
}
