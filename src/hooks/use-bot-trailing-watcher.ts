"use client";

import { useEffect, useRef } from "react";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

type SoundType = "break_even" | "take_profit_partial" | "trailing_armed";

/**
 * Sintetizador harmônico institucional Web Audio API para alertas do bot.
 * Não requer arquivos externos de áudio e funciona de forma leve e instantânea.
 */
function playChime(type: SoundType) {
  if (typeof window === "undefined") return;

  // Verifica se som foi silenciado pelo operador
  try {
    const isMuted = localStorage.getItem("tradeai_sound_muted") === "true";
    if (isMuted) return;
  } catch {}

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === "break_even") {
      // 🛡️ Break-Even: Duplo acorde de proteção (D5 587Hz -> A5 880Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(880.0, now + 0.08);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.28);
    } else if (type === "take_profit_partial") {
      // 🎯 TP1 Parcial: Tríade ascendente suave de vitória (C5 -> E5 -> G5)
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.07;
        const dur = 0.18;

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + dur);
      });
    } else if (type === "trailing_armed") {
      // 🚀 Trailing TP Armado: Glissando de aceleração (440Hz -> 659Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440.0, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.2);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.32);
    }
  } catch {
    // Silencia qualquer restrição de autoplay
  }
}

/**
 * Emite notificação push nativa do navegador se o operador concedeu permissão.
 */
function sendNativeNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
      });
    } catch {}
  }
}

interface BotTrackingState {
  hasPosition: boolean;
  isBreakEvenArmed: boolean;
  partialTpExecuted: boolean;
  isTakeProfitArmed: boolean;
}

/**
 * Hook de observabilidade de alta fidelidade:
 * Monitora em tempo real a transição de estado das posições dos robôs,
 * emitindo alertas visuais (toasts) e sonoros imediatos ao atingir:
 * 1. 🛡️ Break-Even Automático (Risco Zero / Free Trade garantido)
 * 2. 🎯 Realização Parcial (Scale-Out TP1 concluído)
 * 3. 🚀 Trailing Stop / Trailing Take-Profit (Stop dinâmico subindo em fortes altas)
 */
export function useBotTrailingWatcher() {
  const { toast } = useToast();
  const bots = useCryptoStore((s) => s.bots);
  const stateMapRef = useRef<Map<string, BotTrackingState>>(new Map());
  const isInitializedRef = useRef(false);

  useEffect(() => {
    const stateMap = stateMapRef.current;

    // Na primeira montagem, sincroniza o estado atual para evitar disparos falsos de posições já abertas
    if (!isInitializedRef.current) {
      bots.forEach((b) => {
        const hasPos = Boolean(b.position && b.position.quantity > 0);
        stateMap.set(b.id, {
          hasPosition: hasPos,
          isBreakEvenArmed: Boolean(b.position?.isBreakEvenArmed),
          partialTpExecuted: Boolean(b.position?.partialTpExecuted),
          isTakeProfitArmed: Boolean(b.position?.isTakeProfitArmed),
        });
      });
      isInitializedRef.current = true;
      return;
    }

    bots.forEach((b) => {
      const pos = b.position;
      const hasPos = Boolean(pos && pos.quantity > 0);
      const prev = stateMap.get(b.id) || {
        hasPosition: false,
        isBreakEvenArmed: false,
        partialTpExecuted: false,
        isTakeProfitArmed: false,
      };

      if (hasPos && pos) {
        const symbolDisplay = (pos.symbol || b.symbol).replace("USDT", "/USDT");
        const isBeArmed = Boolean(pos.isBreakEvenArmed);
        const isPartialDone = Boolean(pos.partialTpExecuted);
        const isTpArmed = Boolean(pos.isTakeProfitArmed);

        // Se acabou de abrir posição neste tick, inicializa estado limpo
        if (!prev.hasPosition) {
          stateMap.set(b.id, {
            hasPosition: true,
            isBreakEvenArmed: isBeArmed,
            partialTpExecuted: isPartialDone,
            isTakeProfitArmed: isTpArmed,
          });
          return;
        }

        // 1. 🛡️ DETECÇÃO DE ATIVAÇÃO DE BREAK-EVEN (RISCO ZERO)
        if (!prev.isBreakEvenArmed && isBeArmed) {
          const bePrice = pos.breakEvenPrice || pos.entryPrice * 1.006;
          const title = `🛡️ Risco Zero Ativado · ${b.name}`;
          const description = `Stop Loss ajustado para o Break-Even ($${formatPrice(bePrice)}) em ${symbolDisplay}. O trade agora está com risco zero!`;

          playChime("break_even");
          toast({
            title,
            description,
            variant: "default",
          });
          sendNativeNotification(title, description);
        }

        // 2. 🎯 DETECÇÃO DE REALIZAÇÃO PARCIAL (TP1)
        if (!prev.partialTpExecuted && isPartialDone) {
          const title = `🎯 Realização Parcial (TP1) · ${b.name}`;
          const description = `50% da posição liquidada com lucro garantido em ${symbolDisplay}! O restante continua operando travado no Break-Even com risco ZERO.`;

          playChime("take_profit_partial");
          toast({
            title,
            description,
            variant: "default",
          });
          sendNativeNotification(title, description);
        }

        // 3. 🚀 DETECÇÃO DE TRAILING TAKE-PROFIT ARMADO
        if (!prev.isTakeProfitArmed && isTpArmed) {
          const peak = pos.tpPeakPrice || pos.currentPrice || pos.entryPrice;
          const title = `🚀 Trailing Take-Profit Armado · ${b.name}`;
          const description = `Surfando pump em ${symbolDisplay}! Stop dinâmico subindo (Pico: $${formatPrice(peak)}) para maximizar os lucros.`;

          playChime("trailing_armed");
          toast({
            title,
            description,
            variant: "default",
          });
          sendNativeNotification(title, description);
        }

        // Atualiza estado rastreado do robô
        stateMap.set(b.id, {
          hasPosition: true,
          isBreakEvenArmed: isBeArmed,
          partialTpExecuted: isPartialDone,
          isTakeProfitArmed: isTpArmed,
        });
      } else {
        // Robô não está em posição. Se estava antes, reseta para armar novamente no próximo trade
        if (prev.hasPosition) {
          stateMap.delete(b.id);
        }
      }
    });
  }, [bots, toast]);
}
