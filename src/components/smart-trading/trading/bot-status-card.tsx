"use client";

import * as React from "react";
import { Bot, Play, Pause, Settings2 } from "lucide-react";
import { SmartBadge, type SmartBadgeProps } from "../ui/badge";
import { SmartButton } from "../ui/button";

export type BotSemanticState = "active" | "cooldown" | "circuit_breaker" | "waiting_signal" | "paused";

/**
 * Type guard estrito e determinístico para validação de estados semânticos de bots.
 */
export function isBotSemanticState(value: unknown): value is BotSemanticState {
  return typeof value === "string" && (
    value === "active" ||
    value === "cooldown" ||
    value === "circuit_breaker" ||
    value === "waiting_signal" ||
    value === "paused"
  );
}

export interface SemanticBadgeDescriptor {
  readonly variant: NonNullable<SmartBadgeProps["variant"]>;
  readonly label: string;
  readonly isDot: boolean;
}

/**
 * Tabela de decisão estática e congelada (Zero-Allocation) para resolução de badges semânticas.
 * Elimina blocos switch/case aninhados e criação repetitiva de closures no render loop.
 */
export const SEMANTIC_BADGE_CONFIG: Readonly<Record<BotSemanticState, SemanticBadgeDescriptor>> = Object.freeze({
  active: Object.freeze({ variant: "success", label: "Ativo", isDot: true }),
  cooldown: Object.freeze({ variant: "warning", label: "Em Cooldown", isDot: true }),
  circuit_breaker: Object.freeze({ variant: "danger", label: "Circuit Breaker Disparado", isDot: true }),
  waiting_signal: Object.freeze({ variant: "blue", label: "Aguardando Sinal", isDot: true }),
  paused: Object.freeze({ variant: "neutral", label: "Pausado", isDot: false }),
});

export interface BotPositionDisplayInfo {
  readonly quantity: number;
  readonly entryPrice: number;
  readonly currentPrice: number;
  readonly side?: "BUY" | "SELL";
}

export interface SmartBotStatusCardProps {
  readonly botId?: string;
  readonly name?: string;
  readonly strategy?: string;
  readonly symbol?: string;
  readonly status?: "active" | "paused" | "RUNNING" | "PAUSED" | "STOPPED";
  readonly semanticState?: BotSemanticState;
  readonly profitToday?: string;
  readonly profitPercent?: number;
  readonly unrealizedPnlUsd?: number;
  readonly tradesCount?: number;
  readonly winRate?: string;
  readonly drawdown?: string;
  readonly lastAction?: string;
  readonly positionInfo?: BotPositionDisplayInfo;
  readonly onToggleStatus?: () => void;
  readonly onConfigure?: () => void;
  readonly onConfigureBot?: (botId: string) => void;
  readonly onResetStats?: () => void;
  readonly onResetCooldown?: () => void;
  readonly onClosePositionMarket?: () => void;
}

/**
 * Componente atômico e puro para exibição da badge de estado do bot.
 */
export const BotSemanticBadge: React.FC<{ readonly state: BotSemanticState }> = React.memo(({ state }) => {
  const config = SEMANTIC_BADGE_CONFIG[state] ?? SEMANTIC_BADGE_CONFIG.paused;
  return (
    <SmartBadge variant={config.variant} size="sm" isDot={config.isDot}>
      {config.label}
    </SmartBadge>
  );
});
BotSemanticBadge.displayName = "BotSemanticBadge";

/**
 * Card de Telemetria e Ciclo de Vida do Robô Quantitativo (Zero-Allocation & Clean Architecture).
 * Otimizado com React.memo e tabela estática de decisão semântica.
 */
export const SmartBotStatusCard: React.FC<SmartBotStatusCardProps> = React.memo(({
  name,
  strategy = "Estratégia Quantitativa",
  symbol = "BTC/USDT",
  status = "active",
  semanticState,
  profitToday,
  profitPercent = 0,
  unrealizedPnlUsd,
  tradesCount = 0,
  winRate = "0%",
  drawdown = "0 perdas",
  lastAction,
  positionInfo,
  onToggleStatus,
  onConfigure,
  onResetStats,
  onResetCooldown,
  onClosePositionMarket,
}) => {
  const isRunning = status === "active" || status === "RUNNING";
  const resolvedState: BotSemanticState = semanticState ?? (isRunning ? "active" : "paused");

  const isProfitPositive = profitPercent >= 0;
  const pnlClass = isProfitPositive ? "text-emerald-400" : "text-red-400";
  const pnlPrefix = isProfitPositive ? "+" : "";

  return (
    <div className="w-full bg-[#141414] border border-neutral-800 rounded-2xl p-5 shadow-xl hover:border-neutral-700 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight">{name || "Robô Quantitativo"}</h4>
              <p className="text-[11px] text-neutral-400">{strategy}</p>
            </div>
          </div>

          <BotSemanticBadge state={resolvedState} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 block">Par</span>
            <span className="font-mono text-xs font-bold text-white">{symbol}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 block">P/L Realizado</span>
            <span className={`font-mono text-xs font-bold ${pnlClass}`}>
              {profitToday || `${pnlPrefix}${profitPercent}%`}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 block">Win Rate</span>
            <span className="font-mono text-xs font-bold text-white">{winRate}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 block">Trades Hoje</span>
            <span className="font-mono text-xs font-bold text-white">{tradesCount}</span>
          </div>
        </div>

        {/* Posição Ativa do Robô */}
        {positionInfo && positionInfo.quantity > 0 && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <span className="font-bold text-emerald-400 font-mono">
                {positionInfo.side || "LONG"} {positionInfo.quantity} {symbol?.replace("USDT", "")}
              </span>
              <span className="text-neutral-400 ml-2 font-mono text-[11px]">
                @ ${positionInfo.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {typeof unrealizedPnlUsd === "number" && (
                <span className={`text-xs font-mono font-bold ${unrealizedPnlUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  uPnL: {unrealizedPnlUsd >= 0 ? "+" : ""}${unrealizedPnlUsd.toFixed(2)}
                </span>
              )}
              {onClosePositionMarket && (
                <button
                  type="button"
                  onClick={onClosePositionMarket}
                  className="text-[11px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/40 font-bold transition-all"
                >
                  Fechar a Mercado
                </button>
              )}
            </div>
          </div>
        )}

        {lastAction && (
          <div className="text-[11px] text-neutral-400 bg-neutral-900/50 p-2 rounded-lg border border-neutral-800 flex items-center justify-between">
            <span className="truncate">Última Ação: <strong className="text-neutral-200">{lastAction}</strong></span>
            <span className="text-neutral-500 font-mono text-[10px] shrink-0 ml-2">DD: {drawdown}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between pt-4 mt-4 border-t border-neutral-800/80 gap-2">
        <div className="flex items-center gap-2">
          <SmartButton
            variant={isRunning ? "danger" : "success"}
            size="sm"
            onClick={onToggleStatus}
            leftIcon={isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          >
            {isRunning ? "Pausar" : "Iniciar"}
          </SmartButton>

          {resolvedState === "cooldown" && onResetCooldown && (
            <SmartButton
              variant="outline"
              size="sm"
              onClick={onResetCooldown}
            >
              Zerar Cooldown
            </SmartButton>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onResetStats && (
            <SmartButton
              variant="ghost"
              size="sm"
              onClick={onResetStats}
              title="Reiniciar estatísticas do robô"
            >
              Zerar Stats
            </SmartButton>
          )}
          <SmartButton
            variant="outline"
            size="sm"
            onClick={onConfigure}
            leftIcon={<Settings2 className="w-3.5 h-3.5" />}
          >
            Ajustar
          </SmartButton>
        </div>
      </div>
    </div>
  );
});

SmartBotStatusCard.displayName = "SmartBotStatusCard";
