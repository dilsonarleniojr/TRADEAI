import { create } from "zustand";

const STORAGE_KEY = "tradeai_bot_background";

export const MIN_BACKGROUND_MINUTES = 1;
export const MAX_BACKGROUND_MINUTES = 1440;

interface BackgroundSettings {
  enabled: boolean;
  limitMinutes: number;
  // Epoch ms when the page went to background; null while visible
  hiddenSince: number | null;
  // Set when the limit was hit and bots were paused automatically
  expiredNotice: boolean;
  setEnabled: (enabled: boolean) => void;
  setLimitMinutes: (minutes: number) => void;
  setHiddenSince: (ts: number | null) => void;
  setExpiredNotice: (v: boolean) => void;
}

function load(): { enabled: boolean; limitMinutes: number } {
  const fallback = { enabled: false, limitMinutes: 60 };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && typeof raw.limitMinutes === "number") {
      return { enabled: !!raw.enabled, limitMinutes: clamp(raw.limitMinutes) };
    }
  } catch {}
  return fallback;
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return 60;
  return Math.min(MAX_BACKGROUND_MINUTES, Math.max(MIN_BACKGROUND_MINUTES, Math.round(n)));
}

function save(enabled: boolean, limitMinutes: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, limitMinutes }));
  } catch {}
}

export const useBackgroundSettings = create<BackgroundSettings>()((set, get) => ({
  enabled: false,
  limitMinutes: 60,
  hiddenSince: null,
  expiredNotice: false,
  setEnabled: (enabled) => {
    set({ enabled });
    save(enabled, get().limitMinutes);
  },
  setLimitMinutes: (minutes) => {
    const limitMinutes = clamp(minutes);
    set({ limitMinutes });
    save(get().enabled, limitMinutes);
  },
  setHiddenSince: (hiddenSince) => set({ hiddenSince }),
  setExpiredNotice: (expiredNotice) => set({ expiredNotice }),
}));

/** Hydrate from localStorage (client only, call once on mount). */
export function hydrateBackgroundSettings() {
  const { enabled, limitMinutes } = load();
  useBackgroundSettings.setState({ enabled, limitMinutes });
}
