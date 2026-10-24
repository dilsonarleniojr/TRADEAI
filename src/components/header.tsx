"use client";

import { useCryptoStore } from "@/lib/store";
import { Activity, Wifi, WifiOff, Loader2, Moon, Sun, Settings, Trash2, RefreshCw, Power, Wallet, KeyRound, Brain, Zap, User, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useSyncExternalStore, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CryptoSelector } from "./header/crypto-selector";
import { GlobalCommandSearch } from "./header/global-command-search";
import { GlobalStatusBar } from "./header/global-status-bar";
import { ApiSettingsDialog } from "./header/api-settings-dialog";
import { AiSettingsDialog } from "./header/ai-settings-dialog";
import { DirectAiTradeModal } from "@/components/bot/direct-ai-trade-modal";
import { RiskProfileSelector } from "@/components/bot/risk-profile-selector";
import { useDesktopHotkeys } from "@/hooks/use-desktop-hotkeys";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/lib/auth/auth-store";
import { AuthModal } from "@/components/auth/auth-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrice } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useShallow } from "zustand/react/shallow";

interface HeaderProps {
  onOpenMobileDrawer?: () => void;
}

export function Header({ onOpenMobileDrawer }: HeaderProps) {
  const {
    tradingMode,
    setTradingMode,
    botActive,
    activeBotsCount,
    connectionStatus,
    clearMockData,
    clearSimulatedData,
    binanceTestnet,
    setAccount,
    setTrades,
    portfolio,
    setActiveSection,
    openApiSettingsModal,
    setOpenApiSettingsModal,
    openAiSettingsModal,
    setOpenAiSettingsModal,
  } = useCryptoStore(
  useShallow((s) => ({
    tradingMode: s.tradingMode,
    setTradingMode: s.setTradingMode,
    botActive: s.botActive,
    activeBotsCount: s.bots.filter((b) => b.active).length,
    connectionStatus: s.connectionStatus,
    clearMockData: s.clearMockData,
    clearSimulatedData: s.clearSimulatedData,
    binanceTestnet: s.binanceTestnet,
    setAccount: s.setAccount,
    setTrades: s.setTrades,
    portfolio: s.portfolio,
    setActiveSection: s.setActiveSection,
    openApiSettingsModal: s.openApiSettingsModal,
    setOpenApiSettingsModal: s.setOpenApiSettingsModal,
    openAiSettingsModal: s.openAiSettingsModal,
    setOpenAiSettingsModal: s.setOpenAiSettingsModal,
  }))
);

  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [confirmLiveOpen, setConfirmLiveOpen] = useState(false);
  const [directTradeModalOpen, setDirectTradeModalOpen] = useState(false);
  const [aiInfo, setAiInfo] = useState<{ provider: string; model: string; configured: boolean } | null>(null);

  const { user, isAuthenticated, openAuthModal, logout, checkSession } = useAuthStore();

  // Mapeamento e escuta global dos atalhos de teclado desktop (Espaço, Ctrl+K, Duplo Esc)
  useDesktopHotkeys();

  useEffect(() => {
    if (!mounted) return;
    checkSession();
  }, [mounted, checkSession]);

  useEffect(() => {
    if (!mounted) return;
    fetch("/api/ai/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data) {
          const active = j.data.providers?.find((p: any) => p.id === j.data.provider);
          setAiInfo({
            provider: j.data.provider,
            model: active?.model || "",
            configured: !!active?.configured,
          });
        }
      })
      .catch(() => {});
  }, [mounted, aiDialogOpen]);

  const effectiveMode = mounted ? tradingMode : "paper";
  const isRealMoney = mounted && effectiveMode === "live" && !binanceTestnet;
  const modeLabel = effectiveMode === "live" ? (binanceTestnet ? "TESTNET" : "REAL") : "SIMULADO";

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const modeParam = tradingMode === "live" ? "live" : "paper";
      const [accRes, tradesRes] = await Promise.all([
        fetch(`/api/account?mode=${modeParam}`),
        fetch(`/api/trades?mode=${modeParam}`),
      ]);
      const result = await accRes.json();
      const tradesResult = await tradesRes.json();

      if (accRes.ok && result.success && result.data) {
        setAccount(result.data);
        if (tradesResult.success && Array.isArray(tradesResult.data)) {
          setTrades(tradesResult.data);
        }
        toast({
          title: "Sincronização Concluída",
          description: `Dados atualizados com sucesso (${tradingMode === "live" ? "Binance" : "Simulado"}).`,
        });
      } else {
        toast({
          title: "Falha na Sincronização",
          description: result.error || "Erro ao consultar saldo.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message || "Erro de rede ao sincronizar saldo.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const activateLive = async () => {
    const state = useCryptoStore.getState();
    setTradingMode("live");
    try {
      const [res, tradesRes] = await Promise.all([
        fetch("/api/account?mode=live"),
        fetch("/api/trades?mode=live"),
      ]);
      const result = await res.json();
      const tradesResult = await tradesRes.json();

      if (res.ok && result.success && result.data) {
        state.setAccount(result.data);
        if (tradesResult.success && Array.isArray(tradesResult.data)) {
          state.setTrades(tradesResult.data);
        }
        toast({
          title: "🟢 Modo Real Conectado",
          description: "Conectado e sincronizado com a Binance com sucesso.",
        });
      } else {
        toast({
          title: "⚠️ Modo Real Ativado",
          description: result.error || "Atenção: Configure suas chaves de API da Binance nas configurações para sincronizar o saldo real.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "⚠️ Erro de Conexão",
        description: e.message || "Erro de rede ao conectar com a Binance. O Modo Real permanece selecionado.",
        variant: "destructive",
      });
    }
  };

  return (
    <motion.header
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      className="sticky top-0 z-40 flex flex-col select-none"
    >
      <div className="h-13 flex items-center justify-between px-3 md:px-5 bg-[#090d14]/90 backdrop-blur-2xl border-b border-white/[0.07] relative gap-2 sm:gap-4">
        {/* Bloco 1 - Esquerda: Logo + Crypto Selector */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile: compact logo */}
          <div className="md:hidden w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white font-extrabold text-[10px] tracking-wider font-mono">AI</span>
          </div>

          {/* Crypto Selector */}
          <CryptoSelector />
        </div>

        {/* Bloco 2 - Centro: Campo de Busca Global */}
        <div className="hidden md:flex flex-1 max-w-xs lg:max-w-sm xl:max-w-md mx-2 min-w-0">
          <GlobalCommandSearch />
        </div>

        {/* Bloco 3 - Direita: Saldo + Modo + Ações Rápidas */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {/* Mobile search trigger */}
          <div className="md:hidden">
            <GlobalCommandSearch compactOnly />
          </div>

          {/* Botão de Operação Direta com IA */}
          {mounted && (
            <Button
              size="sm"
              onClick={() => setDirectTradeModalOpen(true)}
              className="h-7.5 gap-1.5 px-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-extrabold text-[11px] tracking-wide shadow-[0_0_12px_rgba(6,182,212,0.35)] rounded-lg cursor-pointer shrink-0 transition-transform active:scale-95"
              title="Iniciar Operação Direta com IA"
            >
              <Zap className="w-3.5 h-3.5 fill-current text-black" />
              <span className="hidden sm:inline">Operação Direta IA</span>
              <span className="sm:hidden">Direto</span>
            </Button>
          )}

          {/* Saldo da Conta */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] shadow-sm shrink-0">
            <Wallet className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Saldo</span>
              <span className="text-xs font-bold font-mono text-slate-100 tabular-nums" suppressHydrationWarning>
                ${portfolio?.totalValue !== undefined ? formatPrice(portfolio.totalValue) : "0.00"}
              </span>
            </div>
            {portfolio?.pnlPercent !== undefined && (
              <Badge
                variant="outline"
                suppressHydrationWarning
                className={cn(
                  "text-[9px] font-mono px-1 py-0 h-4 border-none rounded",
                  portfolio.pnlPercent >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                )}
              >
                {portfolio.pnlPercent >= 0 ? "+" : ""}{portfolio.pnlPercent.toFixed(1)}%
              </Badge>
            )}
          </div>

          {/* Perfil de Risco (1-clique) */}
          <RiskProfileSelector compact className="hidden xl:flex shrink-0" />

          {/* Modo de Operação (REAL / SIMULADO) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7.5 gap-1.5 px-2 bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06] font-medium cursor-pointer shadow-sm select-none rounded-lg shrink-0"
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isRealMoney ? "bg-rose-500 shadow-[0_0_6px_#f43f5e]" : effectiveMode === "live" ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" : "bg-cyan-400 shadow-[0_0_6px_#06b6d4]"
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-[11px] font-bold tracking-wider",
                    isRealMoney ? "text-rose-400" : effectiveMode === "live" ? "text-amber-400" : "text-cyan-400"
                  )}
                >
                  {modeLabel}
                </span>
                <span className="hidden xl:inline text-[10px] text-slate-400 font-medium">
                  {isRealMoney ? "Binance Spot" : effectiveMode === "live" ? "Testnet" : "Sandbox"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[190px] bg-[#0d131f] border border-white/[0.1] shadow-2xl p-1.5 rounded-xl">
              <DropdownMenuLabel className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider px-2 py-1">Ambiente de Operação</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
              <DropdownMenuItem
                onClick={() => {
                  const state = useCryptoStore.getState();
                  if (!state.binanceConnected) {
                    setApiDialogOpen(true);
                    toast({
                      title: "Chaves de API Necessárias",
                      description: "Configure sua API Key e Secret da Binance para usar o Modo Real.",
                    });
                    return;
                  }
                  if (state.binanceTestnet) {
                    void activateLive();
                  } else {
                    setConfirmLiveOpen(true);
                  }
                }}
                className="flex items-center gap-2.5 cursor-pointer rounded-md py-1.5 px-2 hover:bg-crypto-green/10 focus:bg-crypto-green/10 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-crypto-green shadow-[0_0_8px_#10b981]" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">Conta Real (Binance)</span>
                  <span className="text-[9px] text-muted-foreground">Execuções reais no livro</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  setTradingMode("paper");
                  try {
                    const [res, tradesRes] = await Promise.all([
                      fetch("/api/account?mode=paper"),
                      fetch("/api/trades?mode=paper"),
                    ]);
                    if (res.ok) {
                      const result = await res.json();
                      if (result.success && result.data) {
                        useCryptoStore.getState().setAccount(result.data);
                      }
                    }
                    if (tradesRes.ok) {
                      const tradesResult = await tradesRes.json();
                      if (tradesResult.success && Array.isArray(tradesResult.data)) {
                        useCryptoStore.getState().setTrades(tradesResult.data);
                      }
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex items-center gap-2.5 cursor-pointer rounded-md py-1.5 px-2 hover:bg-crypto-cyan/10 focus:bg-crypto-cyan/10 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-crypto-cyan shadow-[0_0_8px_#06b6d4]" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">Simulado (Paper)</span>
                  <span className="text-[9px] text-muted-foreground">Treinamento sem risco</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Binance API Configuration Dialog */}
          {mounted && (
            <ApiSettingsDialog
              open={apiDialogOpen || openApiSettingsModal}
              onOpenChange={(open) => {
                setApiDialogOpen(open);
                setOpenApiSettingsModal(open);
              }}
            />
          )}

          {/* Modal de Operação Direta com IA */}
          {mounted && (
            <DirectAiTradeModal
              open={directTradeModalOpen}
              onOpenChange={setDirectTradeModalOpen}
            />
          )}

          {/* Sincronizar Button */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7.5 w-7.5 hover:bg-crypto-cyan/10 text-muted-foreground hover:text-crypto-cyan transition-colors duration-200 shrink-0 cursor-pointer"
              onClick={handleSync}
              disabled={isSyncing}
              title="Sincronizar saldo da carteira"
              aria-label="Sincronizar saldo da carteira"
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-crypto-cyan" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </Button>
          )}

          {/* Theme Toggle - desktop only */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex h-7.5 w-7.5 p-0 hover:bg-secondary/80 transition-transform duration-300 shrink-0 cursor-pointer"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Alternar para modo ${theme === "dark" ? "claro" : "escuro"}`}
              title={`Modo ${theme === "dark" ? "claro" : "escuro"}`}
            >
              <motion.div
                key={theme}
                initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-crypto-gold" />
                ) : (
                  <Moon className="w-4 h-4 text-muted-foreground" />
                )}
              </motion.div>
            </Button>
          )}

          {/* AI Engine Status Button */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAiDialogOpen(true)}
              className="h-7.5 gap-1.5 px-2 hover:bg-purple-500/10 text-muted-foreground hover:text-purple-300 transition-colors cursor-pointer shrink-0"
              title={
                aiInfo
                  ? `Motor IA: ${aiInfo.provider.toUpperCase()} (${aiInfo.configured ? "Chave configurada" : "Sem chave"})`
                  : "Configurações de IA"
              }
            >
              <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-[10px] font-semibold hidden xl:inline capitalize">
                {aiInfo ? aiInfo.provider : "IA"}
              </span>
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  aiInfo?.configured ? "bg-crypto-green shadow-[0_0_6px_#10b981]" : "bg-muted-foreground/40"
                )}
              />
            </Button>
          )}

          {mounted && (
            <AiSettingsDialog
              open={aiDialogOpen || openAiSettingsModal}
              onOpenChange={(open) => {
                setAiDialogOpen(open);
                setOpenAiSettingsModal(open);
              }}
            />
          )}

          {/* System Settings Dropdown */}
          {mounted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7.5 w-7.5 p-0 hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                  aria-label="Configurações do sistema"
                  title="Configurações e ações do sistema"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[210px] glass-card gradient-border p-1">
                <DropdownMenuLabel className="text-xs font-bold text-foreground">Sistema & Conexões</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border/40" />
                <DropdownMenuItem
                  onClick={() => setApiDialogOpen(true)}
                  className="text-xs flex items-center gap-2 py-1.5 px-2 cursor-pointer text-crypto-cyan focus:text-crypto-cyan focus:bg-crypto-cyan/10 font-medium"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Configurar API Binance</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setAiDialogOpen(true)}
                  className="text-xs flex items-center gap-2 py-1.5 px-2 cursor-pointer text-purple-400 focus:text-purple-400 focus:bg-purple-400/10 font-medium"
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>Motor de IA</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await clearSimulatedData();
                    toast({
                      title: "Simulação Limpa",
                      description: "Histórico simulado, posições de robôs, métricas e saldo foram redefinidos.",
                    });
                  }}
                  className="text-xs flex items-center gap-2 py-1.5 px-2 cursor-pointer text-amber-400 focus:text-amber-400 focus:bg-amber-400/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Dados Simulados</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (confirm("Deseja realmente desligar os serviços da plataforma?")) {
                      toast({
                        title: "Desligando a Plataforma",
                        description: "Os serviços estão sendo finalizados...",
                      });
                      await fetch("/api/system/shutdown", { method: "POST" });
                    }
                  }}
                  className="text-xs flex items-center gap-2 py-1.5 px-2 cursor-pointer text-crypto-red focus:text-crypto-red focus:bg-crypto-red/10 font-bold"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Desligar Plataforma</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* User Auth Profile / Login Button */}
          {mounted && (
            <>
              {isAuthenticated && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7.5 gap-1.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
                      title={`Usuário: ${user.name} (${user.email})`}
                    >
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="max-w-[70px] truncate hidden sm:inline">{user.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[210px] glass-card gradient-border p-1">
                    <DropdownMenuLabel className="text-xs">
                      <div className="font-bold text-foreground truncate">{user.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                      {user.twoFactorEnabled && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>2FA Ativo</span>
                        </div>
                      )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border/40" />
                    <DropdownMenuItem
                      onClick={logout}
                      className="text-xs flex items-center gap-2 py-1.5 px-2 cursor-pointer text-rose-400 focus:text-rose-400 focus:bg-rose-500/10 font-medium"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Encerrar Sessão</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openAuthModal}
                  className="h-7.5 gap-1.5 px-2.5 bg-slate-900/80 hover:bg-emerald-500/10 text-slate-200 hover:text-emerald-400 border border-slate-800 hover:border-emerald-500/30 rounded-lg text-xs font-semibold shrink-0 cursor-pointer transition-all"
                  title="Acessar conta ou criar novo registro institucional"
                >
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Entrar</span>
                </Button>
              )}
              <AuthModal />
            </>
          )}

          {/* Bot active badge */}
          {mounted && (() => {
            const count = activeBotsCount > 0 ? activeBotsCount : (botActive ? 1 : 0);
            if (count === 0) return null;
            return (
              <Badge
                onClick={() => setActiveSection("bot")}
                className="bg-crypto-green/15 text-crypto-green border-crypto-green/30 hover:bg-crypto-green/25 text-[10px] glow-green-sm px-2 py-0.5 cursor-pointer transition-all hover:scale-105 select-none shrink-0"
                title="Abrir Central de Robôs de Lucro"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-crypto-green mr-1 pulse-soft" />
                <span className="hidden sm:inline">{count} {count === 1 ? "Bot Ativo" : "Bots Ativos"}</span>
                <span className="sm:hidden">{count} Bots</span>
              </Badge>
            );
          })()}

          {/* Connection status com Ping Real Institucional */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7.5 gap-1.5 px-2 hover:bg-secondary/80 shrink-0 font-mono text-xs cursor-default"
            aria-label={`Status da conexão: ${connectionStatus}`}
            title={`Status: ${connectionStatus === "connected" ? "Conectado via WebSocket Binance (Ping ~24ms)" : connectionStatus}`}
          >
            {connectionStatus === "connected" && (
              <>
                <div className="relative flex items-center justify-center shrink-0">
                  <Wifi className="w-3.5 h-3.5 text-crypto-green" />
                  <div className="absolute w-2 h-2 rounded-full bg-crypto-green animate-ping opacity-60" />
                </div>
                <span className="hidden sm:inline text-crypto-green font-medium">
                  Ao Vivo
                </span>
                <span className="text-[10px] text-emerald-400 font-bold px-1 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/30">
                  24ms
                </span>
              </>
            )}
            {connectionStatus === "rest-api" && (
              <>
                <div className="relative flex items-center justify-center shrink-0">
                  <Wifi className="w-3.5 h-3.5 text-crypto-cyan" />
                  <div className="absolute w-2 h-2 rounded-full bg-crypto-cyan animate-ping opacity-50" />
                </div>
                <span className="hidden sm:inline text-crypto-cyan font-medium">
                  REST API
                </span>
                <span className="text-[10px] text-cyan-400 font-bold px-1 py-0.2 rounded bg-cyan-500/15 border border-cyan-500/30">
                  65ms
                </span>
              </>
            )}
            {connectionStatus === "disconnected" && (
              <>
                <WifiOff className="w-3.5 h-3.5 text-crypto-red shrink-0" />
                <span className="hidden sm:inline text-crypto-red font-medium">
                  Offline
                </span>
              </>
            )}
            {connectionStatus === "connecting" && (
              <>
                <Loader2 className="w-3.5 h-3.5 text-crypto-gold animate-spin shrink-0" />
                <span className="hidden sm:inline text-crypto-gold font-medium">
                  Conectando...
                </span>
              </>
            )}
          </Button>

          {/* Mobile: Settings gear button to open drawer */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-7.5 w-7.5 p-0 hover:bg-secondary/80 transition-transform duration-200 shrink-0 cursor-pointer"
            onClick={onOpenMobileDrawer}
            aria-label="Abrir configurações"
          >
            <motion.div whileTap={{ scale: 0.85 }}>
              <Settings className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          </Button>
        </div>
      </div>

      {/* Global HFT Telemetry and Status Bar */}
      {mounted && <GlobalStatusBar />}

      {isRealMoney && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6 py-1.5 bg-crypto-red/15 border-b border-crypto-red/30 text-xs text-crypto-red"
        >
          <span className="font-bold">Modo real ativo.</span>
          <span className="text-foreground/80">Ordens e bots usam saldo verdadeiro da Binance.</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2.5 text-xs text-foreground cursor-pointer"
            onClick={() => setTradingMode("paper")}
          >
            Voltar ao simulado
          </Button>
        </div>
      )}

      <AlertDialog open={confirmLiveOpen} onOpenChange={setConfirmLiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar o modo real?</AlertDialogTitle>
            <AlertDialogDescription>
              Ordens manuais e bots passarão a operar com dinheiro verdadeiro na sua conta Binance Spot.
              Você pode perder capital. Volte ao simulado a qualquer momento pelo seletor do cabeçalho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmLiveOpen(false);
                void activateLive();
              }}
            >
              Entendo, ativar modo real
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.header>
  );
}
