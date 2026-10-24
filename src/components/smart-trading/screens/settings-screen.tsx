'use client';

import React, { useState } from 'react';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartInput } from '../ui/input';
import { SmartBadge } from '../ui/badge';
import { SmartSwitch } from '../ui/switch';
import { 
  Settings, 
  Key, 
  ShieldCheck, 
  Moon, 
  Sun, 
  Bell, 
  Smartphone, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  Lock, 
  AlertTriangle,
  Globe,
  Sliders
} from 'lucide-react';

interface SettingsScreenProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ isDark, onToggleTheme }) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('vm208349028490284092840928409284029482');
  const [apiSecret, setApiSecret] = useState('••••••••••••••••••••••••••••••••••••••••••••');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [telegramAlerts, setTelegramAlerts] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [maxLeverage, setMaxLeverage] = useState('1');
  const [maxSlippage, setMaxSlippage] = useState('0.15');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveSettings = () => {
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 2500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
              Preferências & Governança de Risco
            </h1>
            <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
              Gerencie chaves de API, credenciais de segurança e parâmetros globais da plataforma
            </p>
          </div>
        </div>

        <SmartButton
          variant="primary"
          onClick={handleSaveSettings}
          leftIcon={<CheckCircle2 className="w-4 h-4" />}
        >
          {savedSuccess ? 'Configurações Salvas!' : 'Salvar Alterações'}
        </SmartButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Appearance & Interface */}
        <SmartCard variant="elevated">
          <SmartCardHeader>
            <div className="flex items-center gap-2">
              {isDark ? <Moon className="w-4 h-4 text-[var(--st-primary)]" /> : <Sun className="w-4 h-4 text-[var(--st-warning)]" />}
              <SmartCardTitle className="text-base">Aparência & Interface</SmartCardTitle>
            </div>
            <SmartCardDescription>Personalize o tema visual e densidade de dados</SmartCardDescription>
          </SmartCardHeader>

          <SmartCardContent className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)]">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-[var(--st-text-primary)]">Modo de Exibição</span>
                <p className="text-[11px] text-[var(--st-text-secondary)]">
                  {isDark ? 'Tema Escuro Ativo (TradingView Dark)' : 'Tema Claro Ativo (Clean Fintech)'}
                </p>
              </div>

              <SmartButton
                variant="outline"
                size="sm"
                onClick={onToggleTheme}
                leftIcon={isDark ? <Sun className="w-3.5 h-3.5 text-[var(--st-warning)]" /> : <Moon className="w-3.5 h-3.5 text-[var(--st-primary)]" />}
              >
                {isDark ? 'Alternar p/ Modo Claro' : 'Alternar p/ Modo Escuro'}
              </SmartButton>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--st-text-secondary)]">Moeda Base</label>
                <select className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]">
                  <option value="USD">USD ($ Dólar Americano)</option>
                  <option value="BRL">BRL (R$ Real Brasileiro)</option>
                  <option value="EUR">EUR (€ Euro)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--st-text-secondary)]">Idioma</label>
                <select className="w-full h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] text-xs text-[var(--st-text-primary)] focus:outline-none focus:border-[var(--st-primary)]">
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (Global)</option>
                </select>
              </div>
            </div>
          </SmartCardContent>
        </SmartCard>

        {/* Security & 2FA */}
        <SmartCard variant="elevated">
          <SmartCardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--st-success)]" />
                <SmartCardTitle className="text-base">Segurança & Autenticação (2FA)</SmartCardTitle>
              </div>
              <SmartBadge variant="success" isDot>Proteção Ativa</SmartBadge>
            </div>
            <SmartCardDescription>Autenticação de dois fatores TOTP com tempo de rotação de 30s</SmartCardDescription>
          </SmartCardHeader>

          <SmartCardContent className="space-y-4">
            <SmartSwitch
              label="Autenticação em Dois Fatores (Google Authenticator)"
              description="Exigir código numérico de 6 dígitos para login e ordens de alto nocional"
              checked={twoFactorEnabled}
              onChange={setTwoFactorEnabled}
            />

            <div className="p-3.5 rounded-xl border border-[var(--st-success)]/30 bg-[var(--st-success)]/5 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--st-success)]">
                <CheckCircle2 className="w-3.5 h-3.5" /> Chave de Backup 2FA Registrada
              </div>
              <p className="text-[var(--st-text-secondary)]">
                Chave TOTP criptografada com algoritmo AES-256 no cofre local da sua máquina.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[var(--st-text-secondary)]">Sessões Ativas</span>
              <span className="font-mono text-[var(--st-text-primary)]">1 dispositivo conectado (Linux)</span>
            </div>
          </SmartCardContent>
        </SmartCard>

        {/* Exchange API Keys */}
        <SmartCard variant="elevated" className="md:col-span-2">
          <SmartCardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[var(--st-primary)]" />
                <SmartCardTitle className="text-base">Cofre de Chaves de API (Exchanges)</SmartCardTitle>
              </div>
              <SmartBadge variant="blue">Privilégio Mínimo Verificado</SmartBadge>
            </div>
            <SmartCardDescription>
              Conexão com Binance / Bybit com permissão estrita de Trading Spot. Saques permanentemente bloqueados.
            </SmartCardDescription>
          </SmartCardHeader>

          <SmartCardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <SmartInput
                  label="API Key (Binance / OKX)"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  rightSuffix={
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-[var(--st-text-muted)] hover:text-[var(--st-text-primary)]"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  }
                />
              </div>

              <div>
                <SmartInput
                  label="Secret Key"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--st-text-primary)]">Permissões da Chave:</span>
                <span className="px-2 py-0.5 rounded bg-[var(--st-success)]/10 text-[var(--st-success)] border border-[var(--st-success)]/20 font-medium">Spot & Margin Trade: HABILITADO</span>
                <span className="px-2 py-0.5 rounded bg-[var(--st-danger)]/10 text-[var(--st-danger)] border border-[var(--st-danger)]/20 font-medium">Saques (Withdrawals): REVOGADO</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--st-text-muted)]">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--st-success)]" />
                <span>IP Whitelist Ativo</span>
              </div>
            </div>
          </SmartCardContent>
        </SmartCard>

        {/* Risk Governance & Circuit Breakers */}
        <SmartCard variant="elevated" className="md:col-span-2">
          <SmartCardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[var(--st-warning)]" />
              <SmartCardTitle className="text-base">Guardrails Globais de Risco</SmartCardTitle>
            </div>
            <SmartCardDescription>
              Filtros rígidos de proteção de patrimônio aplicados antes de qualquer despacho de ordens
            </SmartCardDescription>
          </SmartCardHeader>

          <SmartCardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SmartInput
                label="Alavancagem Máxima Permitida"
                value={maxLeverage}
                onChange={(e) => setMaxLeverage(e.target.value)}
                isNumeric
                rightSuffix="x"
                helperText="Padrão Spot 1x (Sem alavancagem tóxica)"
              />

              <SmartInput
                label="Slippage Máximo Aceito (%)"
                value={maxSlippage}
                onChange={(e) => setMaxSlippage(e.target.value)}
                isNumeric
                rightSuffix="%"
                helperText="Cancela ordem se o spread exceder 0.15%"
              />

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--st-text-secondary)]">Kill-Switch de Perda Diária</label>
                <div className="h-10 px-3 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex items-center justify-between text-xs">
                  <span className="font-mono text-[var(--st-danger)] font-bold">-3.0% do NAV</span>
                  <SmartBadge variant="danger">Bloqueio Imediato</SmartBadge>
                </div>
                <p className="text-[11px] text-[var(--st-text-muted)]">Trava automática caso o drawdown intradiário atinja 3%</p>
              </div>
            </div>
          </SmartCardContent>
        </SmartCard>
      </div>
    </div>
  );
};
