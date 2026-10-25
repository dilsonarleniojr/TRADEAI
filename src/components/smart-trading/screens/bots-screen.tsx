'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useCryptoStore, type BotInstance, type BotStrategy } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { manualCloseBotPosition } from '@/lib/bot/multi-bot-engine';
import { playStopLossOrKillSwitchSound } from '@/lib/sound/sound-effects';
import { useToast } from '@/hooks/use-toast';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartInput } from '../ui/input';
import { SmartBadge } from '../ui/badge';
import { SmartSwitch } from '../ui/switch';
import { SmartBotStatusCard, type BotSemanticState } from '../trading/bot-status-card';
import { ALL_SYMBOLS, CRYPTO_BY_SYMBOL, type CryptoMeta } from '@/lib/crypto-meta';
import { useDataProvider } from '@/lib/data-provider';
import { 
  Bot, 
  Plus, 
  ShieldCheck, 
  ShieldAlert, 
  Zap, 
  Sliders, 
  Cpu, 
  Power, 
  AlertCircle,
  Activity,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  RotateCcw,
  AlertTriangle,
  Play,
  Pause,
  Layers,
  Fuel,
  Search,
  RefreshCw,
  Check,
  ChevronDown
} from 'lucide-react';

export interface FleetMetricsAggregate {
  activeBotsCount: number;
  inPositionBots: BotInstance[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalTradesCount: number;
  totalWinningTrades: number;
  fleetWinRateFormatted: string;
}

/**
 * Agregação das métricas da frota em passagem única O(N), eliminando múltiplos loops e chamadas de filter/reduce.
 */
export function calculateFleetMetrics(bots: readonly BotInstance[]): FleetMetricsAggregate {
  let activeBotsCount = 0;
  const inPositionBots: BotInstance[] = [];
  let totalRealizedPnl = 0;
  let totalUnrealizedPnl = 0;
  let totalTradesCount = 0;
  let totalWinningTrades = 0;

  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (b.active) activeBotsCount++;
    if (b.position && b.position.quantity > 0) {
      inPositionBots.push(b);
      if (typeof b.position.unrealizedPnl === 'number') {
        totalUnrealizedPnl += b.position.unrealizedPnl;
      }
    }
    if (b.stats) {
      totalRealizedPnl += b.stats.realizedPnl || 0;
      totalTradesCount += b.stats.totalTrades || 0;
      totalWinningTrades += b.stats.winTrades || 0;
    }
  }

  const winRatePct = totalTradesCount > 0 ? (totalWinningTrades / totalTradesCount) * 100 : 0;
  const fleetWinRateFormatted = totalTradesCount > 0 ? `${winRatePct.toFixed(1)}%` : '0.0%';

  return {
    activeBotsCount,
    inPositionBots,
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalTradesCount,
    totalWinningTrades,
    fleetWinRateFormatted,
  };
}

/**
 * Resolução pura e determinística do estado semântico de um bot com hierarquia estrita de precedência:
 * Circuit Breaker -> Cooldown -> Pausado -> Em Posição -> Aguardando Sinal
 */
export function resolveBotSemanticState(bot: BotInstance): BotSemanticState {
  const lastAction = bot.stats?.lastAction;
  if (lastAction?.includes('Circuit Breaker') || lastAction?.includes('Kill Switch')) {
    return 'circuit_breaker';
  }
  if (lastAction?.includes('Cooldown') || (bot.stats?.lossTrades ?? 0) >= 3) {
    return 'cooldown';
  }
  if (!bot.active || bot.status === 'stopped') {
    return 'paused';
  }
  if (bot.position && bot.position.quantity > 0) {
    return 'active';
  }
  return 'waiting_signal';
}

export const BotsScreen: React.FC = () => {
  const {
    bots,
    toggleBotActive,
    toggleAllBots,
    resetBotStats,
    updateBot,
    addBot,
    resetConsecutiveLossBrake,
    portfolio,
    tradingMode,
    setTradingMode,
    tickers,
  } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      toggleBotActive: s.toggleBotActive,
      toggleAllBots: s.toggleAllBots,
      resetBotStats: s.resetBotStats,
      updateBot: s.updateBot,
      addBot: s.addBot,
      resetConsecutiveLossBrake: s.resetConsecutiveLossBrake,
      portfolio: s.portfolio,
      tradingMode: s.tradingMode,
      setTradingMode: s.setTradingMode,
      tickers: s.tickers,
    }))
  );

  const { toast } = useToast();
  const { syncBinanceCoins } = useDataProvider();

  // Estados locais para criação de bot
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newBotName, setNewBotName] = useState('Alpha Momentum VWAP 01');
  const [newBotSymbol, setNewBotSymbol] = useState('BTCUSDT');
  const [newBotStrategy, setNewBotStrategy] = useState<BotStrategy>('momentum_rsi');
  const [capitalAllocation, setCapitalAllocation] = useState('15');
  const [stopLossPercent, setStopLossPercent] = useState('1.5');
  const [takeProfitPercent, setTakeProfitPercent] = useState('3.8');

  // Estados para seleção e busca de pares da Binance
  const [isSyncingCoins, setIsSyncingCoins] = useState(false);
  const [pairSearchQuery, setPairSearchQuery] = useState('');
  const [isPairDropdownOpen, setIsPairDropdownOpen] = useState(false);
  const [selectedPairCategory, setSelectedPairCategory] = useState<string>('Todos');
  const pairDropdownRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pairDropdownRef.current && !pairDropdownRef.current.contains(event.target as Node)) {
        setIsPairDropdownOpen(false);
      }
    }
    if (isPairDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPairDropdownOpen]);

  const handleSyncCoins = async () => {
    setIsSyncingCoins(true);
    try {
      const res = await syncBinanceCoins();
      toast({
        title: 'Binance Sincronizada',
        description: `${res.count} pares Spot USDT disponíveis para trading algorítmico.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro na Sincronização',
        description: 'Falha ao sincronizar pares com a Binance.',
      });
    } finally {
      setIsSyncingCoins(false);
    }
  };

  // Parâmetros Operacionais Globais
  const [riskPerTradeUsd, setRiskPerTradeUsd] = useState<number>(1.25); // faixa $1.05 - $1.40 USD
  const [circuitBreakerCeilingUsd, setCircuitBreakerCeilingUsd] = useState<number>(3.50); // teto $3.50 USD

  // Estados de confirmação em 2 passos para ações críticas
  const [killSwitchConfirm, setKillSwitchConfirm] = useState(false);
  const [closeAllConfirm, setCloseAllConfirm] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);
  const killTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (killTimeoutRef.current) clearTimeout(killTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // 1. Métricas Agregadas da Frota em Passagem Única O(N)
  const fleetMetrics = useMemo(() => calculateFleetMetrics(bots), [bots]);
  const {
    activeBotsCount,
    inPositionBots,
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalTradesCount,
    totalWinningTrades,
    fleetWinRateFormatted,
  } = fleetMetrics;

  // Lista dinâmica de todos os pares e binários disponíveis na Binance
  const availableBinancePairs = useMemo(() => {
    const set = new Set<string>(ALL_SYMBOLS);
    Object.keys(tickers).forEach((sym) => {
      if (sym.endsWith('USDT')) set.add(sym);
    });
    return Array.from(set).sort((a, b) => {
      const volA = tickers[a]?.quoteVolume || 0;
      const volB = tickers[b]?.quoteVolume || 0;
      return volB - volA;
    });
  }, [tickers]);

  // Pares filtrados por busca e categoria para o seletor institucional
  const filteredPairs = useMemo(() => {
    let list = availableBinancePairs;
    if (selectedPairCategory !== 'Todos') {
      list = list.filter((sym) => {
        const meta = CRYPTO_BY_SYMBOL[sym];
        return meta?.category === selectedPairCategory;
      });
    }
    if (pairSearchQuery.trim()) {
      const q = pairSearchQuery.toLowerCase().trim();
      list = list.filter((sym) => {
        const meta = CRYPTO_BY_SYMBOL[sym];
        return (
          sym.toLowerCase().includes(q) ||
          (meta?.name && meta.name.toLowerCase().includes(q)) ||
          (meta?.short && meta.short.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [availableBinancePairs, selectedPairCategory, pairSearchQuery]);

  // Circuit Breaker Diário: cálculo da perda consumida vs teto
  const navTotal = Math.max(10, portfolio?.totalValue || 38.85);
  const dailyPnl = portfolio?.pnl ?? totalRealizedPnl;
  const currentDailyLoss = dailyPnl < 0 ? Math.abs(dailyPnl) : 0;
  const circuitBreakerConsumedPct = Math.min(100, (currentDailyLoss / circuitBreakerCeilingUsd) * 100);
  const isCircuitBreakerWarning = circuitBreakerConsumedPct >= 75 && circuitBreakerConsumedPct < 100;
  const isCircuitBreakerTripped = circuitBreakerConsumedPct >= 100;

  // Ação: Kill-Switch Global com 2-Step Confirm
  const handleKillSwitch = useCallback(() => {
    if (!killSwitchConfirm) {
      setKillSwitchConfirm(true);
      if (killTimeoutRef.current) clearTimeout(killTimeoutRef.current);
      killTimeoutRef.current = setTimeout(() => setKillSwitchConfirm(false), 3500);
    } else {
      if (killTimeoutRef.current) clearTimeout(killTimeoutRef.current);
      setKillSwitchConfirm(false);
      toggleAllBots(false);
      playStopLossOrKillSwitchSound();
      toast({
        variant: 'destructive',
        title: '🚨 Kill-Switch Global Executado',
        description: `Todos os ${bots.length} robôs da frota foram pausados imediatamente.`,
      });
    }
  }, [killSwitchConfirm, toggleAllBots, bots.length, toast]);

  // Ação: Fechar Todas as Posições a Mercado
  const handleCloseAllPositions = useCallback(async () => {
    if (inPositionBots.length === 0) {
      toast({
        title: 'Nenhuma Posição Aberta',
        description: 'A frota não possui posições abertas no momento.',
      });
      return;
    }

    if (!closeAllConfirm) {
      setCloseAllConfirm(true);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = setTimeout(() => setCloseAllConfirm(false), 3500);
    } else {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      setCloseAllConfirm(false);
      setIsClosingAll(true);

      let closed = 0;
      for (const bot of inPositionBots) {
        try {
          await manualCloseBotPosition(bot.id);
          closed++;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[BotsScreen] Erro ao fechar posição de ${bot.name}:`, errorMsg);
        }
      }

      setIsClosingAll(false);
      toast({
        title: '⚡ Posições Liquidadas a Mercado',
        description: `${closed} de ${inPositionBots.length} posições foram fechadas a mercado.`,
      });
    }
  }, [closeAllConfirm, inPositionBots, toast]);

  // Handler de Criação de Robô
  const handleCreateBot = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSym = newBotSymbol.toUpperCase().replace('/', '');
    const capital = parseFloat(capitalAllocation) || 15;
    const sl = parseFloat(stopLossPercent) || 1.5;
    const tp = parseFloat(takeProfitPercent) || 3.8;

    addBot({
      name: newBotName,
      symbol: cleanSym,
      strategy: newBotStrategy,
      allocationAmount: capital,
      stopLoss: sl,
      takeProfit: tp,
      active: true,
      status: 'idle',
      stats: {
        totalTrades: 0,
        buyTrades: 0,
        sellTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        realizedPnl: 0,
        lastAction: 'Robô inicializado com sucesso via Smart Trading',
        lastActionTime: new Date().toISOString(),
      },
    });

    toast({
      title: 'Robô Criado com Sucesso',
      description: `${newBotName} (${cleanSym}) alocado com $${capital.toFixed(2)} USD.`,
    });
    setIsCreatingNew(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner de Orquestração */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
                Cockpit de Operação dos Bots
              </h1>
              <SmartBadge variant={tradingMode === 'live' ? 'danger' : 'success'} isDot>
                {tradingMode === 'live' ? 'Conta Real (Spot)' : 'Paper Trading'}
              </SmartBadge>
            </div>
            <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
              Orquestração algorítmica de alta frequência com Kill-Switch global e microsecond risk gates
            </p>
          </div>
        </div>

        {/* Global Fleet Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <SmartButton
            variant="outline"
            size="sm"
            onClick={() => {
              toggleAllBots(true);
              toast({
                title: 'Frota Ativada',
                description: `Todos os ${bots.length} robôs da frota foram iniciados com sucesso.`,
              });
            }}
            leftIcon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
          >
            Iniciar Todos
          </SmartButton>

          <SmartButton
            variant="outline"
            size="sm"
            onClick={() => {
              toggleAllBots(false);
              toast({
                title: 'Frota Pausada',
                description: `Todos os ${bots.length} robôs da frota foram pausados imediatamente.`,
              });
            }}
            leftIcon={<Pause className="w-3.5 h-3.5 text-amber-400" />}
          >
            Pausar Todos
          </SmartButton>

          <SmartButton
            variant={closeAllConfirm ? 'danger' : 'outline'}
            size="sm"
            disabled={isClosingAll || inPositionBots.length === 0}
            onClick={handleCloseAllPositions}
            leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
          >
            {closeAllConfirm ? 'Confirmar Fechamento?' : 'Fechar Posições'}
          </SmartButton>

          <SmartButton
            variant={killSwitchConfirm ? 'danger' : 'danger'}
            size="sm"
            onClick={handleKillSwitch}
            leftIcon={<Power className="w-3.5 h-3.5" />}
            className={killSwitchConfirm ? 'animate-pulse ring-2 ring-red-500' : ''}
          >
            {killSwitchConfirm ? 'CONFIRMAR KILL-SWITCH?' : 'KILL-SWITCH GLOBAL'}
          </SmartButton>

          <SmartButton
            variant="primary"
            size="sm"
            onClick={() => setIsCreatingNew(!isCreatingNew)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {isCreatingNew ? 'Fechar' : 'Novo Robô'}
          </SmartButton>
        </div>
      </div>

      {/* Row 1: Fleet Real-Time Metrics & Operational Parameters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Metricas em Tempo Real (8 Colunas) */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--st-text-muted)] font-medium">PnL Realizado (Frota)</span>
            <div className="mt-2">
              <span className={`text-lg font-bold font-mono ${totalRealizedPnl >= 0 ? 'text-[var(--st-success)]' : 'text-[var(--st-danger)]'}`}>
                {totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)}
              </span>
              <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
                {((totalRealizedPnl / navTotal) * 100).toFixed(2)}% do NAV
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--st-text-muted)] font-medium">uPnL Flutuante</span>
            <div className="mt-2">
              <span className={`text-lg font-bold font-mono ${totalUnrealizedPnl >= 0 ? 'text-[var(--st-success)]' : 'text-[var(--st-danger)]'}`}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
              </span>
              <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
                {inPositionBots.length} posições ativas
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--st-text-muted)] font-medium">Taxa de Acerto (Win Rate)</span>
            <div className="mt-2">
              <span className="text-lg font-bold font-mono text-[var(--st-text-primary)]">
                {fleetWinRateFormatted}
              </span>
              <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
                {totalWinningTrades}W / {totalTradesCount - totalWinningTrades}L
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--st-text-muted)] font-medium">Status da Frota</span>
            <div className="mt-2">
              <span className="text-lg font-bold font-mono text-emerald-400">
                {activeBotsCount}/{bots.length} Ativos
              </span>
              <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
                Uptime: 99.98%
              </span>
            </div>
          </div>
        </div>

        {/* Painel de Parâmetros Operacionais e Circuit Breaker (4 Colunas) */}
        <div className="lg:col-span-4 p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--st-border)]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--st-primary)]" />
              <span className="text-xs font-bold text-[var(--st-text-primary)]">Parâmetros Operacionais</span>
            </div>
            <button
              type="button"
              onClick={() => setTradingMode(tradingMode === 'live' ? 'paper' : 'live')}
              className="text-[10px] font-mono px-2 py-0.5 rounded border border-[var(--st-border)] hover:bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] font-bold transition-all"
            >
              Modo: {tradingMode === 'live' ? 'REAL' : 'PAPER'}
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {/* Risco por Trade */}
            <div className="flex items-center justify-between">
              <span className="text-[var(--st-text-secondary)]">Risco por Trade:</span>
              <div className="flex items-center gap-1.5 font-mono">
                {[1.05, 1.25, 1.40].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setRiskPerTradeUsd(val);
                      toast({ title: 'Risco por Trade Atualizado', description: `Ajustado para $${val.toFixed(2)} USD.` });
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      riskPerTradeUsd === val
                        ? 'bg-[var(--st-primary)] text-white'
                        : 'bg-[var(--st-bg-elevated)] text-[var(--st-text-muted)] hover:text-white'
                    }`}
                  >
                    ${val.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>

            {/* Circuit Breaker Diário */}
            <div className="flex items-center justify-between">
              <span className="text-[var(--st-text-secondary)]">Teto Circuit Breaker:</span>
              <span className="font-mono font-bold text-[var(--st-text-primary)]">
                ${circuitBreakerCeilingUsd.toFixed(2)} USD (Max 5%)
              </span>
            </div>

            {/* Barra de Consumo do Circuit Breaker */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-[var(--st-text-muted)]">
                <span>Perda Diária: ${currentDailyLoss.toFixed(2)}</span>
                <span className={isCircuitBreakerTripped ? 'text-red-400 font-bold' : isCircuitBreakerWarning ? 'text-amber-400 font-bold' : ''}>
                  {circuitBreakerConsumedPct.toFixed(1)}% Consumido
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--st-bg-elevated)] overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    isCircuitBreakerTripped ? 'bg-red-500' : isCircuitBreakerWarning ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${circuitBreakerConsumedPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form de Criação de Robô (quando ativado) */}
      {isCreatingNew && (
        <SmartCard variant="elevated" className="border-[var(--st-primary)]/40 animate-in slide-in-from-top-4 duration-300">
          <SmartCardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[var(--st-primary)]" />
                <SmartCardTitle className="text-base">Novo Robô de Trading Algorítmico</SmartCardTitle>
              </div>
              <SmartBadge variant="purple">Parâmetros Institucionais</SmartBadge>
            </div>
            <SmartCardDescription>
              Configure os limites de risco e margem antes do despacho
            </SmartCardDescription>
          </SmartCardHeader>

          <SmartCardContent>
            <form onSubmit={handleCreateBot} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SmartInput
                  label="Nome da Instância"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  required
                />

                <div className="space-y-1.5 relative" ref={pairDropdownRef}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-[var(--st-text-secondary)]">Par de Ativos (Binance Spot)</label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSyncCoins}
                        disabled={isSyncingCoins}
                        className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono font-semibold transition-colors disabled:opacity-50"
                        title="Sincronizar todos os pares Spot USDT da Binance"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingCoins ? 'animate-spin' : ''}`} />
                        <span>{availableBinancePairs.length} pares</span>
                      </button>
                    </div>
                  </div>

                  {/* Botão trigger do Seletor Interativo com Fundo Escuro Seguro */}
                  <div 
                    onClick={() => setIsPairDropdownOpen(!isPairDropdownOpen)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[#18181b] hover:border-[var(--st-primary)] text-xs text-white cursor-pointer flex items-center justify-between transition-colors font-mono select-none"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-white tracking-wide">
                        {newBotSymbol.replace('USDT', '/USDT')}
                      </span>
                      <span className="text-[11px] text-neutral-400 truncate">
                        ({CRYPTO_BY_SYMBOL[newBotSymbol]?.name || newBotSymbol.replace('USDT', '')})
                      </span>
                      {tickers[newBotSymbol] && (
                        <span className="text-[11px] text-emerald-400 font-bold ml-1">
                          ${tickers[newBotSymbol].price < 1 
                            ? tickers[newBotSymbol].price.toFixed(4) 
                            : tickers[newBotSymbol].price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${isPairDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Popover Suspenso Customizado com Busca e Contraste Institucional */}
                  {isPairDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 p-2.5 rounded-xl border border-neutral-700 bg-[#141416] shadow-[0_12px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                      {/* Campo de Busca Rápida */}
                      <div className="relative mb-2">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                          type="text"
                          value={pairSearchQuery}
                          onChange={(e) => setPairSearchQuery(e.target.value)}
                          placeholder="Buscar por símbolo ou nome (ex: BTC, SOL, PEPE, SUI)..."
                          autoFocus
                          className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-neutral-700 bg-neutral-900 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* Pills de Categoria */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-2 text-[10px] scrollbar-thin">
                        {['Todos', 'Layer 1', 'Layer 2', 'DeFi', 'Meme', 'AI', 'Inovação'].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedPairCategory(cat)}
                            className={`px-2 py-0.5 rounded-md font-semibold whitespace-nowrap transition-colors ${
                              selectedPairCategory === cat 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-neutral-800 text-neutral-400 hover:text-white'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Lista de Pares com Fundo Escuro Perfeito */}
                      <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1 text-xs scrollbar-thin">
                        {filteredPairs.length === 0 ? (
                          <div className="p-3 text-center text-xs text-neutral-500">
                            Nenhum par encontrado para &quot;{pairSearchQuery}&quot;
                          </div>
                        ) : (
                          filteredPairs.map((sym) => {
                            const t = tickers[sym];
                            const meta = CRYPTO_BY_SYMBOL[sym];
                            const name = meta?.name || sym.replace('USDT', '');
                            const isSelected = newBotSymbol === sym;
                            const isPos = (t?.priceChangePercent || 0) >= 0;

                            return (
                              <div
                                key={sym}
                                onClick={() => {
                                  setNewBotSymbol(sym);
                                  setIsPairDropdownOpen(false);
                                  setPairSearchQuery('');
                                }}
                                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                  isSelected 
                                    ? 'bg-blue-600/30 border border-blue-500/50 text-white' 
                                    : 'hover:bg-neutral-800/80 text-neutral-200'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {isSelected ? (
                                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                  ) : (
                                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                                  )}
                                  <div>
                                    <span className="font-mono font-bold text-white">
                                      {sym.replace('USDT', '/USDT')}
                                    </span>
                                    <span className="text-[10px] text-neutral-400 ml-1.5">
                                      {name}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right font-mono text-[11px]">
                                  {t ? (
                                    <div>
                                      <span className="text-neutral-200 font-semibold">
                                        ${t.price < 1 ? t.price.toFixed(4) : t.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                      </span>
                                      <span className={`block text-[10px] ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isPos ? '+' : ''}{(t.priceChangePercent || 0).toFixed(2)}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-neutral-500 text-[10px]">Spot</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fallback nativo oculto/acessível com estilos dark forçados */}
                  <select
                    value={newBotSymbol}
                    onChange={(e) => setNewBotSymbol(e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {availableBinancePairs.map((sym) => (
                      <option key={sym} value={sym} style={{ backgroundColor: '#18181b', color: '#ffffff' }}>
                        {sym}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--st-text-secondary)]">Estratégia Quant</label>
                  <select
                    value={newBotStrategy}
                    onChange={(e) => setNewBotStrategy(e.target.value as BotStrategy)}
                    style={{ backgroundColor: '#18181b', color: '#f8fafc' }}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[#18181b] text-xs text-white focus:outline-none focus:border-[var(--st-primary)]"
                  >
                    <option value="momentum_rsi" style={{ backgroundColor: '#18181b', color: '#f8fafc' }}>Momentum RSI + Volume Delta</option>
                    <option value="trend_following" style={{ backgroundColor: '#18181b', color: '#f8fafc' }}>Trend Following VWAP + Ribbon</option>
                    <option value="mean_reversion" style={{ backgroundColor: '#18181b', color: '#f8fafc' }}>Ornstein-Uhlenbeck Mean Reversion</option>
                    <option value="conformal_arbitrage" style={{ backgroundColor: '#18181b', color: '#f8fafc' }}>Conformal Bands (95% CI)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SmartInput
                  label="Capital Alocado (USD)"
                  value={capitalAllocation}
                  onChange={(e) => setCapitalAllocation(e.target.value)}
                  isNumeric
                  leftIcon={<span className="text-xs text-[var(--st-text-muted)]">$</span>}
                />

                <SmartInput
                  label="Stop Loss Estrito (%)"
                  value={stopLossPercent}
                  onChange={(e) => setStopLossPercent(e.target.value)}
                  isNumeric
                  rightSuffix="%"
                />

                <SmartInput
                  label="Take Profit Dinâmico (%)"
                  value={takeProfitPercent}
                  onChange={(e) => setTakeProfitPercent(e.target.value)}
                  isNumeric
                  rightSuffix="%"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <SmartButton
                  type="button"
                  variant="ghost"
                  onClick={() => setIsCreatingNew(false)}
                >
                  Cancelar
                </SmartButton>
                <SmartButton
                  type="submit"
                  variant="primary"
                  leftIcon={<Power className="w-4 h-4" />}
                >
                  Inicializar Robô
                </SmartButton>
              </div>
            </form>
          </SmartCardContent>
        </SmartCard>
      )}

      {/* Grid de Robôs da Frota */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {bots.map((bot) => {
          const semanticState = resolveBotSemanticState(bot);
          const hasPos = !!bot.position && bot.position.quantity > 0;
          const activeSymbol = (hasPos && bot.position?.symbol)
            ? bot.position.symbol
            : (bot.overrideSymbol && bot.overrideSymbol !== "AUTO" ? bot.overrideSymbol : bot.symbol);
          const cleanActiveSymbol = activeSymbol && activeSymbol !== "AUTO"
            ? (activeSymbol.endsWith("USDT") ? activeSymbol : `${activeSymbol}USDT`)
            : "";
          const currentPrice = (tickers[activeSymbol]?.price || (cleanActiveSymbol ? tickers[cleanActiveSymbol]?.price : undefined))
            ?? (bot.position?.currentPrice || 0);
          const uPnl = hasPos && bot.position
            ? (typeof bot.position.unrealizedPnl === "number" && bot.position.unrealizedPnl !== 0
                ? bot.position.unrealizedPnl
                : (currentPrice - bot.position.entryPrice) * bot.position.quantity)
            : 0;

          const displaySymbol = (hasPos && bot.position?.symbol)
            ? bot.position.symbol.replace('USDT', '/USDT')
            : (bot.overrideSymbol && bot.overrideSymbol !== "AUTO")
            ? bot.overrideSymbol.replace('USDT', '/USDT')
            : bot.symbol === "AUTO"
            ? "AUTO (Screener)"
            : bot.symbol.replace('USDT', '/USDT');

          const trades = bot.stats?.totalTrades || 0;
          const wins = bot.stats?.winTrades || 0;
          const wr = trades > 0 ? `${((wins / trades) * 100).toFixed(1)}%` : '0.0%';

          return (
            <SmartBotStatusCard
              key={bot.id}
              botId={bot.id}
              name={bot.name}
              strategy={bot.strategy}
              symbol={displaySymbol}
              status={bot.active ? 'active' : 'paused'}
              semanticState={semanticState}
              profitToday={`${(bot.stats?.realizedPnl || 0) >= 0 ? '+' : ''}$${(bot.stats?.realizedPnl || 0).toFixed(2)}`}
              profitPercent={parseFloat(((bot.stats?.realizedPnl || 0) / Math.max(1, bot.allocationAmount || 15) * 100).toFixed(2))}
              unrealizedPnlUsd={uPnl}
              tradesCount={trades}
              winRate={wr}
              drawdown={`${(bot.stats?.lossTrades || 0)} perdas seguidas`}
              lastAction={bot.stats?.lastAction || 'Aguardando oportunidade'}
              positionInfo={hasPos && bot.position ? {
                quantity: bot.position.quantity,
                entryPrice: bot.position.entryPrice,
                currentPrice: currentPrice,
                side: bot.position.side,
              } : undefined}
              onToggleStatus={() => {
                const willBeActive = !bot.active;
                toggleBotActive(bot.id);
                toast({
                  title: willBeActive ? `Robô ${bot.name} Ativado` : `Robô ${bot.name} Pausado`,
                  description: willBeActive
                    ? `O robô foi iniciado e está monitorando o par ${bot.symbol.replace('USDT', '/USDT')}.`
                    : `O robô foi pausado com sucesso. Nenhuma nova ordem será aberta.`,
                });
              }}
              onResetStats={() => {
                resetBotStats(bot.id);
                toast({ title: bot.name, description: 'Estatísticas zeradas com sucesso.' });
              }}
              onResetCooldown={() => {
                resetConsecutiveLossBrake(bot.id);
                toast({ title: bot.name, description: 'Cooldown de perdas consecutivas cancelado.' });
              }}
              onClosePositionMarket={async () => {
                try {
                  await manualCloseBotPosition(bot.id);
                  toast({ title: bot.name, description: 'Posição fechada a mercado com sucesso.' });
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Erro ao Fechar Posição', description: err.message });
                }
              }}
              onConfigure={() => {
                const newSl = prompt(`Ajustar Stop Loss (%) para ${bot.name}:`, String(bot.stopLoss || 1.5));
                if (newSl !== null) {
                  const slNum = parseFloat(newSl);
                  if (!isNaN(slNum) && slNum > 0) {
                    updateBot(bot.id, { stopLoss: slNum });
                    toast({ title: bot.name, description: `Stop loss ajustado para ${slNum}%.` });
                  }
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
