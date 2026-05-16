"use client";

import { useCryptoStore } from "@/lib/store";
import { Activity, Wifi, WifiOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function Header() {
  const { tradingMode, setTradingMode, selectedSymbol, botActive } =
    useCryptoStore();

  return (
    <motion.header
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 md:px-6 bg-card/80 backdrop-blur-md border-b border-border"
    >
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

      {/* Right: Connection + Bot Status */}
      <div className="flex items-center gap-2">
        {botActive && (
          <Badge className="bg-crypto-green/15 text-crypto-green border-crypto-green/30 hover:bg-crypto-green/20 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-crypto-green mr-1.5 animate-pulse" />
            Bot Active
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Connection status"
        >
          <Wifi className="w-4 h-4 text-crypto-green" />
          <WifiOff className="w-4 h-4 text-crypto-red hidden" />
        </Button>
      </div>
    </motion.header>
  );
}
