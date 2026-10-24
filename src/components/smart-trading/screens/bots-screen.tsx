'use client';

import React, { useState } from 'react';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartInput } from '../ui/input';
import { SmartBadge } from '../ui/badge';
import { SmartSwitch } from '../ui/switch';
import { SmartBotStatusCard } from '../trading/bot-status-card';
import { 
  Bot, 
  Plus, 
  ShieldCheck, 
  Zap, 
  Sliders, 
  Cpu, 
  Power, 
  AlertCircle,
  Activity,
  CheckCircle2
} from 'lucide-react';

export const BotsScreen: React.FC = () => {
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newBotName, setNewBotName] = useState('Alpha DCA Dynamic 01');
  const [newBotSymbol, setNewBotSymbol] = useState('ETH/USDT');
  const [newBotStrategy, setNewBotStrategy] = useState('Conformal Grid');
  const [capitalAllocation, setCapitalAllocation] = useState('15000');
  const [stopLossPercent, setStopLossPercent] = useState('1.5');
  const [takeProfitPercent, setTakeProfitPercent] = useState('3.8');
  const [trailingStopEnabled, setTrailingStopEnabled] = useState(true);
  const [circuitBreakerLoss, setCircuitBreakerLoss] = useState(true);

  const [bots, setBots] = useState([
    {
      id: 'bot-1',
      name: 'Alpha Conformal Grid',
      strategy: 'Statistical Arbitrage + Conformal Bands',
      symbol: 'BTC/USDT',
      status: 'active' as const,
      profitToday: '+$1,840.20',
      profitPercent: 4.8,
      tradesCount: 42,
      winRate: '76.2%',
      drawdown: '-1.15%',
      lastAction: 'Compra executada em $67,180 (Limit Order)',
    },
    {
      id: 'bot-2',
      name: 'Momentum Surge HFT',
      strategy: 'Breakout VWAP + Volume Delta',
      symbol: 'SOL/USDT',
      status: 'active' as const,
      profitToday: '+$1,340.50',
      profitPercent: 7.2,
      tradesCount: 68,
      winRate: '69.1%',
      drawdown: '-2.10%',
      lastAction: 'Trailing stop ajustado dinamicamente para $184.20',
    },
    {
      id: 'bot-3',
      name: 'Mean Reversion Scalper',
      strategy: 'Ornstein-Uhlenbeck Volatility Band',
      symbol: 'ETH/USDT',
      status: 'active' as const,
      profitToday: '+$640.80',
      profitPercent: 2.1,
      tradesCount: 29,
      winRate: '72.4%',
      drawdown: '-0.85%',
      lastAction: 'Aguardando retração na banda inferior $3,480',
    },
    {
      id: 'bot-4',
      name: 'Binance Funding Arbitrage',
      strategy: 'Delta-Neutral Spot-Perp Funding Carry',
      symbol: 'BTC/USDT',
      status: 'paused' as const,
      profitToday: '+$388.90',
      profitPercent: 1.2,
      tradesCount: 8,
      winRate: '100%',
      drawdown: '-0.10%',
      lastAction: 'Pausado manualmente para rebalanceamento',
    }
  ]);

  const handleToggleBot = (id: string) => {
    setBots(bots.map(b => {
      if (b.id === id) {
        return {
          ...b,
          status: b.status === 'active' ? 'paused' : 'active'
        };
      }
      return b;
    }));
  };

  const handleCreateBot = (e: React.FormEvent) => {
    e.preventDefault();
    const created = {
      id: `bot-${Date.now()}`,
      name: newBotName,
      strategy: newBotStrategy,
      symbol: newBotSymbol,
      status: 'active' as const,
      profitToday: '+$0.00',
      profitPercent: 0,
      tradesCount: 0,
      winRate: '100%',
      drawdown: '0.00%',
      lastAction: 'Robô inicializado com sucesso',
    };
    setBots([created, ...bots]);
    setIsCreatingNew(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
              Gerenciador de Robôs Autônomos
            </h1>
            <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
              Orquestração de instâncias de trading algorítmico com Kill-Switch global e microsecond telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-secondary)]">
            <Activity className="w-3.5 h-3.5 text-[var(--st-success)] animate-pulse" />
            <span>Health Check: <strong>99.98%</strong></span>
          </div>

          <SmartButton
            variant="primary"
            size="sm"
            onClick={() => setIsCreatingNew(!isCreatingNew)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {isCreatingNew ? 'Fechar Construtor' : 'Criar Novo Robô'}
          </SmartButton>
        </div>
      </div>

      {/* New Bot Creator Form Modal/Flyout */}
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
              Configure os guardrails de risco e limites de margem antes do despacho
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
                    <option value="BTC/USDT">BTC/USDT</option>
                    <option value="ETH/USDT">ETH/USDT</option>
                    <option value="SOL/USDT">SOL/USDT</option>
                    <option value="BNB/USDT">BNB/USDT</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--st-text-secondary)]">Estratégia Quant</label>
                  <select
                    value={newBotStrategy}
                    onChange={(e) => setNewBotStrategy(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]"
                  >
                    <option value="Conformal Grid">Conformal Grid (Markov + 95% CI)</option>
                    <option value="Momentum HFT">Momentum Surge VWAP</option>
                    <option value="Mean Reversion">Ornstein-Uhlenbeck Mean Reversion</option>
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

              {/* Safety Toggles */}
              <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-elevated)] grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SmartSwitch
                  label="Trailing Stop Dinâmico com Runner"
                  description="Ajusta o stop loss para o breakeven e acompanha o topo do candle"
                  checked={trailingStopEnabled}
                  onChange={setTrailingStopEnabled}
                />

                <SmartSwitch
                  label="Circuit Breaker Local (3 perdas consecutivas)"
                  description="Pausa automática e alerta imediato caso 3 trades seguidos encerrem em loss"
                  checked={circuitBreakerLoss}
                  onChange={setCircuitBreakerLoss}
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
                  Inicializar Robô em Modo Dry Run
                </SmartButton>
              </div>
            </form>
          </SmartCardContent>
        </SmartCard>
      )}

      {/* Bot Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {bots.map((bot) => (
          <SmartBotStatusCard
            key={bot.id}
            name={bot.name}
            strategy={bot.strategy}
            symbol={bot.symbol}
            status={bot.status}
            profitToday={bot.profitToday}
            profitPercent={bot.profitPercent}
            tradesCount={bot.tradesCount}
            winRate={bot.winRate}
            drawdown={bot.drawdown}
            lastAction={bot.lastAction}
            onToggleStatus={() => handleToggleBot(bot.id)}
            onConfigure={() => alert(`Configurações de ${bot.name} abertas.`)}
          />
        ))}
      </div>
    </div>
  );
};
