'use client';

import React, { useState } from 'react';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartInput } from '../ui/input';
import { SmartBadge } from '../ui/badge';
import { SmartSwitch } from '../ui/switch';
import { SmartModal } from '../ui/modal';
import { 
  Palette, 
  Type, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  Search, 
  ArrowRight, 
  Copy, 
  ShieldCheck,
  Send,
  Zap,
  Sliders
} from 'lucide-react';

export const DesignSystemScreen: React.FC = () => {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [demoSwitch, setDemoSwitch] = useState(true);
  const [demoInput, setDemoInput] = useState('');
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  const colorTokens = [
    { name: 'primary-500', hex: '#3B82F6', label: 'Azul Elétrico (Ação Primária)' },
    { name: 'primary-600', hex: '#2563EB', label: 'Azul Profundo (Hover)' },
    { name: 'primary-700', hex: '#1D4ED8', label: 'Azul Escuro (Active)' },
    { name: 'secondary-500', hex: '#8B5CF6', label: 'Roxo Tecnológico (IA & Quant)' },
    { name: 'secondary-600', hex: '#7C3AED', label: 'Roxo Profundo (Glow Accent)' },
    { name: 'success-500', hex: '#22C55E', label: 'Verde Bullish / Lucro' },
    { name: 'danger-500', hex: '#EF4444', label: 'Vermelho Bearish / Stop Loss' },
    { name: 'warning-500', hex: '#F59E0B', label: 'Amarelo Alerta / Atenção' },
    { name: 'neutral-900', hex: '#0D0D0D', label: 'Preto Profundo (Fundo Dark)' },
    { name: 'neutral-800', hex: '#1A1A1A', label: 'Grafite (Superfície Card)' },
    { name: 'neutral-700', hex: '#2E2E2E', label: 'Cinza Carvão (Bordas)' },
    { name: 'neutral-100', hex: '#FFFFFF', label: 'Branco Puro (Texto Primário)' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-6xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl border border-[var(--st-border-glow)] bg-[var(--st-bg-surface)] backdrop-blur-xl relative overflow-hidden">
        <div 
          className="absolute -right-20 -top-20 w-80 h-80 rounded-full pointer-events-none opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--st-primary) 0%, var(--st-secondary) 100%)' }}
        />
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--st-primary)]/20 bg-[var(--st-primary)]/10 text-[var(--st-primary)] text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Smart Trading Living Design System v2.0</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--st-text-primary)]">
            Design Tokens, Componentes & Guia Visual
          </h1>
          <p className="text-xs sm:text-sm text-[var(--st-text-secondary)] max-w-2xl">
            Biblioteca modular concebida para fintechs de alta frequência e interfaces com IA. Inspirada nos princípios visuais de TradingView, Notion, Binance e Revolut.
          </p>
        </div>
      </div>

      {/* 1. Design Tokens: Colors */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-[var(--st-primary)]" />
          <h2 className="text-lg font-bold text-[var(--st-text-primary)]">1. Paleta de Cores & Tokens Semânticos</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {colorTokens.map((token) => (
            <div
              key={token.name}
              onClick={() => copyToClipboard(token.hex)}
              className="group p-3 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:border-[var(--st-primary)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div 
                className="w-full h-12 rounded-lg mb-2 shadow-inner border border-white/10 group-hover:scale-[1.02] transition-transform" 
                style={{ backgroundColor: token.hex }}
              />
              <div>
                <div className="flex items-center justify-between text-xs font-mono font-bold text-[var(--st-text-primary)]">
                  <span>{token.name}</span>
                  <Copy className="w-3 h-3 text-[var(--st-text-muted)] group-hover:text-[var(--st-primary)]" />
                </div>
                <span className="text-[11px] font-mono text-[var(--st-text-secondary)]">{token.hex}</span>
                <p className="text-[10px] text-[var(--st-text-muted)] mt-1 truncate">{token.label}</p>
              </div>
            </div>
          ))}
        </div>
        {copiedToken && (
          <div className="text-xs text-[var(--st-success)] flex items-center gap-1 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" /> Token copiado para a área de transferência: {copiedToken}
          </div>
        )}
      </div>

      {/* 2. Typography Hierarchy */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Type className="w-5 h-5 text-[var(--st-secondary)]" />
          <h2 className="text-lg font-bold text-[var(--st-text-primary)]">2. Tipografia & Números Financeiros</h2>
        </div>

        <SmartCard>
          <SmartCardContent className="p-6 space-y-6">
            <div className="border-b border-[var(--st-border)] pb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--st-text-primary)]">
                Display Title (36–48px)
              </span>
              <span className="text-xs font-mono text-[var(--st-text-muted)]">Inter / Plus Jakarta Sans • Bold (800)</span>
            </div>

            <div className="border-b border-[var(--st-border)] pb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
                Header 1 (24px)
              </span>
              <span className="text-xs font-mono text-[var(--st-text-muted)]">Bold (700) • Tracking Tight</span>
            </div>

            <div className="border-b border-[var(--st-border)] pb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="text-lg font-semibold text-[var(--st-text-primary)]">
                Header 2 / Subtitle (18px)
              </span>
              <span className="text-xs font-mono text-[var(--st-text-muted)]">Semi-Bold (600)</span>
            </div>

            <div className="border-b border-[var(--st-border)] pb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <span className="text-sm text-[var(--st-text-secondary)] leading-relaxed max-w-xl">
                Body Text (14px): Texto padrão para descrições, insights explicativos de inteligência artificial e feedbacks de ordens operacionais com alta legibilidade.
              </span>
              <span className="text-xs font-mono text-[var(--st-text-muted)]">Regular (400) • High Contrast</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div className="flex items-center gap-4">
                <span className="text-2xl font-mono font-bold text-[var(--st-success)]">$67,420.50</span>
                <span className="text-2xl font-mono font-bold text-[var(--st-danger)]">-2.84%</span>
                <span className="text-sm font-mono text-[var(--st-text-primary)]">0.004218 BTC</span>
              </div>
              <span className="text-xs font-mono text-[var(--st-text-muted)]">JetBrains Mono / Tabular Figures (Preços & Cotações)</span>
            </div>
          </SmartCardContent>
        </SmartCard>
      </div>

      {/* 3. Component Showcase: Buttons, Inputs, Badges, Switches */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[var(--st-primary)]" />
          <h2 className="text-lg font-bold text-[var(--st-text-primary)]">3. Componentes Interativos Base</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Buttons Matrix */}
          <SmartCard variant="elevated">
            <SmartCardHeader>
              <SmartCardTitle className="text-sm">Matriz de Botões (SmartButton)</SmartCardTitle>
              <SmartCardDescription>Variantes com estados de foco, hover e carregamento</SmartCardDescription>
            </SmartCardHeader>

            <SmartCardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <SmartButton variant="primary">Primary</SmartButton>
                <SmartButton variant="secondary">Secondary</SmartButton>
                <SmartButton variant="outline">Outline</SmartButton>
                <SmartButton variant="ghost">Ghost</SmartButton>
                <SmartButton variant="success">Success</SmartButton>
                <SmartButton variant="danger">Danger</SmartButton>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[var(--st-border)]">
                <SmartButton variant="primary" size="sm">Small</SmartButton>
                <SmartButton variant="primary" size="md">Medium</SmartButton>
                <SmartButton variant="primary" size="lg">Large</SmartButton>
                <SmartButton variant="primary" isLoading>Carregando</SmartButton>
                <SmartButton variant="primary" disabled>Desativado</SmartButton>
              </div>
            </SmartCardContent>
          </SmartCard>

          {/* Badges Matrix */}
          <SmartCard variant="elevated">
            <SmartCardHeader>
              <SmartCardTitle className="text-sm">Badges Semânticos (SmartBadge)</SmartCardTitle>
              <SmartCardDescription>Indicadores de estado com suporte a live pulsing dot</SmartCardDescription>
            </SmartCardHeader>

            <SmartCardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <SmartBadge variant="blue" isDot>Em Execução</SmartBadge>
                <SmartBadge variant="purple" isDot>IA Ativa</SmartBadge>
                <SmartBadge variant="success" isDot>Lucro Líquido</SmartBadge>
                <SmartBadge variant="danger" isDot>Stop Loss</SmartBadge>
                <SmartBadge variant="warning" isDot>Atenção</SmartBadge>
                <SmartBadge variant="outline">Neutro</SmartBadge>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-elevated)] space-y-3">
                <span className="text-xs font-semibold text-[var(--st-text-primary)]">Toggles e Modais</span>
                <SmartSwitch
                  label="Conformal Prediction 95% CI"
                  description="Calibração matemática contínua das bandas de volatilidade"
                  checked={demoSwitch}
                  onChange={setDemoSwitch}
                />

                <div className="pt-2">
                  <SmartButton 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsDemoModalOpen(true)}
                  >
                    Testar SmartModal
                  </SmartButton>
                </div>
              </div>
            </SmartCardContent>
          </SmartCard>

          {/* Inputs & Validation */}
          <SmartCard variant="elevated" className="md:col-span-2">
            <SmartCardHeader>
              <SmartCardTitle className="text-sm">Inputs & Campos de Formulário (SmartInput)</SmartCardTitle>
              <SmartCardDescription>Campos numéricos, senhas com reveal, ícones e estados de erro</SmartCardDescription>
            </SmartCardHeader>

            <SmartCardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SmartInput
                label="Texto com Ícone à Esquerda"
                placeholder="Pesquise por pares de ativos..."
                leftIcon={<Search className="w-4 h-4 text-[var(--st-text-muted)]" />}
              />

              <SmartInput
                label="Campo Numérico com Sufixo"
                placeholder="1000"
                value={demoInput}
                onChange={(e) => setDemoInput(e.target.value)}
                isNumeric
                rightSuffix="USDT"
                helperText="Mínimo notional: 10 USDT"
              />

              <SmartInput
                label="Senha Segura com Reveal"
                type="password"
                defaultValue="supersecret123"
              />
            </SmartCardContent>
          </SmartCard>
        </div>
      </div>

      {/* Demo Modal */}
      <SmartModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        title="Demonstração do SmartModal"
        subtitle="Componente acessível com backdrop blur e suporte a tecla ESC"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--st-text-secondary)] leading-relaxed">
            Este modal implementa o padrão de glassmorphism com animação de escala e opacidade, foco automático e fechamento dinâmico.
          </p>
          <div className="flex justify-end gap-2">
            <SmartButton variant="ghost" onClick={() => setIsDemoModalOpen(false)}>Fechar</SmartButton>
            <SmartButton variant="primary" onClick={() => setIsDemoModalOpen(false)}>Confirmar Ação</SmartButton>
          </div>
        </div>
      </SmartModal>
    </div>
  );
};
