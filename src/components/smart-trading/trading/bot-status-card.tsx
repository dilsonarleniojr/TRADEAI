"use client";

import * as React from "react";
import { Bot, Play, Pause, Activity, Settings2, Sliders, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartBadge } from "../ui/badge";
import { SmartButton } from "../ui/button";
import { SmartSwitch } from "../ui/switch";

export interface BotInstance {
  id: string;
  name: string;
  pair: string;
  strategy: string;
  status: "RUNNING" | "PAUSED" | "STOPPED";
  pnlUsd: number;
  pnlPercent: number;
  tradesCount: number;
  winRate: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop: number;
}

const DEFAULT_BOTS: BotInstance[] = [
  {
    id: "bot_1",
    name: "Apex AI Conformal Scalper",
    pair: "BTC/USDT",
    strategy: "Conformal ML 95% + L2 Order Flow",
    status: "RUNNING",
    pnlUsd: 1420.5,
    pnlPercent: 7.82,
    tradesCount: 48,
    winRate: 72.9,
    stopLoss: 1.5,
    takeProfit: 3.2,
    trailingStop: 0.8,
  },
  {
    id: "bot_2",
    name: "Momentum Breakout Titan",
    pair: "SOL/USDT",
    strategy: "Volume Spike + VWAP Intraday",
    status: "RUNNING",
    pnlUsd: 890.2,
    pnlPercent: 12.4,
    tradesCount: 31,
    winRate: 67.7,
    stopLoss: 2.0,
    takeProfit: 4.5,
    trailingStop: 1.0,
  },
  {
    id: "bot_3",
    name: "Dynamic ATR Grid Reverter",
    pair: "ETH/USDT",
    strategy: "Mean Reversion + Trend Brake",
    status: "PAUSED",
    pnlUsd: -140.0,
    pnlPercent: -1.15,
    tradesCount: 19,
    winRate: 52.6,
    stopLoss: 1.8,
    takeProfit: 2.5,
    trailingStop: 0.6,
  },
];

export type BotSemanticState = "active" | "cooldown" | "circuit_breaker" | "waiting_signal" | "paused";

export interface SmartBotStatusCardProps {
  botId?: string;
  name?: string;
  strategy?: string;
  symbol?: string;
  status?: "active" | "paused" | "RUNNING" | "PAUSED" | "STOPPED";
  semanticState?: BotSemanticState;
  profitToday?: string;
  profitPercent?: number;
  unrealizedPnlUsd?: number;
  tradesCount?: number;
  winRate?: string;
  drawdown?: string;
  lastAction?: string;
  positionInfo?: {
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    side?: "BUY" | "SELL";
  };
  onToggleStatus?: () => void;
  onConfigure?: () => void;
  onConfigureBot?: (botId: string) => void;
  onResetStats?: () => void;
  onResetCooldown?: () => void;
  onClosePositionMarket?: () => void;
}

export function SmartBotStatusCard({
  botId,
  name,
  strategy,
  symbol,
  status = "active",
  semanticState,
  profitToday,
  profitPercent = 0,
  unrealizedPnlUsd,
  tradesCount = 0,
  winRate = "0%",
  drawdown = "0%",
  lastAction,
  positionInfo,
  onToggleStatus,
  onConfigure,
  onConfigureBot,
  onResetStats,
  onResetCooldown,
  onClosePositionMarket,
}: SmartBotStatusCardProps) {
  // Modo Individual (quando name é fornecido)
  if (name) {
    const isRunning = status === "active" || status === "RUNNING";
    const resolvedState: BotSemanticState = semanticState ?? (isRunning ? "active" : "paused");

    const renderSemanticBadge = () => {
      switch (resolvedState) {
        case "active":
          return (
            <SmartBadge variant="success" size="sm" isDot>
              Ativo
            </SmartBadge>
          );
        case "cooldown":
          return (
            <SmartBadge variant="warning" size="sm" isDot>
              Em Cooldown
            </SmartBadge>
          );
        case "circuit_breaker":
          return (
            <SmartBadge variant="danger" size="sm" isDot>
              Circuit Breaker Disparado
            </SmartBadge>
          );
        case "waiting_signal":
          return (
            <SmartBadge variant="blue" size="sm" isDot>
              Aguardando Sinal
            </SmartBadge>
          );
        case "paused":
        default:
          return (
            <SmartBadge variant="neutral" size="sm">
              Pausado
            </SmartBadge>
          );
      }
    };

    return (
      <div className="w-full bg-[#141414] border border-neutral-800 rounded-2xl p-5 shadow-xl hover:border-neutral-700 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-tight">{name}</h4>
                <p className="text-[11px] text-neutral-400">{strategy}</p>
              </div>
            </div>

            {renderSemanticBadge()}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
            <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/60">
              <span className="text-[10px] text-neutral-400 block">Par</span>
              <span className="font-mono text-xs font-bold text-white">{symbol}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/60">
              <span className="text-[10px] text-neutral-400 block">P/L Realizado</span>
              <span className={`font-mono text-xs font-bold ${profitPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {profitToday || `${profitPercent >= 0 ? "+" : ""}${profitPercent}%`}
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

          {/* Se houver posição aberta */}
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
  }

  // Modo Catálogo Completo (quando name não é fornecido)
  const [bots, setBots] = React.useState<BotInstance[]>(DEFAULT_BOTS);

  const toggleBotStatus = (botId: string) => {
    setBots((prev) =>
      prev.map((b) =>
        b.id === botId
          ? {
              ...b,
              status: b.status === "RUNNING" ? "PAUSED" : "RUNNING",
            }
          : b
      )
    );
  };

  return (
    <div className="w-full bg-[#111111] border border-neutral-800 rounded-2xl p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Robôs Autônomos de Trading</h3>
            <p className="text-xs text-neutral-400">Algoritmos quantitativos executando ordens 24/7</p>
          </div>
        </div>

        <SmartBadge variant="purple" size="md" hasDot>
          {bots.filter((b) => b.status === "RUNNING").length} Ativos Concorrentes
        </SmartBadge>
      </div>

      {/* Bot Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bots.map((bot) => {
          const isRunning = bot.status === "RUNNING";
          const isPnlPositive = bot.pnlUsd >= 0;

          return (
            <div
              key={bot.id}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 select-none bg-neutral-900/60",
                isRunning
                  ? "border-neutral-700/80 hover:border-blue-500/50 shadow-md hover:shadow-blue-500/10"
                  : "border-neutral-800/60 opacity-75"
              )}
            >
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-extrabold text-sm text-white tracking-tight">{bot.name}</span>
                    <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono font-bold text-blue-400">{bot.pair}</span>
                      <span>•</span>
                      <span className="truncate max-w-[140px]">{bot.strategy}</span>
                    </div>
                  </div>

                  <SmartBadge variant={isRunning ? "success" : "neutral"} size="sm" hasDot={isRunning}>
                    {bot.status}
                  </SmartBadge>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/60 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-neutral-500 block">PnL Realizado:</span>
                    <span className={cn("font-bold", isPnlPositive ? "text-emerald-400" : "text-red-400")}>
                      {isPnlPositive ? "+" : ""}${bot.pnlUsd.toFixed(2)} ({isPnlPositive ? "+" : ""}
                      {bot.pnlPercent}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block">Taxa de Acerto:</span>
                    <span className="text-white font-bold">{bot.winRate}% ({bot.tradesCount} trades)</span>
                  </div>
                </div>

                {/* Risk Parameters */}
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 mb-3 px-1">
                  <span>SL: <strong className="text-red-400">-{bot.stopLoss}%</strong></span>
                  <span>TP: <strong className="text-emerald-400">+{bot.takeProfit}%</strong></span>
                  <span>Trailing: <strong className="text-purple-400">{bot.trailingStop}%</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-neutral-800">
                <SmartButton
                  variant={isRunning ? "outline" : "primary"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => toggleBotStatus(bot.id)}
                  leftIcon={isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                >
                  {isRunning ? "Pausar" : "Iniciar"}
                </SmartButton>

                <button
                  type="button"
                  onClick={() => onConfigureBot?.(bot.id)}
                  title="Configurar Parâmetros de Risco"
                  className="p-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
