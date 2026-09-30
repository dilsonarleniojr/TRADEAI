"use client";

import { useCryptoStore } from "@/lib/store";
import { Activity, Wifi, WifiOff, Loader2, Moon, Sun, Settings, Trash2, RefreshCw, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useSyncExternalStore, useState } from "react";
import { CryptoSelector } from "./header/crypto-selector";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    binanceApiKey,
    binanceApiSecret,
    binanceTestnet,
    setAccount,
  } = useCryptoStore();

  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/account?mode=${tradingMode}`, {
        headers: {
          'x-binance-api-key': binanceApiKey || '',
          'x-binance-api-secret': binanceApiSecret || '',
          'x-binance-testnet': binanceTestnet ? 'true' : 'false'
        }
      });
      const result = await res.json();
      if (res.ok && result.success && result.data) {
        setAccount(result.data);
        toast({
          title: "Sincronização Concluída",
          description: `Saldo atualizado com sucesso (${tradingMode === "live" ? "Binance" : "Simulado"}).`,
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

  return (
    <motion.header
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      className="sticky top-0 z-40 flex flex-col"
    >
      <div className="h-14 flex items-center justify-between px-4 md:px-6 glass relative backdrop-blur-xl">
        {/* Gradient border bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/50 to-transparent" />

        {/* Left: Logo + Title */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile: compact logo */}
          <div className="md:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-crypto-cyan to-crypto-green flex items-center justify-center shadow-[0_0_12px_oklch(0.75_0.15_195/20%)] pulse-glow">
            <span className="text-white font-bold text-xs">IA</span>
          </div>

          {/* Desktop: full logo */}
          <div className="hidden md:flex items-center gap-2">
            <Activity className="w-5 h-5 text-crypto-cyan icon-breathe rounded-lg p-0.5" />
            <h1 className="text-base font-semibold tracking-tight shimmer-text">
              Crypto IA Pro
            </h1>
          </div>

          {/* Crypto Selector - visible on both mobile and desktop */}
          <CryptoSelector />
        </div>

        {/* Center: Trading Mode Dropdown Selector */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2 bg-secondary/40 border-border/50 hover:bg-secondary/60 font-medium cursor-pointer shadow-sm select-none"
              >
                {tradingMode === "live" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-pulse" />
                    <span className="text-[11px] font-bold text-crypto-green flex items-center gap-1">
                      <span>🟢</span> Real (Binance)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-crypto-cyan animate-pulse" />
                    <span className="text-[11px] font-bold text-crypto-cyan flex items-center gap-1">
                      <span>🔵</span> Simulado
                    </span>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-[170px] glass-card gradient-border p-1">
              <DropdownMenuItem
                onClick={async () => {
                  setTradingMode("live");
                  try {
                    const state = useCryptoStore.getState();
                    const res = await fetch("/api/account?mode=live", {
                      headers: {
                        'x-binance-api-key': state.binanceApiKey || '',
                        'x-binance-api-secret': state.binanceApiSecret || '',
                        'x-binance-testnet': state.binanceTestnet ? 'true' : 'false'
                      }
                    });
                    const result = await res.json();
                    if (res.ok && result.success && result.data) {
                      state.setAccount(result.data);
                      toast({
                        title: "🟢 Modo Real Conectado",
                        description: "Conectado e sincronizado com a Binance com sucesso.",
                      });
                    } else {
                      setTradingMode("paper");
                      toast({
                        title: "🔴 Falha ao Conectar",
                        description: result.error || "Chaves de API inválidas ou sem permissão de acesso.",
                        variant: "destructive",
                      });
                    }
                  } catch (e: any) {
                    setTradingMode("paper");
                    toast({
                      title: "🔴 Erro de Sincronização",
                      description: e.message || "Erro desconhecido ao conectar com a Binance.",
                      variant: "destructive",
                    });
                  }
                }}
                className="flex items-center gap-2.5 cursor-pointer rounded-md py-1.5 px-2 hover:bg-crypto-green/10 focus:bg-crypto-green/10 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-crypto-green shadow-[0_0_8px_#10b981]" />
                <span className="text-xs font-semibold text-foreground">🟢 Real (Binance)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  setTradingMode("paper");
                  try {
                    const res = await fetch("/api/account?mode=paper");
                    if (res.ok) {
                      const result = await res.json();
                      if (result.success && result.data) {
                        useCryptoStore.getState().setAccount(result.data);
                      }
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex items-center gap-2.5 cursor-pointer rounded-md py-1.5 px-2 hover:bg-crypto-cyan/10 focus:bg-crypto-cyan/10 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-crypto-cyan shadow-[0_0_8px_#06b6d4]" />
                <span className="text-xs font-semibold text-foreground">🔵 Simulado</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5 md:gap-2">
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

          {/* Clear Mock Data Button - available on both mobile and desktop */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 hover:bg-crypto-red/10 text-muted-foreground hover:text-crypto-red transition-colors duration-200"
              onClick={() => {
                clearMockData();
                // Also clear server-side trades
                fetch("/api/trades", { method: "DELETE" }).catch(() => {});
              }}
              aria-label="Limpar dados simulados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium hidden md:inline">Limpar Dados</span>
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

          {/* Shutdown Button */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 hover:bg-red-500/15 text-muted-foreground hover:text-red-500 transition-colors duration-200"
              onClick={async () => {
                try {
                  toast({
                    title: "Desligando a Plataforma",
                    description: "Os serviços estão sendo finalizados...",
                  });
                  await fetch("/api/system/shutdown", { method: "POST" });
                } catch (e) {
                  console.error("Shutdown erro:", e);
                }
              }}
              aria-label="Desligar plataforma"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium hidden md:inline">Desligar</span>
            </Button>
          )}

          {/* Bot active badge - smaller on mobile */}
          {(() => {
            const count = bots ? bots.filter((b) => b.active).length : (botActive ? 1 : 0);
            if (count === 0) return null;
            return (
              <Badge className="bg-crypto-green/15 text-crypto-green border-crypto-green/30 hover:bg-crypto-green/20 text-[10px] md:text-xs glow-green-sm px-1.5 md:px-2.5 py-0.5">
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
    </motion.header>
  );
}
