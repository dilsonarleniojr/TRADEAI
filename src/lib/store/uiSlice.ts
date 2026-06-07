import type { StateCreator } from "zustand";
import type { PriceAlert, TickerData, ActiveSection } from "./types";

export interface UISlice {
  // Active section/tab
  activeSection: ActiveSection;
  setActiveSection: (section: ActiveSection) => void;

  // Price alerts
  alerts: PriceAlert[];
  addAlert: (alert: PriceAlert) => void;
  removeAlert: (id: string) => void;
  updateAlertPrices: (tickers: Record<string, TickerData>) => void;

  // Watchlist
  watchlist: string[];
  toggleWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;

  // Category filter
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;

  // Symbol search
  symbolSearchQuery: string;
  setSymbolSearchQuery: (query: string) => void;

  // Dashboard widget layout order (for drag-and-drop)
  dashboardLayout: string[];
  setDashboardLayout: (layout: string[]) => void;

  // Dashboard widget visibility
  dashboardVisibility: Record<string, boolean>;
  toggleWidgetVisibility: (widgetId: string) => void;
}

// Default widget order
const DEFAULT_DASHBOARD_LAYOUT = [
  "financial-hub",
  "ai-top-picks",
  "fear-greed",
  "multi-timeframe",
  "portfolio-pro",
  "pnl-tracker",
  "portfolio-rebalancing",
  "market-overview",
  "funding-rates",
  "market-sentiment",
  "market-highlights",
  "market-table",
  "watchlist",
  "price-alerts",
  "correlation-heatmap",
  "whale-tracker",
  "liquidation-heatmap",
  "social-sentiment",
  "on-chain",
  "insights",
  "ml-pipeline",
  "ai-signals",
  "recent-trades",
  "trading-calculator",
  "crypto-news",
  "strategy-comparison",
];

// Load saved layout from localStorage
function loadDashboardLayout(): string[] {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_LAYOUT;
  try {
    const saved = localStorage.getItem("tradeai-dashboard-layout");
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_DASHBOARD_LAYOUT;
}

function loadDashboardVisibility(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const saved = localStorage.getItem("tradeai-dashboard-visibility");
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set, get) => ({
  // Active section
  activeSection: "dashboard",
  setActiveSection: (section) => set({ activeSection: section }),

  // Price alerts
  alerts: [],
  addAlert: (alert) =>
    set((state) => ({
      alerts: [...state.alerts, alert],
    })),
  removeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    })),
  updateAlertPrices: (tickers) =>
    set((state) => ({
      alerts: state.alerts.map((alert) => {
        const ticker = tickers[alert.symbol];
        if (!ticker) return alert;
        const newPrice = ticker.price;
        
        let triggered = alert.isTriggered;
        let message = alert.message || "";
        const alertType = alert.type || "price";
        
        if (!alert.isTriggered) {
          if (alertType === "price") {
            triggered = alert.direction === "above"
              ? newPrice >= (alert.targetPrice || 0)
              : newPrice <= (alert.targetPrice || 0);
            if (triggered) {
              message = `Preço de ${alert.symbol.replace("USDT", "")} atingiu $${newPrice} (Meta: $${alert.targetPrice})`;
            }
          } else if (alertType === "volatility") {
            const vol = Math.abs(ticker.priceChangePercent);
            triggered = vol >= (alert.threshold || 0);
            if (triggered) {
              message = `Volatilidade em ${alert.symbol.replace("USDT", "")}: Variação de ${vol.toFixed(2)}% (Limite: ${alert.threshold}%)`;
            }
          } else if (alertType === "liquidity") {
            const volume = ticker.volume;
            triggered = volume <= (alert.threshold || 0);
            if (triggered) {
              message = `Liquidez de ${alert.symbol.replace("USDT", "")} sob alerta: Volume nas 24h caiu para ${volume.toFixed(2)} (Limite: ${alert.threshold})`;
            }
          } else if (alertType === "sr_breakout") {
            if (alert.srLevel === "resistance") {
              triggered = newPrice >= ticker.high;
              if (triggered) {
                message = `Rompimento de Resistência em ${alert.symbol.replace("USDT", "")}: atingiu $${newPrice} (Máxima 24h: $${ticker.high})`;
              }
            } else {
              triggered = newPrice <= ticker.low;
              if (triggered) {
                message = `Rompimento de Suporte em ${alert.symbol.replace("USDT", "")}: atingiu $${newPrice} (Mínima 24h: $${ticker.low})`;
              }
            }
          }
        }
        
        return {
          ...alert,
          currentPrice: newPrice,
          isTriggered: triggered,
          message,
        };
      }),
    })),

  // Watchlist
  watchlist: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"],
  toggleWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.includes(symbol)
        ? state.watchlist.filter((s) => s !== symbol)
        : [...state.watchlist, symbol],
    })),
  isInWatchlist: (symbol) => {
    return get().watchlist.includes(symbol);
  },

  // Category filter
  categoryFilter: "all",
  setCategoryFilter: (category) => set({ categoryFilter: category }),

  // Symbol search
  symbolSearchQuery: "",
  setSymbolSearchQuery: (query) => set({ symbolSearchQuery: query }),

  // Dashboard layout (persisted in localStorage)
  dashboardLayout: loadDashboardLayout(),
  setDashboardLayout: (layout) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tradeai-dashboard-layout", JSON.stringify(layout));
    }
    set({ dashboardLayout: layout });
  },

  // Dashboard visibility
  dashboardVisibility: loadDashboardVisibility(),
  toggleWidgetVisibility: (widgetId) => {
    const current = get().dashboardVisibility;
    const updated = { ...current, [widgetId]: !current[widgetId] };
    if (typeof window !== "undefined") {
      localStorage.setItem("tradeai-dashboard-visibility", JSON.stringify(updated));
    }
    set({ dashboardVisibility: updated });
  },
});
