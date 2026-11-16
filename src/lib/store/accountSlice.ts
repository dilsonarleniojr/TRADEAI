import type { StateCreator } from "zustand";
import type { TradingMode } from "./types";

export const TRADING_MODE_STORAGE_KEY = "tradeai_trading_mode_v1";
export const SELECTED_EXCHANGE_STORAGE_KEY = "tradeai_selected_exchange_v1";

export type SupportedExchange = "binance" | "okx";

export type ConnectionProbeStatus = "checking" | "ok" | "warning" | "error" | "unconfigured";

export interface ServiceProbeResult {
  status: ConnectionProbeStatus;
  label: string;
  detail: string;
  latencyMs?: number;
  checkedAt?: string;
  provider?: string;
  model?: string;
}

export interface StartupConnectionsHealth {
  binance: ServiceProbeResult;
  okx: ServiceProbeResult;
  ai: ServiceProbeResult;
  lastRunAt: number | null;
}

const DEFAULT_STARTUP_HEALTH: StartupConnectionsHealth = {
  binance: { status: "checking", label: "Binance", detail: "Testando conexão..." },
  okx: { status: "checking", label: "OKX", detail: "Testando conexão..." },
  ai: { status: "checking", label: "Motor de IA", detail: "Testando conexão..." },
  lastRunAt: null,
};

async function safeParseJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let inFlightConnectionTests: Promise<StartupConnectionsHealth> | null = null;

export function getPersistedTradingMode(): TradingMode {
  if (typeof window === "undefined") return "paper";
  try {
    const saved = localStorage.getItem(TRADING_MODE_STORAGE_KEY);
    if (saved === "live" || saved === "paper") return saved;
  } catch {}
  return "paper";
}

export function getPersistedExchange(): SupportedExchange {
  if (typeof window === "undefined") return "binance";
  try {
    const saved = localStorage.getItem(SELECTED_EXCHANGE_STORAGE_KEY);
    if (saved === "binance" || saved === "okx") return saved;
  } catch {}
  return "binance";
}

export interface AccountSlice {
  // Trading mode
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;

  // Selected Exchange (Binance or OKX)
  selectedExchange: SupportedExchange;
  setSelectedExchange: (exchange: SupportedExchange) => void;

  // Binance connection state (as chaves ficam apenas no servidor, em cookie httpOnly)
  binanceConnected: boolean;
  binanceTestnet: boolean;
  setBinanceConnected: (connected: boolean) => void;
  setBinanceTestnet: (testnet: boolean) => void;

  // OKX connection state (as chaves ficam apenas no servidor, em cookie httpOnly)
  okxConnected: boolean;
  okxSimulated: boolean;
  setOkxConnected: (connected: boolean) => void;
  setOkxSimulated: (simulated: boolean) => void;

  // Startup & on-demand health probe results (Binance, OKX & AI)
  startupHealth: StartupConnectionsHealth;
  setStartupHealth: (partial: Partial<StartupConnectionsHealth>) => void;
  runStartupConnectionTests: () => Promise<StartupConnectionsHealth>;
}

function syncAccountInBrowser(mode: string, exchange: SupportedExchange, getState: () => any, resetBreakerOnSwitch = false) {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  fetch(`/api/account?mode=${mode}&exchange=${exchange}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json?.success && json.data) {
        getState().setAccount?.(json.data);
        if (resetBreakerOnSwitch) {
          import("@/lib/bot/multi-bot-engine")
            .then((m) => {
              if (m.getCircuitBreakerStatus?.().tripped) {
                m.resetGlobalCircuitBreaker?.();
              }
            })
            .catch(() => {});
        }
      }
    })
    .catch(() => {});
}

export const createAccountSlice: StateCreator<AccountSlice, [], [], AccountSlice> = (set, get) => ({
  // Trading mode - inicialização segura para SSR/hidratação; DataProvider sincroniza com localStorage após montar
  tradingMode: "paper",
  setTradingMode: (mode) => {
    const prevMode = get().tradingMode;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(TRADING_MODE_STORAGE_KEY, mode);
      } catch {}
    }
    set({ tradingMode: mode });
    if (prevMode !== mode) {
      const exch = get().selectedExchange || "binance";
      syncAccountInBrowser(mode, exch, get, true);
    }
  },

  // Selected Exchange
  selectedExchange: "binance",
  setSelectedExchange: (exchange) => {
    const prevExchange = get().selectedExchange;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SELECTED_EXCHANGE_STORAGE_KEY, exchange);
      } catch {}
    }
    set({ selectedExchange: exchange });
    if (prevExchange !== exchange) {
      const mode = get().tradingMode || "paper";
      syncAccountInBrowser(mode, exchange, get, true);
    }
  },

  // Binance connection state
  binanceConnected: false,
  binanceTestnet: false,
  setBinanceConnected: (connected) => set({ binanceConnected: connected }),
  setBinanceTestnet: (testnet) => set({ binanceTestnet: testnet }),

  // OKX connection state
  okxConnected: false,
  okxSimulated: false,
  setOkxConnected: (connected) => set({ okxConnected: connected }),
  setOkxSimulated: (simulated) => set({ okxSimulated: simulated }),

  // Startup connection tests state
  startupHealth: DEFAULT_STARTUP_HEALTH,
  setStartupHealth: (partial) =>
    set((state) => ({
      startupHealth: {
        ...state.startupHealth,
        ...partial,
      },
    })),

  runStartupConnectionTests: async () => {
    if (typeof window === "undefined" || typeof fetch !== "function") {
      return get().startupHealth;
    }
    if (inFlightConnectionTests) {
      return inFlightConnectionTests;
    }

    set({
      startupHealth: {
        binance: { status: "checking", label: "Binance", detail: "Testando conexão..." },
        okx: { status: "checking", label: "OKX", detail: "Testando conexão..." },
        ai: { status: "checking", label: "Motor de IA", detail: "Testando conexão..." },
        lastRunAt: get().startupHealth.lastRunAt,
      },
    });

    const probeBinance = async (): Promise<ServiceProbeResult> => {
      const checkedAt = new Date().toLocaleTimeString("pt-BR");
      const t0 = performance.now();
      try {
        const loginRes = await fetch("/api/binance/login", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const loginJson = await safeParseJson(loginRes);
        const connected = Boolean(loginRes.ok && loginJson?.connected);
        const testnet = Boolean(loginJson?.testnet);

        set({ binanceConnected: connected, binanceTestnet: testnet });

        if (!connected) {
          return {
            status: "unconfigured",
            label: "Binance sem chave",
            detail: "Nenhuma chave API Binance salva nesta sessão",
            latencyMs: Math.round(performance.now() - t0),
            checkedAt,
          };
        }

        const accRes = await fetch("/api/account?mode=live&exchange=binance", {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const accJson = await safeParseJson(accRes);
        const latencyMs = Math.round(performance.now() - t0);

        if (accRes.ok && accJson?.success && String(accJson?.data?.source || "").startsWith("binance")) {
          const total = Number(accJson.data.totalValue ?? accJson.data.cashBalance ?? 0);
          return {
            status: "ok",
            label: testnet ? "Binance Testnet OK" : "Binance Spot OK",
            detail: `Conectada · Saldo $${total.toFixed(2)} USDT · ${latencyMs}ms`,
            latencyMs,
            checkedAt,
          };
        }

        return {
          status: "error",
          label: "Binance com falha",
          detail: accJson?.error || `Erro HTTP ${accRes.status} ao validar conta Binance`,
          latencyMs,
          checkedAt,
        };
      } catch (err: any) {
        return {
          status: "error",
          label: "Binance inacessível",
          detail: err?.message || "Tempo esgotado ao conectar na Binance",
          latencyMs: Math.round(performance.now() - t0),
          checkedAt,
        };
      }
    };

    const probeOkx = async (): Promise<ServiceProbeResult> => {
      const checkedAt = new Date().toLocaleTimeString("pt-BR");
      const t0 = performance.now();
      try {
        const loginRes = await fetch("/api/okx/login", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const loginJson = await safeParseJson(loginRes);
        const connected = Boolean(loginRes.ok && loginJson?.connected);
        const simulated = Boolean(loginJson?.simulated);

        set({ okxConnected: connected, okxSimulated: simulated });

        if (!connected) {
          return {
            status: "unconfigured",
            label: "OKX sem chave",
            detail: "Nenhuma chave API OKX salva nesta sessão",
            latencyMs: Math.round(performance.now() - t0),
            checkedAt,
          };
        }

        const accRes = await fetch("/api/account?mode=live&exchange=okx", {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        const accJson = await safeParseJson(accRes);
        const latencyMs = Math.round(performance.now() - t0);

        if (accRes.ok && accJson?.success && String(accJson?.data?.source || "").startsWith("okx")) {
          const total = Number(accJson.data.totalValue ?? accJson.data.totalBalance ?? accJson.data.cashBalance ?? 0);
          const warning = accJson.data.warning ? String(accJson.data.warning) : "";
          if (warning) {
            const isReadOnly = warning.toLowerCase().includes("read_only") || warning.toLowerCase().includes("leitura");
            return {
              status: "warning",
              label: isReadOnly ? "OKX Somente Leitura" : simulated ? "OKX Demo (Aviso)" : "OKX Real (Aviso)",
              detail: warning,
              latencyMs,
              checkedAt,
            };
          }
          return {
            status: "ok",
            label: simulated ? "OKX Demo OK" : "OKX Real OK",
            detail: `Conectada · Saldo $${total.toFixed(2)} USDT · ${latencyMs}ms`,
            latencyMs,
            checkedAt,
          };
        }

        return {
          status: "error",
          label: "OKX com falha",
          detail: accJson?.error || `Erro HTTP ${accRes.status} ao validar conta OKX`,
          latencyMs,
          checkedAt,
        };
      } catch (err: any) {
        return {
          status: "error",
          label: "OKX inacessível",
          detail: err?.message || "Tempo esgotado ao conectar na OKX",
          latencyMs: Math.round(performance.now() - t0),
          checkedAt,
        };
      }
    };

    const probeAi = async (): Promise<ServiceProbeResult> => {
      const checkedAt = new Date().toLocaleTimeString("pt-BR");
      const t0 = performance.now();
      try {
        const settingsRes = await fetch("/api/ai/settings", {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        const settingsJson = await safeParseJson(settingsRes);
        const activeProvider: string = settingsJson?.data?.provider || "gemini";
        const providersList: any[] = Array.isArray(settingsJson?.data?.providers) ? settingsJson.data.providers : [];
        const activeMeta = providersList.find((p) => p.id === activeProvider);

        if (activeMeta && !activeMeta.configured) {
          return {
            status: "unconfigured",
            label: `IA (${activeProvider.toUpperCase()}) sem chave`,
            detail: `Configure uma chave API em Ajustes de IA para ${activeMeta.name || activeProvider}`,
            latencyMs: Math.round(performance.now() - t0),
            checkedAt,
            provider: activeProvider,
            model: activeMeta.model,
          };
        }

        const testRes = await fetch("/api/ai/settings/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: activeProvider }),
          signal: AbortSignal.timeout(14000),
        });
        const testJson = await safeParseJson(testRes);
        const latencyMs = testJson?.latencyMs ?? Math.round(performance.now() - t0);

        if (testRes.ok && testJson?.success) {
          const prov = String(testJson.provider || activeProvider).toUpperCase();
          const mod = testJson.model || activeMeta?.model || "";
          return {
            status: "ok",
            label: `IA (${prov}) OK`,
            detail: `${mod ? `${mod} · ` : ""}Conectada em ${latencyMs}ms`,
            latencyMs,
            checkedAt,
            provider: testJson.provider || activeProvider,
            model: mod,
          };
        }

        return {
          status: "error",
          label: `IA (${activeProvider.toUpperCase()}) com falha`,
          detail: testJson?.error || `Falha HTTP ${testRes.status} ao testar motor de IA`,
          latencyMs,
          checkedAt,
          provider: activeProvider,
          model: testJson?.model || activeMeta?.model,
        };
      } catch (err: any) {
        return {
          status: "error",
          label: "IA inacessível",
          detail: err?.message || "Erro ao testar provedor de IA",
          latencyMs: Math.round(performance.now() - t0),
          checkedAt,
        };
      }
    };

    const run = async (): Promise<StartupConnectionsHealth> => {
      try {
        const [binance, okx, ai] = await Promise.all([probeBinance(), probeOkx(), probeAi()]);
        const nextHealth: StartupConnectionsHealth = {
          binance,
          okx,
          ai,
          lastRunAt: Date.now(),
        };
        set({ startupHealth: nextHealth });
        return nextHealth;
      } finally {
        inFlightConnectionTests = null;
      }
    };

    inFlightConnectionTests = run();
    return inFlightConnectionTests;
  },
});
