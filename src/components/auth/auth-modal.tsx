'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Lock,
  Mail,
  User,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, login, register } = useAuthStore();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regSuccessDetails, setRegSuccessDetails] = useState<{
    secret: string;
    uri: string;
  } | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const res = await login(
        loginEmail,
        loginPassword,
        requiresOtp ? loginOtp : undefined
      );

      if (res.requiresTwoFactor) {
        setRequiresOtp(true);
        toast.info('Autenticação em 2 Etapas', {
          description: 'Insira o código de 6 dígitos gerado pelo seu autenticador.',
        });
      } else if (res.success) {
        toast.success('Bem-vindo ao TradeAI Pro!', {
          description: 'Sessão institucional autenticada com sucesso.',
        });
        resetForms();
      } else {
        toast.error('Erro de autenticação', {
          description: res.error || 'Credenciais inválidas.',
        });
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      toast.error('Senhas não coincidem', {
        description: 'Certifique-se de que ambas as senhas inseridas sejam idênticas.',
      });
      return;
    }
    if (regPassword.length < 8) {
      toast.error('Senha fraca', {
        description: 'A senha deve conter no mínimo 8 caracteres.',
      });
      return;
    }

    setIsRegistering(true);
    try {
      const res = await register(regName, regEmail, regPassword, true);
      if (res.success) {
        toast.success('Conta criada com sucesso!', {
          description: 'Chave de autenticação em 2 etapas (2FA) configurada.',
        });
        if (res.twoFactorSecret && res.otpauthUri) {
          setRegSuccessDetails({
            secret: res.twoFactorSecret,
            uri: res.otpauthUri,
          });
        } else {
          resetForms();
        }
      } else {
        toast.error('Erro no cadastro', {
          description: res.error || 'Não foi possível concluir o registro.',
        });
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const resetForms = () => {
    setLoginEmail('');
    setLoginPassword('');
    setLoginOtp('');
    setRequiresOtp(false);
    setRegName('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    setRegSuccessDetails(null);
    closeAuthModal();
  };

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(open) => !open && resetForms()}>
      <DialogContent className="sm:max-w-[460px] bg-slate-950 border-slate-800 text-slate-100 p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Acesso Institucional Seguro</span>
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight text-white">
            TradeAI Pro
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-400">
            Conecte sua conta para sincronizar estratégias, bots e telemetria quantitativa.
          </DialogDescription>
        </DialogHeader>

        {regSuccessDetails ? (
          <div className="space-y-5 py-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 text-emerald-300 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>2FA TOTP Ativado com Sucesso!</span>
              </div>
              <p className="text-xs text-slate-300">
                Guarde seu segredo Base32 ou adicione ao Google Authenticator / 1Password:
              </p>
              <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-center font-mono text-xs select-all text-emerald-400 tracking-wider">
                {regSuccessDetails.secret}
              </div>
            </div>
            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold"
              onClick={resetForms}
            >
              Concluir e Ir para o Cockpit
            </Button>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(val) => setTab(val as any)} className="w-full mt-2">
            <TabsList className="grid grid-cols-2 w-full bg-slate-900 border border-slate-800 p-1 rounded-xl">
              <TabsTrigger
                value="login"
                className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs font-medium"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs font-medium"
              >
                Criar Conta
              </TabsTrigger>
            </TabsList>

            {/* TAB: LOGIN */}
            <TabsContent value="login" className="space-y-4 pt-4">
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type="email"
                      required
                      placeholder="trader@tradeai.org"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-medium">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-9 pr-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showLoginPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {requiresOtp && (
                  <div className="space-y-1.5 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
                    <Label className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Código 2FA TOTP (6 Dígitos)</span>
                    </Label>
                    <Input
                      type="text"
                      maxLength={6}
                      required
                      autoFocus
                      placeholder="000000"
                      value={loginOtp}
                      onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ''))}
                      className="text-center font-mono text-lg tracking-widest bg-slate-900 border-emerald-500/50 text-white focus-visible:ring-emerald-500"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold h-10 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  {isLoggingIn ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Autenticando...</span>
                    </div>
                  ) : requiresOtp ? (
                    'Confirmar Código 2FA'
                  ) : (
                    'Entrar na Plataforma'
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* TAB: REGISTER */}
            <TabsContent value="register" className="space-y-4 pt-4">
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-medium">Nome Completo / Trader Tag</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type="text"
                      required
                      placeholder="Dilson Jr."
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type="email"
                      required
                      placeholder="trader@tradeai.org"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-medium">Senha (mínimo 8 caracteres)</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="••••••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="pl-9 pr-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showRegPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-medium">Confirmar Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••••••"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Proteção 2FA TOTP RFC 6238 habilitada automaticamente por padrão.</span>
                </div>

                <Button
                  type="submit"
                  disabled={isRegistering}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold h-10 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  {isRegistering ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Criando conta segura...</span>
                    </div>
                  ) : (
                    'Criar Conta Institucional'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
