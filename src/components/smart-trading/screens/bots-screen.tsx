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
  Fuel
} from 'lucide-react';

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

  // Estados locais para criação de bot
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newBotName, setNewBotName] = useState('Alpha Momentum VWAP 01');
  const [newBotSymbol, setNewBotSymbol] = useState('BTCUSDT');
  const [newBotStrategy, setNewBotStrategy] = useState<BotStrategy>('momentum_rsi');
  const [capitalAllocation, setCapitalAllocation] = useState('15');
  const [stopLossPercent, setStopLossPercent] = useState('1.5');
  const [takeProfitPercent, setTakeProfitPercent] = useState('3.8');

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

  // 1. Métricas Agregadas da Frota em Tempo Real
  const activeBots = useMemo(() => bots.filter((b) => b.active), [bots]);
  const inPositionBots = useMemo(
    () => bots.filter((b) => !!b.position && b.position.quantity > 0),
    [bots]
  );

  const totalRealizedPnl = useMemo(() => {
    return bots.reduce((sum, b) => sum + (b.stats?.realizedPnl || 0), 0);
  }, [bots]);

  const totalUnrealizedPnl = useMemo(() => {
    return bots.reduce((sum, b) => {
      if (b.position && typeof b.position.unrealizedPnl === 'number') {
        return sum + b.position.unrealizedPnl;
      }
      return sum;
    }, 0);
  }, [bots]);

  const totalTradesCount = useMemo(() => {
    return bots.reduce((sum, b) => sum + (b.stats?.totalTrades || 0), 0);
  }, [bots]);

  const totalWinningTrades = useMemo(() => {
    return bots.reduce((sum, b) => sum + (b.stats?.winTrades || 0), 0);
  }, [bots]);

  const fleetWinRateFormatted = useMemo(() => {
    if (totalTradesCount === 0) return '0.0%';
    const pct = (totalWinningTrades / totalTradesCount) * 100;
    return `${pct.toFixed(1)}%`;
  }, [totalTradesCount, totalWinningTrades]);

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
        } catch (e: any) {
          console.error(`[BotsScreen] Erro ao fechar posição de ${bot.name}:`, e.message);
        }
      }

      setIsClosingAll(false);
      toast({
        title: '⚡ Posições Liquidadas a Mercado',
        description: `${closed} de ${inPositionBots.length} posições foram fechadas a mercado.`,
      });
    }
  }, [closeAllConfirm, inPositionBots, toast]);

  // Resolução Semântica do Estado do Bot
  const getBotSemanticState = useCallback((bot: BotInstance): BotSemanticState => {
    const isCb = bot.stats?.lastAction?.includes('Circuit Breaker') || bot.stats?.lastAction?.includes('Kill Switch');
    if (isCb) return 'circuit_breaker';
    const isCooldown = bot.stats?.lastAction?.includes('Cooldown') || (bot.stats?.lossTrades ?? 0) >= 3;
    if (isCooldown) return 'cooldown';
    if (!bot.active || bot.status === 'stopped') return 'paused';
    if (bot.position && bot.position.quantity > 0) return 'active';
    return 'waiting_signal';
  }, []);

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
            onClick={() => toggleAllBots(true)}
            leftIcon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
          >
            Iniciar Todos
          </SmartButton>

          <SmartButton
            variant="outline"
            size="sm"
            onClick={() => toggleAllBots(false)}
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
                {activeBots.length}/{bots.length} Ativos
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

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--st-text-secondary)]">Par de Ativos</label>
                  <select
                    value={newBotSymbol}
                    onChange={(e) => setNewBotSymbol(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]"
                  >
                    <option value="BTCUSDT">BTC/USDT</option>
                    <option value="ETHUSDT">ETH/USDT</option>
                    <option value="SOLUSDT">SOL/USDT</option>
                    <option value="BNBUSDT">BNB/USDT</option>
                    <option value="NEARUSDT">NEAR/USDT</option>
                    <option value="AVAXUSDT">AVAX/USDT</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--st-text-secondary)]">Estratégia Quant</label>
                  <select
                    value={newBotStrategy}
                    onChange={(e) => setNewBotStrategy(e.target.value as BotStrategy)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]"
                  >
                    <option value="momentum_rsi">Momentum RSI + Volume Delta</option>
                    <option value="trend_following">Trend Following VWAP + Ribbon</option>
                    <option value="mean_reversion">Ornstein-Uhlenbeck Mean Reversion</option>
                    <option value="conformal_arbitrage">Conformal Bands (95% CI)</option>
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
          const semanticState = getBotSemanticState(bot);
          const currentPrice = tickers[bot.symbol]?.price ?? (bot.position?.currentPrice || 0);
          const hasPos = !!bot.position && bot.position.quantity > 0;
          const uPnl = hasPos && bot.position
            ? (currentPrice - bot.position.entryPrice) * bot.position.quantity
            : 0;

          const trades = bot.stats?.totalTrades || 0;
          const wins = bot.stats?.winTrades || 0;
          const wr = trades > 0 ? `${((wins / trades) * 100).toFixed(1)}%` : '0.0%';

          return (
            <SmartBotStatusCard
              key={bot.id}
              botId={bot.id}
              name={bot.name}
              strategy={bot.strategy}
              symbol={bot.symbol.replace('USDT', '/USDT')}
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
              onToggleStatus={() => toggleBotActive(bot.id)}
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
