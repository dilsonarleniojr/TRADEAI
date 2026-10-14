"use client";

import { useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { tickMultiBotFleet } from "@/lib/bot/multi-bot-engine";
import { useBackgroundSettings, hydrateBackgroundSettings } from "@/lib/bot/background-settings";
import { useToast } from "@/hooks/use-toast";
import { useBotTrailingWatcher } from "@/hooks/use-bot-trailing-watcher";

const IDLE_TICK_MS = 3000;
const ACTIVE_POSITION_TICK_MS = 1500; // Monitoramento ágil (1.5s) para posições abertas sem saturação de CPU

// Worker timers are not throttled when the tab is in background (unlike main-thread timers).
function createTickWorker(intervalMs: number): Worker | null {
  try {
    const src = `let t=null;onmessage=e=>{if(e.data==='start'){if(t)clearInterval(t);t=setInterval(()=>postMessage('tick'),${intervalMs});}else if(e.data==='stop'){clearInterval(t);t=null;}};`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  } catch {
    return null;
  }
}

/**
 * Global fleet loop. Lives outside BotSection so bots keep running when the user
 * switches tabs/sections, and keeps running with the browser in background
 * for as long as the user-defined time limit allows.
 */
export function BotBackgroundRunner() {
  const { toast } = useToast();
  // Observabilidade de Break-Even, Trailing Stop e Realização Parcial em tempo real
  useBotTrailingWatcher();

  const isAnyActive = useCryptoStore((s) => s.bots.some((b) => b.active));
  const hasOpenPositions = useCryptoStore((s) => s.bots.some((b) => b.active && !!b.position && b.position.quantity > 0));

  useEffect(() => {
    hydrateBackgroundSettings();
  }, []);

  // Track page visibility
  useEffect(() => {
    const onVisibility = () => {
      const settings = useBackgroundSettings.getState();
      if (document.hidden) {
        settings.setHiddenSince(Date.now());
      } else {
        settings.setHiddenSince(null);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Fleet loop
  useEffect(() => {
    if (!isAnyActive) return;

    let running = false;
    const cycle = async () => {
      const s = useBackgroundSettings.getState();

      if (s.hiddenSince !== null) {
        // Se houver qualquer posição aberta (especialmente real), NUNCA abandona o monitoramento para proteger o capital
        const hasOpen = useCryptoStore.getState().bots.some((b) => b.active && !!b.position && b.position.quantity > 0);
        const allowed = s.enabled || hasOpen;
        const expired = s.enabled && Date.now() - s.hiddenSince >= s.limitMinutes * 60_000;
        if (!allowed) return; // background execution disabled: wait until user returns
        if (expired && !hasOpen) {
          useCryptoStore.getState().toggleAllBots(false);
          s.setExpiredNotice(true);
          return;
        }
      }

      if (running) return;
      running = true;
      try {
        await tickMultiBotFleet({ onToast: (t) => toast(t) });
      } finally {
        running = false;
      }
    };

    const currentTickMs = hasOpenPositions ? ACTIVE_POSITION_TICK_MS : IDLE_TICK_MS;
    const first = setTimeout(cycle, 200);
    const worker = createTickWorker(currentTickMs);
    let fallback: ReturnType<typeof setInterval> | null = null;
    if (worker) {
      worker.onmessage = cycle;
      worker.postMessage("start");
    } else {
      fallback = setInterval(cycle, currentTickMs);
    }

    return () => {
      clearTimeout(first);
      if (fallback) clearInterval(fallback);
      if (worker) {
        worker.postMessage("stop");
        worker.terminate();
      }
    };
  }, [isAnyActive, hasOpenPositions, toast]);

  // Tell the user when the limit paused the bots
  useEffect(() => {
    const unsub = useBackgroundSettings.subscribe((s, prev) => {
      if (s.expiredNotice && !prev.expiredNotice) {
        toast({
          title: "Robôs pausados",
          description: `O tempo limite de ${s.limitMinutes} min em segundo plano foi atingido.`,
          variant: "destructive",
        });
        s.setExpiredNotice(false);
      }
    });
    return unsub;
  }, [toast]);

  return null;
}
