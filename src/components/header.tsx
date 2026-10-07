"use client";

import { useCryptoStore } from "@/lib/store";
import { Activity, Wifi, WifiOff, Loader2, Moon, Sun, Settings, Trash2, RefreshCw, Power, Wallet, KeyRound, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useSyncExternalStore, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CryptoSelector } from "./header/crypto-selector";
import { ApiSettingsDialog } from "./header/api-settings-dialog";
import { AiSettingsDialog } from "./header/ai-settings-dialog";
import { useToast } from "@/hooks/use-toast";
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
    bots,
    connectionStatus,
    clearMockData,
    clearSimulatedData,
    binanceTestnet,
    setAccount,
    setTrades,
    portfolio,
    setActiveSection,
  } = useCryptoStore(
  useShallow((s) => ({ tradingMode: s.tradingMode, setTradingMode: s.setTradingMode, botActive: s.botActive, bots: s.bots, connectionStatus: s.connectionStatus, clearMockData: s.clearMockData, clearSimulatedData: s.clearSimulatedData, binanceTestnet: s.binanceTestnet, setAccount: s.setAccount, setTrades: s.setTrades, portfolio: s.portfolio, setActiveSection: s.setActiveSection }))
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
  const [aiInfo, setAiInfo] = useState<{ provider: string; model: string; configured: boolean } | null>(null);

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

  const isRealMoney = tradingMode === "live" && !binanceTestnet;
  const modeLabel = tradingMode === "live" ? (binanceTestnet ? "TESTNET" : "REAL") : "SIMULADO";

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
      <div className="h-13 flex items-center justify-between px-3 md:px-5 bg-[#090d14]/90 backdrop-blur-2xl border-b border-white/[0.07] relative">
        {/* Left: Logo + Crypto Selector + Live Active Pair Stats */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          {/* Mobile: compact logo */}
          <div className="md:hidden w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white font-extrabold text-[10px] tracking-wider font-mono">AI</span>
          </div>

          {/* Crypto Selector */}
          <CryptoSelector />

          {/* Desktop Live Active Pair Statistics (TradingView / Binance Pro style) */}
          {(() => {
            const state = useCryptoStore.getState();
            const symbol = state.selectedSymbol;
            const ticker = state.tickers[symbol];
            if (!ticker) return null;
            const isPos = ticker.priceChangePercent >= 0;

            return (
              <div className="hidden xl:flex items-center gap-4 pl-3.5 border-l border-white/[0.07] text-xs tabular-nums">
                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] text-slate-400 uppercase font-medium tracking-wider">Último Preço</span>
                  <span className={cn("font-mono font-bold text-sm", isPos ? "text-emerald-400" : "text-rose-400")}>
                    ${formatPrice(ticker.price)}
                  </span>
                </div>

                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] text-slate-400 uppercase font-medium tracking-wider">Variação 24h</span>
                  <span className={cn("font-mono font-semibold flex items-center gap-0.5", isPos ? "text-emerald-400" : "text-rose-400")}>
                    {isPos ? "+" : ""}{ticker.priceChangePercent.toFixed(2)}%
                  </span>
                </div>

                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] text-slate-400 uppercase font-medium tracking-wider">Máx 24h</span>
                  <span className="font-mono text-slate-300 font-medium">
                    ${formatPrice(ticker.high)}
                  </span>
                </div>

                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] text-slate-400 uppercase font-medium tracking-wider">Mín 24h</span>
                  <span className="font-mono text-slate-300 font-medium">
                    ${formatPrice(ticker.low)}
                  </span>
                </div>

                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] text-slate-400 uppercase font-medium tracking-wider">Volume 24h</span>
                  <span className="font-mono text-slate-300 font-medium">
                    ${(ticker.quoteVolume / 1000000).toFixed(2)}M
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Center/Right: Trading Mode + Balance + Controls */}
        <div className="flex items-center gap-2">
          {/* Quick Balance & PnL display */}
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] backdrop-blur-md shadow-sm">
            <Wallet className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Saldo Conta</span>
              <span className="text-xs font-bold font-mono text-slate-100 tabular-nums">
                ${portfolio?.totalValue !== undefined ? formatPrice(portfolio.totalValue) : "0.00"}
              </span>
            </div>
            {portfolio?.pnlPercent !== undefined && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] font-mono px-1.5 py-0 h-4 border-none rounded-md",
                  portfolio.pnlPercent >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                )}
              >
                {portfolio.pnlPercent >= 0 ? "+" : ""}{portfolio.pnlPercent.toFixed(1)}%
              </Badge>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7.5 gap-1.5 px-2.5 bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06] font-medium cursor-pointer shadow-sm select-none rounded-lg"
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    isRealMoney ? "bg-rose-500 shadow-[0_0_6px_#f43f5e]" : tradingMode === "live" ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" : "bg-cyan-400 shadow-[0_0_6px_#06b6d4]"
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-[11px] font-bold tracking-wider",
                    isRealMoney ? "text-rose-400" : tradingMode === "live" ? "text-amber-400" : "text-cyan-400"
                  )}
                >
                  {modeLabel}
                </span>
                <span className="hidden sm:inline text-[10px] text-slate-400 font-medium">
                  {isRealMoney ? "Binance Spot" : tradingMode === "live" ? "Testnet" : "Sandbox"}
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
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Binance API Configuration Dialog */}
          {mounted && (
            <ApiSettingsDialog
              open={apiDialogOpen}
              onOpenChange={setApiDialogOpen}
            />
          )}

          {/* Sincronizar Button */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 hover:bg-crypto-cyan/10 text-muted-foreground hover:text-crypto-cyan transition-colors duration-200"
              onClick={handleSync}
              disabled={isSyncing}
              aria-label="Sincronizar saldo da carteira"
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-crypto-cyan" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span className="text-[10px] font-medium hidden md:inline">Sincronizar</span>
            </Button>
          )}

          {/* Theme Toggle - desktop only */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:flex h-8 w-8 p-0 hover:bg-secondary/80 transition-transform duration-300"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
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
              className="h-8 gap-1.5 px-2 hover:bg-purple-500/10 text-muted-foreground hover:text-purple-300 transition-colors cursor-pointer"
              title={
                aiInfo
                  ? `Motor IA: ${aiInfo.provider.toUpperCase()} (${aiInfo.configured ? "Chave configurada" : "Sem chave"})`
                  : "Configurações de IA"
              }
            >
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] font-semibold hidden lg:inline capitalize">
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

          {mounted && <AiSettingsDialog open={aiDialogOpen} onOpenChange={setAiDialogOpen} />}

          {/* System Settings Dropdown */}
          {mounted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer"
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

          {/* Bot active badge - smaller on mobile */}
          {(() => {
            const count = bots ? bots.filter((b) => b.active).length : (botActive ? 1 : 0);
            if (count === 0) return null;
            return (
              <Badge
                onClick={() => setActiveSection("bot")}
                className="bg-crypto-green/15 text-crypto-green border-crypto-green/30 hover:bg-crypto-green/25 text-[10px] md:text-xs glow-green-sm px-1.5 md:px-2.5 py-0.5 cursor-pointer transition-all hover:scale-105 select-none"
                title="Abrir Central de Robôs de Lucro"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-crypto-green mr-1 pulse-soft" />
                <span className="hidden md:inline">{count} {count === 1 ? "Bot Ativo" : "Bots Ativos"}</span>
                <span className="md:hidden">{count} {count === 1 ? "Bot" : "Bots"}</span>
              </Badge>
            );
          })()}

          {/* Connection status - icon only on mobile */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 hover:bg-secondary/80"
            aria-label={`Connection status: ${connectionStatus}`}
          >
            {connectionStatus === "connected" && (
              <>
                <div className="relative flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-crypto-green" />
                  <div className="absolute w-2 h-2 rounded-full bg-crypto-green animate-ping opacity-60" />
                </div>
                <span className="hidden md:inline text-xs text-crypto-green font-medium">
                  Ao Vivo
                </span>
              </>
            )}
            {connectionStatus === "rest-api" && (
              <>
                <div className="relative flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-crypto-cyan" />
                  <div className="absolute w-2 h-2 rounded-full bg-crypto-cyan animate-ping opacity-50" />
                </div>
                <span className="hidden md:inline text-xs text-crypto-cyan font-medium">
                  REST API
                </span>
              </>
            )}
            {connectionStatus === "disconnected" && (
              <>
                <WifiOff className="w-4 h-4 text-crypto-red" />
                <span className="hidden md:inline text-xs text-crypto-red font-medium">
                  Desconectado
                </span>
              </>
            )}
            {connectionStatus === "connecting" && (
              <>
                <Loader2 className="w-4 h-4 text-crypto-gold animate-spin" />
                <span className="hidden md:inline text-xs text-crypto-gold font-medium">
                  Conectando...
                </span>
              </>
            )}
          </Button>

          {/* Mobile: Settings gear button to open drawer */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden h-8 w-8 p-0 hover:bg-secondary/80 transition-transform duration-200"
            onClick={onOpenMobileDrawer}
            aria-label="Abrir configurações"
          >
            <motion.div whileTap={{ scale: 0.85 }}>
              <Settings className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          </Button>
        </div>
      </div>

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
