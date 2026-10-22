"use client";

import React from "react";
import { useCryptoStore, type RiskProfile } from "@/lib/store";
import { riskManager } from "@/lib/bot/risk-manager";
import { structuredLogger } from "@/lib/telemetry/structured-logger";
import { useToast } from "@/hooks/use-toast";
import { Shield, Flame, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskProfileSelectorProps {
  className?: string;
  compact?: boolean;
}

export function RiskProfileSelector({ className, compact = false }: RiskProfileSelectorProps) {
  const { toast } = useToast();
  const activeProfile = useCryptoStore((s) => s.activeRiskProfile);
  const setActiveProfile = useCryptoStore((s) => s.setActiveRiskProfile);
  const updateProtectionSettings = useCryptoStore((s) => s.updateProtectionSettings);

  const handleSelectProfile = (profile: RiskProfile) => {
    setActiveProfile(profile);

    if (profile === "conservative") {
      updateProtectionSettings({
        maxRiskPerTradePct: 0.01, // 1.0%
        maxDailyDrawdownPct: 0.03, // 3.0%
        minNetRewardRiskRatio: 1.50,
        maxSimultaneousPositions: 3,
        fractionalRiskSizing: true,
      });
      riskManager.updateProtectionSettings({
        maxRiskPerTradePct: 0.01,
        maxDailyDrawdownPct: 0.03,
        minNetRewardRiskRatio: 1.50,
        maxSimultaneousPositions: 3,
      });
      structuredLogger.info(
        "RISK_ENGINE",
        "🛡️ [RISK_PROFILE] Perfil CONSERVADOR ativado: Risco máx: 1.0%/trade, R:R >= 1.50, Teto: 3 posições."
      );
      toast({
        title: "🛡️ Perfil Conservador Ativado",
        description: "Risco limitado a 1.0% por trade e teto de 3 posições simultâneas.",
      });
    } else if (profile === "aggressive") {
      updateProtectionSettings({
        maxRiskPerTradePct: 0.02, // 2.0%
        maxDailyDrawdownPct: 0.03, // 3.0%
        minNetRewardRiskRatio: 1.20,
        maxSimultaneousPositions: 5,
        fractionalRiskSizing: true,
      });
      riskManager.updateProtectionSettings({
        maxRiskPerTradePct: 0.02,
        maxDailyDrawdownPct: 0.03,
        minNetRewardRiskRatio: 1.20,
        maxSimultaneousPositions: 5,
      });
      structuredLogger.warn(
        "RISK_ENGINE",
        "⚡ [RISK_PROFILE] Perfil AGRESSIVO ativado: Risco máx: 2.0%/trade, R:R >= 1.20, Teto: 5 posições."
      );
      toast({
        title: "⚡ Perfil Agressivo Ativado",
        description: "Risco ampliado para 2.0% por trade e até 5 posições simultâneas.",
      });
    } else if (profile === "monitoring") {
      structuredLogger.info(
        "RISK_ENGINE",
        "👁️ [RISK_PROFILE] Modo MONITORAMENTO PURO ativado: Geração de sinais e telemetria sem despacho de ordens."
      );
      toast({
        title: "👁️ Modo Monitoramento Puro",
        description: "Robôs analisam e registram sinais sem abrir novas posições na exchange.",
      });
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1 bg-[#090d16]/80 p-1 rounded-lg border border-white/[0.08] backdrop-blur-md shadow-inner",
        className
      )}
    >
      <button
        type="button"
        onClick={() => handleSelectProfile("conservative")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200",
          activeProfile === "conservative"
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
        )}
        title="Perfil Conservador: Risco máx 1.0% por trade, SL obrigatório, R:R >= 1.50"
      >
        <Shield className="w-3.5 h-3.5 text-emerald-400" />
        <span className={compact ? "hidden sm:inline" : ""}>Conservador</span>
      </button>

      <button
        type="button"
        onClick={() => handleSelectProfile("aggressive")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200",
          activeProfile === "aggressive"
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
        )}
        title="Perfil Agressivo: Risco máx 2.0% por trade, até 5 posições simultâneas"
      >
        <Flame className="w-3.5 h-3.5 text-amber-400" />
        <span className={compact ? "hidden sm:inline" : ""}>Agressivo</span>
      </button>

      <button
        type="button"
        onClick={() => handleSelectProfile("monitoring")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200",
          activeProfile === "monitoring"
            ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
        )}
        title="Monitoramento Puro: Sinais e logs apenas, sem envio de ordens"
      >
        <Eye className="w-3.5 h-3.5 text-cyan-400" />
        <span className={compact ? "hidden sm:inline" : ""}>Monitor</span>
      </button>
    </div>
  );
}
