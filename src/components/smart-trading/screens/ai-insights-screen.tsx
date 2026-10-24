'use client';

import React, { useState } from 'react';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartBadge } from '../ui/badge';
import { SmartButton } from '../ui/button';
import { 
  Sparkles, 
  BrainCircuit, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  Target, 
  AlertTriangle, 
  CheckCircle2, 
  BarChart2, 
  Layers, 
  RefreshCw,
  Search,
  Zap
} from 'lucide-react';

export const AIInsightsScreen: React.FC = () => {
  const [selectedAsset, setSelectedAsset] = useState('BTC/USDT');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const signals = [
    {
      symbol: 'BTC/USDT',
      direction: 'ALTA',
      probability: 88,
      trend: 'Bullish Continuation',
      timeframe: '15m / 1h',
      s1: '$66,850',
      s2: '$65,400',
      r1: '$68,900',
      r2: '$70,500',
      conformalRange: '[$66,850 - $69,450]',
      spoofingRisk: 'Muito Baixo (0.02)',
      atr: '1.85%',
      committee: {
        trend: { vote: 'ALTA', weight: '35%', score: '92/100' },
        momentum: { vote: 'ALTA', weight: '25%', score: '85/100' },
        orderFlow: { vote: 'ALTA', weight: '25%', score: '88/100' },
        riskGate: { vote: 'APROVADO', weight: '15%', score: '100/100' },
      },
      explanation: 'Confluência quântica detectada: O preço rompeu a consolidação retangular com forte delta de agressão comprador. As EMAs 20 e 50 mostram expansão angular positiva em 15m. O intervalo de previsão conformal (95%) estima preço médio projetado de $68,400 sem violação de liquidez.',
      recommendation: 'Entrada parcial em $67,250 com Stop Loss estrito em $66,450 (-1.19%) e Take Profit escalonado em $68,900 e $70,500.'
    },
    {
      symbol: 'ETH/USDT',
      direction: 'ALTA',
      probability: 82,
      trend: 'Momentum Rebound',
      timeframe: '30m / 4h',
      s1: '$3,460',
      s2: '$3,380',
      r1: '$3,620',
      r2: '$3,780',
      conformalRange: '[$3,440 - $3,650]',
      spoofingRisk: 'Baixo (0.05)',
      atr: '2.40%',
      committee: {
        trend: { vote: 'ALTA', weight: '35%', score: '84/100' },
        momentum: { vote: 'ALTA', weight: '25%', score: '80/100' },
        orderFlow: { vote: 'NEUTRO', weight: '25%', score: '72/100' },
        riskGate: { vote: 'APROVADO', weight: '15%', score: '100/100' },
      },
      explanation: 'Rejeição de suporte na média móvel institucional de 200 períodos em 4h com divergência altista no RSI. Pressão vendedora em desaceleração no livro L2.',
      recommendation: 'Aguardar fechamento de candle 30m acima de $3,540 para confirmação antes de disparar ordens de compra.'
    },
    {
      symbol: 'SOL/USDT',
      direction: 'ALTA',
      probability: 91,
      trend: 'Hyper-Growth Breakout',
      timeframe: '5m / 15m',
      s1: '$181.20',
      s2: '$174.50',
      r1: '$194.00',
      r2: '$208.00',
      conformalRange: '[$180.50 - $198.00]',
      spoofingRisk: 'Baixo (0.04)',
      atr: '3.80%',
      committee: {
        trend: { vote: 'ALTA', weight: '35%', score: '96/100' },
        momentum: { vote: 'ALTA', weight: '25%', score: '94/100' },
        orderFlow: { vote: 'ALTA', weight: '25%', score: '90/100' },
        riskGate: { vote: 'APROVADO', weight: '15%', score: '100/100' },
      },
      explanation: 'Ativo líder em fluxo relativo de capital nas últimas 6 horas. O robô HFT acionou trailing stop dinâmico e o comitê quantitativo validou continuidade sem exaustão.',
      recommendation: 'Trailing Stop ativo em $184.20. Proibido novas entradas a mercado sem pullback corretivo.'
    }
  ];

  const currentSignal = signals.find(s => s.symbol === selectedAsset) || signals[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
              Comitê de IA & Clear-Box Analytics
            </h1>
            <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
              Análise quantitativa explicável sem efeito caixa-preta • Conformal Prediction + L2 Anti-Spoofing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SmartButton
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Recalibrar Modelos
          </SmartButton>
        </div>
      </div>

      {/* Asset Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {signals.map((sig) => (
          <button
            key={sig.symbol}
            type="button"
            onClick={() => setSelectedAsset(sig.symbol)}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all ${
              selectedAsset === sig.symbol
                ? 'bg-[var(--st-primary)]/15 border-[var(--st-primary)] text-[var(--st-text-primary)] shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                : 'border-[var(--st-border)] bg-[var(--st-bg-surface)] text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)]'
            }`}
          >
            <span className="font-bold">{sig.symbol}</span>
            <span className="font-mono text-[var(--st-success)] font-semibold">{sig.probability}%</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--st-success)]" />
          </button>
        ))}
      </div>

      {/* Main Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Probability & Levels */}
        <div className="space-y-6 lg:col-span-1">
          {/* Probability Gauge Card */}
          <SmartCard variant="elevated">
            <SmartCardHeader>
              <div className="flex items-center justify-between">
                <SmartCardTitle className="text-sm">Probabilidade de Confluência</SmartCardTitle>
                <SmartBadge variant="success" isDot>{currentSignal.direction}</SmartBadge>
              </div>
              <SmartCardDescription>{currentSignal.trend}</SmartCardDescription>
            </SmartCardHeader>

            <SmartCardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
                <div className="text-4xl font-extrabold font-mono text-[var(--st-success)] tracking-tight">
                  {currentSignal.probability}%
                </div>
                <span className="text-xs text-[var(--st-text-secondary)] mt-1">Nível de Certeza do Comitê</span>
                <div className="w-full bg-[var(--st-bg-surface)] h-2 rounded-full mt-3 overflow-hidden border border-[var(--st-border)]">
                  <div 
                    className="h-full bg-gradient-to-r from-[var(--st-primary)] to-[var(--st-success)] rounded-full transition-all duration-500" 
                    style={{ width: `${currentSignal.probability}%` }}
                  />
                </div>
              </div>

              {/* Conformal Prediction Box */}
              <div className="p-3.5 rounded-xl border border-[var(--st-primary)]/20 bg-[var(--st-primary)]/5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--st-text-primary)] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--st-primary)]" />
                    Intervalo Conformal (95% CI)
                  </span>
                  <span className="font-mono font-bold text-[var(--st-primary)]">{currentSignal.conformalRange}</span>
                </div>
                <p className="text-[11px] text-[var(--st-text-secondary)] leading-relaxed">
                  Calculado matematicamente com base em resíduos históricos não-conformes. Garante 95% de cobertura teórica em condições normais de mercado.
                </p>
              </div>

              {/* Spoofing L2 & ATR */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--st-bg-surface)] border border-[var(--st-border)]">
                  <span className="text-[var(--st-text-secondary)]">Risco de Spoofing / Fake Walls</span>
                  <span className="font-mono text-[var(--st-success)] font-medium">{currentSignal.spoofingRisk}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--st-bg-surface)] border border-[var(--st-border)]">
                  <span className="text-[var(--st-text-secondary)]">Volatilidade ATR (14)</span>
                  <span className="font-mono text-[var(--st-text-primary)] font-medium">{currentSignal.atr}</span>
                </div>
              </div>
            </SmartCardContent>
          </SmartCard>

          {/* Key Supports & Resistances */}
          <SmartCard>
            <SmartCardHeader>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[var(--st-primary)]" />
                <SmartCardTitle className="text-sm">Níveis Estruturais de Preço</SmartCardTitle>
              </div>
              <SmartCardDescription>Zonas de alta liquidez e repulsão</SmartCardDescription>
            </SmartCardHeader>

            <SmartCardContent className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--st-danger)]/5 border border-[var(--st-danger)]/20">
                <span className="text-[var(--st-danger)] font-medium">Resistência R2</span>
                <span className="font-bold text-[var(--st-text-primary)]">{currentSignal.r2}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--st-danger)]/5 border border-[var(--st-danger)]/20">
                <span className="text-[var(--st-danger)] font-medium">Resistência R1</span>
                <span className="font-bold text-[var(--st-text-primary)]">{currentSignal.r1}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--st-success)]/5 border border-[var(--st-success)]/20">
                <span className="text-[var(--st-success)] font-medium">Suporte S1</span>
                <span className="font-bold text-[var(--st-text-primary)]">{currentSignal.s1}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--st-success)]/5 border border-[var(--st-success)]/20">
                <span className="text-[var(--st-success)] font-medium">Suporte S2</span>
                <span className="font-bold text-[var(--st-text-primary)]">{currentSignal.s2}</span>
              </div>
            </SmartCardContent>
          </SmartCard>
        </div>

        {/* Right Column: Clear-Box Committee Votes & Detailed Explanation */}
        <div className="space-y-6 lg:col-span-2">
          {/* Quantitative Committee Card */}
          <SmartCard variant="elevated">
            <SmartCardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[var(--st-secondary)]" />
                  <SmartCardTitle>Votos do Comitê Quantitativo</SmartCardTitle>
                </div>
                <SmartBadge variant="outline">Transparência 100%</SmartBadge>
              </div>
              <SmartCardDescription>
                Ponderação dos módulos matemáticos independentes que compõem o sinal
              </SmartCardDescription>
            </SmartCardHeader>

            <SmartCardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[var(--st-text-secondary)] font-medium">Trend Engine (EMA/MACD)</span>
                    <span className="text-[var(--st-text-muted)] font-mono">Peso: {currentSignal.committee.trend.weight}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--st-success)] flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> {currentSignal.committee.trend.vote}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[var(--st-text-primary)]">{currentSignal.committee.trend.score}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[var(--st-text-secondary)] font-medium">Momentum (RSI/Stoch/ATR)</span>
                    <span className="text-[var(--st-text-muted)] font-mono">Peso: {currentSignal.committee.momentum.weight}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--st-success)] flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> {currentSignal.committee.momentum.vote}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[var(--st-text-primary)]">{currentSignal.committee.momentum.score}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[var(--st-text-secondary)] font-medium">Order Flow L2 (Delta)</span>
                    <span className="text-[var(--st-text-muted)] font-mono">Peso: {currentSignal.committee.orderFlow.weight}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--st-success)] flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> {currentSignal.committee.orderFlow.vote}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[var(--st-text-primary)]">{currentSignal.committee.orderFlow.score}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[var(--st-text-secondary)] font-medium">Risk Gate & Circuit Breaker</span>
                    <span className="text-[var(--st-text-muted)] font-mono">Peso: {currentSignal.committee.riskGate.weight}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--st-primary)] flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" /> {currentSignal.committee.riskGate.vote}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[var(--st-text-primary)]">{currentSignal.committee.riskGate.score}</span>
                  </div>
                </div>
              </div>

              {/* Clear-Box Narrative Section */}
              <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-elevated)] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--st-text-primary)] uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--st-secondary)]" />
                  Racional Analítico Detalhado da IA
                </div>
                <p className="text-xs sm:text-sm text-[var(--st-text-secondary)] leading-relaxed">
                  {currentSignal.explanation}
                </p>

                <div className="p-3 rounded-lg bg-[var(--st-success)]/10 border border-[var(--st-success)]/30 text-xs text-[var(--st-text-primary)] space-y-1">
                  <span className="font-bold text-[var(--st-success)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Recomendação Executiva
                  </span>
                  <p className="text-[var(--st-text-secondary)]">
                    {currentSignal.recommendation}
                  </p>
                </div>
              </div>
            </SmartCardContent>
          </SmartCard>
        </div>
      </div>
    </div>
  );
};
