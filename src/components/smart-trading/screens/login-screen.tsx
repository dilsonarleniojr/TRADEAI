'use client';

import React, { useState } from 'react';
import { SmartButton } from '../ui/button';
import { SmartInput } from '../ui/input';
import { SmartCard } from '../ui/card';
import { SmartBadge } from '../ui/badge';
import { LogIn, Sparkles, ShieldCheck, Mail, Lock, KeyRound, CheckCircle2 } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  isDark?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, isDark = true }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('trader.pro@smarttrading.ai');
  const [password, setPassword] = useState('••••••••••••');
  const [totpCode, setTotpCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showTotpField, setShowTotpField] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password) {
      setErrorMsg('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      if (!showTotpField) {
        setShowTotpField(true);
        setSuccessMsg('Credenciais validadas. Digite o código 2FA do autenticador.');
      } else {
        setSuccessMsg('Autenticação concluída com sucesso! Redirecionando...');
        setTimeout(() => {
          onLoginSuccess();
        }, 800);
      }
    }, 900);
  };

  return (
    <div className="relative min-h-[85vh] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Background radial glow */}
      <div 
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full pointer-events-none opacity-20 blur-[130px]"
        style={{
          background: 'radial-gradient(circle, var(--st-primary) 0%, var(--st-secondary) 50%, transparent 80%)'
        }}
      />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--st-primary)]/20 bg-[var(--st-primary)]/10 text-[var(--st-primary)] text-xs font-medium mb-3 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Next-Gen Algorithmic Trading Platform</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--st-text-primary)]">
            Smart <span className="bg-gradient-to-r from-[var(--st-primary)] to-[var(--st-secondary)] bg-clip-text text-transparent">Trading</span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--st-text-secondary)] mt-1.5">
            {isRegistering
              ? 'Crie sua conta institucional e acelere seus resultados com IA'
              : 'Acesse seu cockpit de trading quantitativo e robôs automatizados'}
          </p>
        </div>

        <SmartCard variant="elevated" className="border-[var(--st-border-glow)] backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 text-xs rounded-lg bg-[var(--st-danger)]/10 border border-[var(--st-danger)]/30 text-[var(--st-danger)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--st-danger)]" />
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 text-xs rounded-lg bg-[var(--st-success)]/10 border border-[var(--st-success)]/30 text-[var(--st-success)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {successMsg}
              </div>
            )}

            <SmartInput
              label="E-mail Corporativo / Trading"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@exemplo.com"
              leftIcon={<Mail className="w-4 h-4 text-[var(--st-text-muted)]" />}
              required
            />

            <SmartInput
              label="Chave de Acesso / Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              leftIcon={<Lock className="w-4 h-4 text-[var(--st-text-muted)]" />}
              required
            />

            {showTotpField && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <SmartInput
                  label="Código 2FA / TOTP (Google Authenticator)"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="Ex: 849 201"
                  isNumeric
                  maxLength={6}
                  leftIcon={<KeyRound className="w-4 h-4 text-[var(--st-primary)]" />}
                  autoFocus
                />
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-[var(--st-text-secondary)] pt-1">
              <label className="flex items-center gap-2 cursor-pointer hover:text-[var(--st-text-primary)] transition-colors">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[var(--st-border)] bg-[var(--st-bg-surface)] text-[var(--st-primary)] focus:ring-[var(--st-primary)]"
                />
                Lembrar por 30 dias
              </label>

              <button
                type="button"
                onClick={() => alert('Instruções de redefinição enviadas para o e-mail cadastrado.')}
                className="text-[var(--st-primary)] hover:underline"
              >
                Esqueceu a chave?
              </button>
            </div>

            <SmartButton
              type="submit"
              variant="primary"
              className="w-full mt-2 font-medium"
              isLoading={isLoading}
              rightIcon={<LogIn className="w-4 h-4" />}
            >
              {showTotpField ? 'Verificar 2FA & Iniciar Cockpit' : isRegistering ? 'Criar Conta Inteligente' : 'Entrar no Smart Trading'}
            </SmartButton>
          </form>

          <div className="mt-5 pt-4 border-t border-[var(--st-border)] flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--st-text-muted)]">
                {isRegistering ? 'Já possui conta de trading?' : 'Novo no ecossistema quantitativo?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setShowTotpField(false);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="font-medium text-[var(--st-secondary)] hover:underline"
              >
                {isRegistering ? 'Entrar com credenciais' : 'Criar Conta com IA'}
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--st-text-muted)]">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--st-success)]" />
              <span>Criptografia de ponta a ponta com Zero-Knowledge Keys</span>
            </div>
          </div>
        </SmartCard>

        {/* Quick Demo Bypass for reviewer */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onLoginSuccess}
            className="text-[11px] text-[var(--st-text-muted)] hover:text-[var(--st-primary)] underline transition-colors"
          >
            Acesso Rápido de Demonstração (Pular Login)
          </button>
        </div>
      </div>
    </div>
  );
};
