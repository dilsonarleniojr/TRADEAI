/**
 * TradeAI Web Audio API Sound Synthesizer
 * - Gera alertas sonoros funcionais sintetizados em tempo real via osciladores matemáticos
 * - Zero dependência externa ou arquivos de áudio remotos (.mp3 / .wav)
 * - Safe em ambientes SSR, headless e durante testes automatizados
 */

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }

  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem("tradeai_sound_enabled", enabled ? "1" : "0");
    } catch {}
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const val = window.localStorage.getItem("tradeai_sound_enabled");
      if (val !== null) return val === "1";
    } catch {}
  }
  return soundEnabled;
}

/**
 * 1. Som de Ordem Executada (Order Fill Chime):
 * Beep cristalino ascendente de confirmação (880Hz -> 1320Hz)
 */
export function playOrderExecutedSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  } catch {}
}

/**
 * 2. Som de Alvo / Take-Profit Atingido (Target Victory Arpeggio):
 * Acorde harmônico ascendente em C Maior (523Hz -> 659Hz -> 784Hz -> 1046Hz)
 */
export function playTakeProfitHitSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.18, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.28);
    });
  } catch {}
}

/**
 * 3. Som de Stop-Loss Acionado ou Kill-Switch de Emergência:
 * Alerta dissonante e ríspido em baixa frequência (220Hz + 233Hz detunado)
 */
export function playStopLossOrKillSwitchSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const freqs = [220, 233]; // Lá menor / intervalo dissonante de semitom

    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 0.7, now + 0.35);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    });
  } catch {}
}
