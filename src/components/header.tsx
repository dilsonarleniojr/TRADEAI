"use client";

import { useCryptoStore } from "@/lib/store";
import { Activity, Wifi, WifiOff, Loader2, Moon, Sun, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { CryptoSelector } from "./header/crypto-selector";

interface HeaderProps {
  onOpenMobileDrawer?: () => void;
}

export function Header({ onOpenMobileDrawer }: HeaderProps) {
  const {
    tradingMode,
    setTradingMode,
    botActive,
    connectionStatus,
  } = useCryptoStore();

  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

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

        {/* Center: Trading Mode Toggle (desktop only) */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-1.5 border border-border/50">
            <span
              className={`text-xs font-medium transition-colors ${
                tradingMode === "paper"
                  ? "text-crypto-cyan"
                  : "text-muted-foreground"
              }`}
            >
              Simulado
            </span>
            <Switch
              checked={tradingMode === "live"}
              onCheckedChange={(checked) =>
                setTradingMode(checked ? "live" : "paper")
              }
              className="data-[state=checked]:bg-crypto-red data-[state=unchecked]:bg-crypto-cyan"
            />
            <span
              className={`text-xs font-medium transition-colors ${
                tradingMode === "live"
                  ? "text-crypto-red"
                  : "text-muted-foreground"
              }`}
            >
              Real
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5 md:gap-2">
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

          {/* Bot active badge - smaller on mobile */}
          {botActive && (
            <Badge className="bg-crypto-green/15 text-crypto-green border-crypto-green/30 hover:bg-crypto-green/20 text-[10px] md:text-xs glow-green-sm px-1.5 md:px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-crypto-green mr-1 pulse-soft" />
              <span className="hidden md:inline">Bot Ativo</span>
              <span className="md:hidden">Bot</span>
            </Badge>
          )}

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
