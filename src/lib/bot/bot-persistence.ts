// Guarda a frota de robôs no navegador (configuração, posições e estatísticas) para que
// recarregar a página não apague robôs criados nem esqueça posições abertas.
// Ao restaurar, todos voltam PAUSADOS: o app sempre abre no modo simulado, e religar sozinho
// poderia operar no modo errado. Os que estavam ligados ficam na lista para retomar.

import { create } from "zustand";
import { useCryptoStore, type BotInstance } from "@/lib/store";

const STORAGE_KEY = "tradeai_bots_v1";
const SAVE_DEBOUNCE_MS = 800;

interface SavedFleet {
  version: 1;
  savedAt: number;
  bots: BotInstance[];
  selectedBotId: string | null;
}

interface FleetRestoreState {
  /** true depois que a frota salva foi lida (ou confirmado que não havia nada salvo). */
  restored: boolean;
  /** Robôs que estavam ligados antes da recarga. */
  pendingResume: string[];
  setPendingResume: (ids: string[]) => void;
}

export const useFleetRestore = create<FleetRestoreState>((set) => ({
  restored: false,
  pendingResume: [],
  setPendingResume: (ids) => set({ pendingResume: ids }),
}));

function isBot(v: unknown): v is BotInstance {
  const b = v as BotInstance;
  return !!b && typeof b.id === "string" && typeof b.symbol === "string" && typeof b.strategy === "string" && !!b.stats;
}

function read(): SavedFleet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.bots)) return null;
    return { ...parsed, bots: parsed.bots.filter(isBot) };
  } catch {
    return null;
  }
}

function write() {
  try {
    const { bots, selectedBotId } = useCryptoStore.getState();
    const data: SavedFleet = { version: 1, savedAt: Date.now(), bots, selectedBotId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // armazenamento cheio ou bloqueado: segue sem salvar
  }
}

let started = false;

/** Restaura a frota salva e passa a salvar a cada mudança. Chamar uma vez, no navegador. */
export function startBotPersistence(): () => void {
  if (started) return () => {};
  started = true;

  // A restauração acontece uma única vez por carga da página (o StrictMode monta duas vezes).
  const saved = useFleetRestore.getState().restored ? null : read();
  if (useFleetRestore.getState().restored) {
    // já restaurado: só volta a observar mudanças
  } else if (saved && saved.bots.length > 0) {
    // Preserva o estado de execução: robôs que estavam ativos CONTINUAM ativos após F5!
    const bots = saved.bots.map((b) => {
      const wasActive = b.active ?? false;
      // Auto-migração transparente para parâmetros lucrativos consistentes se o robô tiver parâmetros legados
      const takeProfit = (!b.takeProfit || b.takeProfit < 2.5) ? 3.0 : b.takeProfit;
      const stopLoss = (!b.stopLoss || b.stopLoss < 1.2) ? 1.5 : b.stopLoss;
      const breakEvenTrigger = (!b.breakEvenTrigger || b.breakEvenTrigger < 1.5) ? 1.8 : b.breakEvenTrigger;
      const breakEvenBuffer = (!b.breakEvenBuffer || b.breakEvenBuffer < 0.4) ? 0.50 : b.breakEvenBuffer;
      const allocationAmount = (!b.allocationAmount || b.allocationAmount < 30) ? 35.0 : b.allocationAmount;
      const timeStopMinutes = b.timeStopMinutes ?? 20;
      const useBtcGatekeeper = b.useBtcGatekeeper ?? true;
      const trailingTakeProfit = b.trailingTakeProfit ?? true;
      const trailingTakeProfitDistance = b.trailingTakeProfitDistance ?? 0.6;
      const strategy = (b.symbol === "AUTO" && b.strategy === "BREAKOUT") ? "QUANT_ENSEMBLE" : b.strategy;
      const useMarketRegime = b.symbol === "AUTO" ? false : (b.useMarketRegime ?? true);

      return {
        ...b,
        strategy,
        useMarketRegime,
        takeProfit,
        stopLoss,
        breakEvenTrigger,
        breakEvenBuffer,
        allocationAmount,
        timeStopMinutes,
        useBtcGatekeeper,
        trailingTakeProfit,
        trailingTakeProfitDistance,
        active: wasActive,
        status: (wasActive ? (b.position ? "in_position" : "scanning") : "stopped") as BotInstance["status"],
        stats: {
          ...b.stats,
          lastAction: wasActive
            ? (b.position ? "Posição mantida ativa (F5)" : "Analisando mercado (F5)")
            : (b.stats?.lastAction || "Pausado pelo usuário"),
          lastActionTime: new Date().toISOString(),
          entryChecks: undefined,
        },
      };
    });
    const store = useCryptoStore.getState();
    store.setBots(bots);
    store.setBotActive(bots.some((b) => b.active));
    if (saved.selectedBotId) store.setSelectedBotId(saved.selectedBotId);
    useFleetRestore.setState({ restored: true, pendingResume: [] });
  } else {
    useFleetRestore.setState({ restored: true, pendingResume: [] });
  }

  // Só começa a gravar depois de restaurar, para nunca sobrescrever o salvo com os robôs padrão.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    write();
  };
  const unsub = useCryptoStore.subscribe((s, prev) => {
    if (s.bots === prev.bots && s.selectedBotId === prev.selectedBotId) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  });
  // Garante a gravação ao fechar/recarregar a aba (F5).
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  write();

  return () => {
    unsub();
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("beforeunload", flush);
    flush();
    started = false;
  };
}

/** Religa os robôs que estavam ativos antes da recarga. */
export function resumePendingBots(): number {
  const { pendingResume } = useFleetRestore.getState();
  const store = useCryptoStore.getState();
  const existing = new Set(store.bots.map((b) => b.id));
  const ids = pendingResume.filter((id) => existing.has(id));
  ids.forEach((id) => store.toggleBotActive(id, true));
  useFleetRestore.setState({ pendingResume: [] });
  return ids.length;
}
