"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { playStopLossOrKillSwitchSound } from "@/lib/sound/sound-effects";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { flightRecorder } from "@/lib/telemetry/flight-recorder";
import { clearAllRestingMakerOrdersForTests } from "@/lib/bot/multi-bot-engine";
import { tradeJournalEngine } from "@/lib/journal/trade-journal-engine";
import { orderFlowAnomalyScanner } from "@/lib/order-flow/anomaly-scanner";
import { buildPostTradeCoTPrompt } from "@/lib/journal/post-trade-copilot-prompt";

export interface DesktopHotkeysOptions {
  enableKillSwitch?: boolean;
  enableSpaceAutoScroll?: boolean;
  enableCommandPalette?: boolean;
  enableQuantCopilotShortcut?: boolean;
}

/**
 * Avalia deterministicamente se o evento de teclado corresponde ao atalho global
 * de Auditoria Instantânea do Copiloto Quant Pós-Trade:
 * - `Alt + J` (Windows / Linux / macOS)
 * - `Cmd + Shift + C` ou `Ctrl + Shift + C`
 */
export function isQuantCopilotHotkey(e: {
  key: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  const keyLower = (e.key || "").toLowerCase();
  const isAltJ =
    !!e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    (keyLower === "j" || e.code === "KeyJ");
  const isCmdOrCtrlShiftC =
    (!!e.metaKey || !!e.ctrlKey) &&
    !!e.shiftKey &&
    !e.altKey &&
    (keyLower === "c" || e.code === "KeyC");

  return isAltJ || isCmdOrCtrlShiftC;
}

export function useDesktopHotkeys(options: DesktopHotkeysOptions = {}) {
  const {
    enableKillSwitch = true,
    enableSpaceAutoScroll = true,
    enableCommandPalette = true,
    enableQuantCopilotShortcut = true,
  } = options;

  const { toast } = useToast();
  const lastEscPressTimeRef = useRef<number>(0);

  const toggleLogAutoScroll = useCryptoStore((s) => s.toggleLogAutoScroll);
  const isLogAutoScrollPaused = useCryptoStore((s) => s.isLogAutoScrollPaused);
  const toggleAllBots = useCryptoStore((s) => s.toggleAllBots);
  const setIsCommandSearchOpen = useCryptoStore((s) => s.setIsCommandSearchOpen);
  const isCommandSearchOpen = useCryptoStore((s) => s.isCommandSearchOpen);
  const triggerQuantCopilotInstantAudit = useCryptoStore(
    (s) => s.triggerQuantCopilotInstantAudit
  );

  const triggerEmergencyKillSwitch = useCallback(() => {
    // 1. Pausa imediatamente todos os bots na frota
    toggleAllBots(false);

    // 2. Limpa ordens passivas resting na memória/livro
    try {
      clearAllRestingMakerOrdersForTests();
    } catch {}

    // 3. Dispara alerta sonoro ríspido
    playStopLossOrKillSwitchSound();

    // 4. Captura snapshot pós-mortem no Flight Recorder
    const state = useCryptoStore.getState();
    const symbol = state.selectedSymbol || "BTCUSDT";
    flightRecorder.captureSnapshot(
      "MANUAL_OPERATOR_TRIGGER",
      symbol,
      "Kill-Switch acionado manualmente pelo operador via DUPLO ESC (Hotkeys Desktop)"
    );

    // 5. Emite log crítico estruturado
    structuredLogger.critical(
      "RISK_ENGINE",
      "🚨 [KILL-SWITCH] PARADA DE EMERGÊNCIA ACIONADA VIA DUPLO ESC! Todos os bots foram pausados e ordens ativas limpas."
    );

    // 6. Notificação visual de alta prioridade
    toast({
      variant: "destructive",
      title: "🚨 KILL-SWITCH DE EMERGÊNCIA ACIONADO",
      description:
        "Todos os robôs foram pausados imediatamente e as ordens passivas foram canceladas.",
    });
  }, [toggleAllBots, toast]);

  const triggerQuantCopilotHotkeyAction = useCallback(() => {
    triggerQuantCopilotInstantAudit();

    // Gera e copia automaticamente o Prompt Chain-of-Thought preenchido com a telemetria ao vivo
    const records = tradeJournalEngine.getAllRecords();
    const metrics = tradeJournalEngine.calculateMetrics(records, 1000);
    const anomalies = orderFlowAnomalyScanner.getRecentAlerts(10);
    const bundle = buildPostTradeCoTPrompt({
      metrics,
      horizonWindow: "LIVE",
      anomalies,
      lastRecord: records[0] ?? null,
    });

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(bundle.promptText).catch(() => {});
    }

    toast({
      title: "🧠 Copiloto Quant CoT Acionado (Alt+J)",
      description: `Auditoria instantânea aberta (${bundle.riskStatus} • Eficiência MFE ${bundle.mfeCaptureEfficiencyPercent.toFixed(
        1
      )}%). Prompt CoT copiado para o clipboard.`,
    });
  }, [triggerQuantCopilotInstantAudit, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable;

      // 1. DUPLO ESC: Kill-Switch de Emergência (< 500ms entre dois toques de Escape)
      if (e.key === "Escape" && enableKillSwitch) {
        const now = Date.now();
        const diff = now - lastEscPressTimeRef.current;
        if (diff < 500 && diff > 40) {
          e.preventDefault();
          lastEscPressTimeRef.current = 0;
          triggerEmergencyKillSwitch();
          return;
        }
        lastEscPressTimeRef.current = now;
      }

      // 2. ALT + J ou CMD/CTRL + SHIFT + C: Auditoria Instantânea do Copiloto Quant Pós-Trade
      if (enableQuantCopilotShortcut && isQuantCopilotHotkey(e)) {
        e.preventDefault();
        triggerQuantCopilotHotkeyAction();
        return;
      }

      // Se o usuário estiver digitando em um input ou campo de texto, não intercepta Espaço ou atalhos normais
      if (isInput) return;

      // 3. ESPAÇO: Pausar / Retomar Auto-Scroll dos Logs e Trades
      if (e.code === "Space" && enableSpaceAutoScroll) {
        e.preventDefault();
        toggleLogAutoScroll();
        const nextState = !isLogAutoScrollPaused;
        toast({
          title: nextState ? "⏸️ Auto-Scroll Pausado" : "▶️ Auto-Scroll Ativo",
          description: nextState
            ? "Pressione Espaço novamente para retomar a rolagem automática."
            : "Terminal de logs acompanhando novos eventos em tempo real.",
        });
        return;
      }

      // 4. CTRL + K / CMD + K: Paleta de Comandos Rápidos
      if (enableCommandPalette && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandSearchOpen(!isCommandSearchOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enableKillSwitch,
    enableSpaceAutoScroll,
    enableCommandPalette,
    enableQuantCopilotShortcut,
    toggleLogAutoScroll,
    isLogAutoScrollPaused,
    setIsCommandSearchOpen,
    isCommandSearchOpen,
    triggerEmergencyKillSwitch,
    triggerQuantCopilotHotkeyAction,
    toast,
  ]);

  return {
    isLogAutoScrollPaused,
    triggerEmergencyKillSwitch,
    triggerQuantCopilotHotkeyAction,
  };
}
