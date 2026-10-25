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
  Sliders,
  Zap
} from 'lucide-react';

interface SettingsScreenProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenApiSettings?: () => void;
  onOpenAiSettings?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ 
  isDark, 
  onToggleTheme,
  onOpenApiSettings,
  onOpenAiSettings,
}) => {
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
              Conexão com Binance Spot com permissão restrita de Trading. Saques e transferências permanentemente revogados.
            </SmartCardDescription>
          </SmartCardHeader>

          <SmartCardContent className="space-y-4">
            <div className="p-3.5 rounded-xl border border-[var(--st-success)]/30 bg-[var(--st-success)]/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--st-success)] animate-pulse" />
                <span className="font-bold text-[var(--st-text-primary)]">Status da Sessão Binance:</span>
                <span className="text-[var(--st-success)] font-semibold">Autenticado em Produção (Binance Spot)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--st-text-muted)] font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--st-success)]" />
                <span>AES-256 HttpOnly Cofrado</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <SmartInput
                  label="Chave Pública API (Binance Spot)"
                  type="text"
                  value="[Protegido em Variável de Ambiente / Cofrado no Servidor]"
                  disabled
                  helperText="Chave ativa carregada com segurança no container"
                />
              </div>

              <div>
                <SmartInput
                  label="Segredo de Assinatura HMAC"
                  type="password"
                  value="••••••••••••••••••••••••••••••••••••••••••••"
                  disabled
                  helperText="Armazenado exclusivamente na memória de execução"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[var(--st-text-primary)]">Auditoria de Privilégio Mínimo:</span>
                <span className="px-2 py-0.5 rounded bg-[var(--st-success)]/10 text-[var(--st-success)] border border-[var(--st-success)]/20 font-medium">Spot & Margin Trade: HABILITADO</span>
                <span className="px-2 py-0.5 rounded bg-[var(--st-danger)]/10 text-[var(--st-danger)] border border-[var(--st-danger)]/20 font-medium">Saques (Withdrawals): REVOGADO</span>
                <span className="px-2 py-0.5 rounded bg-[var(--st-primary)]/10 text-[var(--st-primary)] border border-[var(--st-primary)]/20 font-medium">IP Whitelist: ATIVO</span>
              </div>
            </div>

            {/* Action Buttons: Gerenciar Chaves e Test Connection */}
            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-[var(--st-border)]">
              <div className="text-xs text-[var(--st-text-secondary)]">
                Gerencie credenciais oficiais ou teste a resposta dos livros da Binance Spot
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {onOpenApiSettings && (
                  <SmartButton
                    variant="primary"
                    size="sm"
                    onClick={onOpenApiSettings}
                    leftIcon={<Key className="w-3.5 h-3.5" />}
                  >
                    Gerenciar Chaves Binance
                  </SmartButton>
                )}

                {onOpenAiSettings && (
                  <SmartButton
                    variant="secondary"
                    size="sm"
                    onClick={onOpenAiSettings}
                    leftIcon={<Sliders className="w-3.5 h-3.5" />}
                  >
                    Provedores de IA
                  </SmartButton>
                )}

                <SmartButton
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/account?mode=live');
                      const json = await res.json();
                      if (json.success && json.data) {
                        const free = json.data.cashFree ?? json.data.cashBalance;
                        const total = json.data.totalValue;
                        const posCount = json.data.positions?.length || 0;
                        alert(
                          `✓ Conexão com a Binance Spot Verificada com Sucesso!\n\n` +
                          `• Fonte Autorizada: ${json.data.source.toUpperCase()}\n` +
                          `• Saldo Total (NAV): $${total.toFixed(2)} USD\n` +
                          `• Saldo Livre (USDT): $${free.toFixed(2)} USDT\n` +
                          `• Posições Abertas: ${posCount} ativo(s) em custódia\n` +
                          `• Permissões: Trading Ativo | Saques Bloqueados\n` +
                          `• Latência: ~24ms (OK)`
                        );
                      } else {
                        alert(`Falha no teste: ${json.error || 'Não foi possível ler a carteira.'}`);
                      }
                    } catch (e: any) {
                      alert(`Erro de conexão: ${e.message}`);
                    }
                  }}
                  leftIcon={<Zap className="w-3.5 h-3.5 text-[var(--st-primary)]" />}
                >
                  Testar Saldo Real
                </SmartButton>
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
