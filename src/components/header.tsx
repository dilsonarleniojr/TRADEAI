"use client";

import { useCryptoStore } from "@/lib/store";
import { Activity, Wifi, WifiOff, Loader2, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";

export function Header() {
  const {
    tradingMode,
    setTradingMode,
    selectedSymbol,
    botActive,
    connectionStatus,
  } = useCryptoStore();

  const { theme, setTheme } = useTheme();
  // Use useSyncExternalStore to avoid hydration mismatch without calling setState in effect
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
      <div className="h-14 flex items-center justify-between px-4 md:px-6 bg-card/80 backdrop-blur-md border-b border-border">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          <div className="md:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-crypto-cyan to-crypto-green flex items-center justify-center">
            <span className="text-white font-bold text-xs">IA</span>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Activity className="w-5 h-5 text-crypto-cyan" />
            <h1 className="text-base font-semibold tracking-tight">
              Crypto IA Pro
            </h1>
          </div>
          <Badge
            variant="outline"
            className="hidden sm:flex items-center gap-1 text-xs border-border"
          >
            <span className="text-crypto-cyan font-medium">{selectedSymbol}</span>
          </Badge>
        </div>

        {/* Center: Trading Mode Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-1.5">
            <span
              className={`text-xs font-medium transition-colors ${
                tradingMode === "paper"
                  ? "text-crypto-cyan"
                  : "text-muted-foreground"
              }`}
            >
              Paper
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
              Live
            </span>
          </div>
        </div>

        {/* Right: Connection + Theme + Bot Status */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-crypto-gold" />
              ) : (
                <Moon className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          )}

          {botActive && (
            <Badge className="bg-crypto-green/15 text-crypto-green border-crypto-green/30 hover:bg-crypto-green/20 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-crypto-green mr-1.5 animate-pulse" />
              Bot Active
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2"
            aria-label={`Connection status: ${connectionStatus}`}
          >
            {connectionStatus === "connected" && (
              <>
                <Wifi className="w-4 h-4 text-crypto-green" />
                <span className="hidden sm:inline text-xs text-crypto-green font-medium">
                  Connected
                </span>
              </>
            )}
            {connectionStatus === "disconnected" && (
              <>
                <WifiOff className="w-4 h-4 text-crypto-red" />
                <span className="hidden sm:inline text-xs text-crypto-red font-medium">
                  Disconnected
                </span>
              </>
            )}
            {connectionStatus === "connecting" && (
              <>
                <Loader2 className="w-4 h-4 text-crypto-gold animate-spin" />
                <span className="hidden sm:inline text-xs text-crypto-gold font-medium">
                  Connecting...
                </span>
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.header>
  );
}
