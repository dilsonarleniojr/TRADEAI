'use client';

import React from 'react';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartBadge } from '../ui/badge';
import { SmartButton } from '../ui/button';
import { SmartPerformanceCard } from '../trading/performance-card';
import { SmartMarketHeatmap } from '../trading/market-heatmap';
import { SmartAssetWatchlist } from '../trading/asset-watchlist';
import { SmartBotStatusCard } from '../trading/bot-status-card';
import { 
  Wallet, 
  TrendingUp, 
  Sparkles, 
  Bot, 
  ShieldAlert, 
  ArrowUpRight, 
  Zap, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  BarChart3,
  Layers
} from 'lucide-react';

interface DashboardScreenProps {
  onNavigateTab: (tab: string) => void;
  onSelectSymbol?: (symbol: string) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ 
  onNavigateTab,
  onSelectSymbol 
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md relative overflow-hidden">
        <div 
          className="absolute -right-20 -top-20 w-64 h-64 rounded-full pointer-events-none opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--st-primary) 0%, var(--st-secondary) 100%)' }}
        />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
              Cockpit Quantitativo & Visão Geral
            </h1>
            <SmartBadge variant="purple" isDot>IA Ativa 24/7</SmartBadge>
          </div>
          <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
            Comitê de IA calibrado via Conformal Prediction (95% CI) • 4 robôs em execução contínua
          </p>
        </div>

        <div className="flex items-center gap-2.5 relative z-10">
          <SmartButton 
            variant="outline" 
            size="sm"
            onClick={() => onNavigateTab('paper')}
            leftIcon={<Wallet className="w-3.5 h-3.5 text-[var(--st-primary)]" />}
          >
            Paper Trading
          </SmartButton>
          <SmartButton 
            variant="primary" 
            size="sm"
            onClick={() => onNavigateTab('charts')}
            rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
          >
            Abrir Gráfico L2
          </SmartButton>
        </div>
      </div>

      {/* Row 1: Key Performance Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SmartPerformanceCard
          title="Saldo Total Líquido"
          value="$124,580.40"
          changePercent={3.42}
          changePeriod="hoje"
          icon={<Wallet className="w-4 h-4 text-[var(--st-primary)]" />}
          sparklineData={[118000, 119200, 118800, 120500, 122100, 121800, 124580]}
          subtext="Margem livre: $48,220.10"
        />

        <SmartPerformanceCard
          title="Lucro Líquido Realizado (24h)"
          value="+$4,210.50"
          changePercent={8.15}
          changePeriod="vs ontem"
          icon={<TrendingUp className="w-4 h-4 text-[var(--st-success)]" />}
          sparklineData={[2800, 3100, 2900, 3400, 3700, 3950, 4210]}
          subtext="Taxa de acerto (Win Rate): 74.2%"
        />

        <SmartPerformanceCard
          title="Sharpe Ratio Institucional"
          value="2.84"
          changePercent={0.4}
          changePeriod="30 dias"
          icon={<BarChart3 className="w-4 h-4 text-[var(--st-secondary)]" />}
          sparklineData={[2.4, 2.5, 2.65, 2.6, 2.72, 2.8, 2.84]}
          subtext="Sortino: 3.45 • Max DD: -2.8%"
        />

        <SmartPerformanceCard
          title="Robôs Ativos & Saúde"
          value="4 de 5 On"
          changePercent={0}
          changePeriod="100% SLA"
          icon={<Bot className="w-4 h-4 text-[var(--st-warning)]" />}
          sparklineData={[4, 4, 3, 4, 4, 4, 4]}
          subtext="Latência média de rede: 24ms"
        />
      </div>

      {/* Row 2: AI Insights Spotlight + Mini Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Insights Card (Notion-style modular card) */}
        <SmartCard variant="elevated" className="lg:col-span-1 flex flex-col justify-between">
          <SmartCardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--st-secondary)]/10 text-[var(--st-secondary)]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <SmartCardTitle>Insight Quântico da IA</SmartCardTitle>
              </div>
              <SmartBadge variant="purple">Alta Probabilidade</SmartBadge>
            </div>
            <SmartCardDescription>
              Confluência Multi-Timeframe (5m, 15m, 1h)
            </SmartCardDescription>
          </SmartCardHeader>

          <SmartCardContent className="space-y-4">
            <div className="p-3.5 rounded-xl border border-[var(--st-primary)]/20 bg-[var(--st-primary)]/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--st-text-primary)]">BTC/USDT Breakout Alinhado</span>
                <span className="text-xs font-mono text-[var(--st-success)] font-bold">88% Confluência</span>
              </div>
              <p className="text-xs text-[var(--st-text-secondary)] leading-relaxed">
                Rompimento de acumulação Wyckoff em $67,200 confirmado por delta de volume positivo (+1,420 BTC). Stop loss sugerido em $66,450 (-1.12%).
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] text-[var(--st-text-muted)] font-mono">
                <span>Alvo 1: $68,800</span>
                <span>•</span>
                <span>Alvo 2: $70,200</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--st-text-secondary)]">Conformal Interval (95%)</span>
                <span className="font-mono text-[var(--st-text-primary)]">[$66,850 - $69,450]</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--st-text-secondary)]">Detecção de Spoofing L2</span>
                <span className="font-medium text-[var(--st-success)] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Book Limpo (0.02)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--st-text-secondary)]">Risco da Banca por Trade</span>
                <span className="font-mono text-[var(--st-text-primary)]">1.50% (NAV Safe)</span>
              </div>
            </div>

            <SmartButton 
              variant="outline" 
              className="w-full text-xs font-medium"
              onClick={() => onNavigateTab('ai')}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Ver Todos os 8 Sinais do Comitê
            </SmartButton>
          </SmartCardContent>
        </SmartCard>

        {/* Heatmap Section */}
        <div className="lg:col-span-2">
          <SmartMarketHeatmap onSelectAsset={(sym) => {
            if (onSelectSymbol) onSelectSymbol(sym);
            onNavigateTab('charts');
          }} />
        </div>
      </div>

      {/* Row 3: Active Trading Bots + Asset Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[var(--st-primary)]" />
              <h2 className="text-base font-semibold text-[var(--st-text-primary)]">
                Robôs Quantitativos em Monitoramento
              </h2>
            </div>
            <SmartButton 
              variant="ghost" 
              size="sm"
              onClick={() => onNavigateTab('bots')}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Gerenciar Robôs
            </SmartButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SmartBotStatusCard
              name="Alpha Conformal Grid"
              strategy="Statistical Arbitrage + Conformal Bands"
              symbol="BTC/USDT"
              status="active"
              profitToday="+$1,840.20"
              profitPercent={+4.8}
              tradesCount={42}
              winRate="76.2%"
              drawdown="-1.15%"
              lastAction="Compra executada em $67,180"
              onToggleStatus={() => {}}
              onConfigure={() => onNavigateTab('bots')}
            />

            <SmartBotStatusCard
              name="Momentum Surge HFT"
              strategy="Breakout VWAP + Volume Delta"
              symbol="SOL/USDT"
              status="active"
              profitToday="+$1,340.50"
              profitPercent={+7.2}
              tradesCount={68}
              winRate="69.1%"
              drawdown="-2.10%"
              lastAction="Trailing stop ajustado para $184.20"
              onToggleStatus={() => {}}
              onConfigure={() => onNavigateTab('bots')}
            />
          </div>
        </div>

        {/* Asset Watchlist */}
        <div className="lg:col-span-1">
          <SmartAssetWatchlist onSelectPair={(pair) => {
            if (onSelectSymbol) onSelectSymbol(pair);
            onNavigateTab('charts');
          }} />
        </div>
      </div>
    </div>
  );
};
