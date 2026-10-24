'use client';

import React, { useState } from 'react';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartInput } from '../ui/input';
import { SmartBadge } from '../ui/badge';
import { SmartBacktestMetricsCard } from '../trading/backtest-metrics-card';
import { 
  Play, 
  RotateCcw, 
  Sliders, 
  History, 
  Percent, 
  DollarSign, 
  ShieldAlert, 
  CheckCircle2, 
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react';

export const BacktestScreen: React.FC = () => {
  const [strategy, setStrategy] = useState('conformal_grid');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [initialCapital, setInitialCapital] = useState('100000');
  const [stopLoss, setStopLoss] = useState('2.0');
  const [takeProfit, setTakeProfit] = useState('4.5');
  const [feeRate, setFeeRate] = useState('0.04');
  const [slippage, setSlippage] = useState('0.05');
  const [isRunning, setIsRunning] = useState(false);
  const [backtestVersion, setBacktestVersion] = useState(1);

  const handleRunBacktest = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setBacktestVersion(prev => prev + 1);
    }, 1200);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
              Simulador & Backtesting Institucional
            </h1>
            <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
              Simulação realista com fricção de corretagem Maker/Taker, slippage dinâmico e validação Walk-Forward
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SmartBadge variant="blue" isDot>Modo Fricção Realista</SmartBadge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Backtest Parameters (4 columns) */}
        <div className="lg:col-span-4 space-y-4">
          <SmartCard variant="elevated">
            <SmartCardHeader>
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[var(--st-primary)]" />
                <SmartCardTitle className="text-base">Parâmetros da Estratégia</SmartCardTitle>
              </div>
              <SmartCardDescription>Ajuste os hiperparâmetros de execução</SmartCardDescription>
            </SmartCardHeader>

            <SmartCardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--st-text-secondary)]">Algoritmo Quantitativo</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]"
                >
                  <option value="conformal_grid">Alpha Conformal Grid (Markov + 95% CI)</option>
                  <option value="momentum_vwap">Momentum Surge VWAP + Volume Delta</option>
                  <option value="mean_reversion">Ornstein-Uhlenbeck Mean Reversion</option>
                  <option value="stat_arb">Statistical Arbitrage Cointegration</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--st-text-secondary)]">Par de Ativos</label>
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]"
                  >
                    <option value="BTC/USDT">BTC/USDT</option>
                    <option value="ETH/USDT">ETH/USDT</option>
                    <option value="SOL/USDT">SOL/USDT</option>
                    <option value="BNB/USDT">BNB/USDT</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--st-text-secondary)]">Timeframe</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]"
                  >
                    <option value="5m">5 Minutos</option>
                    <option value="15m">15 Minutos</option>
                    <option value="1h">1 Hora</option>
                    <option value="4h">4 Horas</option>
                  </select>
                </div>
              </div>

              <SmartInput
                label="Capital Inicial (USD)"
                type="text"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                isNumeric
                leftIcon={<DollarSign className="w-3.5 h-3.5 text-[var(--st-text-muted)]" />}
              />

              <div className="grid grid-cols-2 gap-3">
                <SmartInput
                  label="Stop Loss (%)"
                  type="text"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  isNumeric
                  rightSuffix="%"
                />

                <SmartInput
                  label="Take Profit (%)"
                  type="text"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  isNumeric
                  rightSuffix="%"
                />
              </div>

              {/* Frictional Costs Section */}
              <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-elevated)] space-y-3">
                <span className="text-xs font-bold text-[var(--st-text-primary)] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-[var(--st-warning)]" />
                  Custos de Fricção Realista
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <SmartInput
                    label="Taxa Corretagem (%)"
                    type="text"
                    value={feeRate}
                    onChange={(e) => setFeeRate(e.target.value)}
                    isNumeric
                    rightSuffix="%"
                  />
                  <SmartInput
                    label="Slippage Médio (%)"
                    type="text"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    isNumeric
                    rightSuffix="%"
                  />
                </div>
              </div>

              <SmartButton
                variant="primary"
                className="w-full mt-2 font-medium"
                isLoading={isRunning}
                onClick={handleRunBacktest}
                leftIcon={<Play className="w-4 h-4 fill-current" />}
              >
                {isRunning ? 'Computando Simulação...' : 'Executar Backtesting'}
              </SmartButton>
            </SmartCardContent>
          </SmartCard>
        </div>

        {/* Right Output: Performance Tearsheet and Trade History (8 columns) */}
        <div className="lg:col-span-8 space-y-6">
          <SmartBacktestMetricsCard />
        </div>
      </div>
    </div>
  );
};
