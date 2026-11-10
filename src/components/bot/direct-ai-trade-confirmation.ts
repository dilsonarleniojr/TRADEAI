/**
 * Direct AI Trade Confirmation & Mode Security Guardrails (UI-002)
 */

export interface ModeConfig {
  mode: "live" | "paper";
  isReal: boolean;
  label: string;
  badgeLabel: string;
  colorClass: string;
  borderClass: string;
  badgeClass: string;
  buttonClass: string;
  buttonText: string;
  warningText: string;
  requiresConfirmation: boolean;
}

export function getDirectAiTradeModeConfig(
  mode: "live" | "paper",
  notionalUsd: number
): ModeConfig {
  const isReal = mode === "live";

  if (isReal) {
    return {
      mode: "live",
      isReal: true,
      label: "Real Spot (Dinheiro Real)",
      badgeLabel: "LIVE SPOT BINANCE",
      colorClass: "bg-rose-500/10 text-rose-300 border-rose-500/40",
      borderClass: "border-rose-500/40",
      badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/50",
      buttonClass:
        "bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold shadow-[0_0_20px_rgba(244,63,94,0.4)]",
      buttonText: `Iniciar Operação REAL com IA ($${notionalUsd.toFixed(2)} USDT)`,
      warningText:
        "⚠️ MODO REAL ATIVO: A IA enviará ordens reais para a Binance Spot utilizando seu saldo em USDT.",
      requiresConfirmation: true,
    };
  }

  return {
    mode: "paper",
    isReal: false,
    label: "Simulado (Paper Trading)",
    badgeLabel: "PAPER SIMULADO",
    colorClass: "bg-cyan-500/10 text-cyan-300 border-cyan-500/40",
    borderClass: "border-cyan-500/40",
    badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/50",
    buttonClass:
      "bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-bold shadow-[0_0_20px_rgba(6,182,212,0.4)]",
    buttonText: `Iniciar Operação SIMULADA com IA ($${notionalUsd.toFixed(2)} USDT)`,
    warningText:
      "🧪 MODO SIMULADO ATIVO: Execução com cotações em tempo real sem risco financeiro.",
    requiresConfirmation: false,
  };
}

export function validateDirectAiTradeAmount(amount: number): {
  isValid: boolean;
  error?: string;
} {
  if (amount < 11) {
    return {
      isValid: false,
      error: "O valor mínimo para operação na Binance Spot é de $11.00 USDT.",
    };
  }
  return { isValid: true };
}

