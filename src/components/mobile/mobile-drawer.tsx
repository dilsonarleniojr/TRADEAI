"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/format";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi,
  WifiOff,
  Loader2,
  Moon,
  Sun,
  Bot,
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Keyboard,
  ChevronRight,
  Activity,
  Trash2,
  BookOpen,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore, useState } from "react";

const TOP_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
];

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const {
    tradingMode,
    setTradingMode,
    selectedSymbol,
    setSelectedSymbol,
    connectionStatus,
    botActive,
    portfolio,
    clearMockData,
    setActiveSection,
  } = useCryptoStore();

  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [showShortcuts, setShowShortcuts] = useState(false);

  const isPositive = portfolio.pnl >= 0;

  const getConnectionContent = () => {
    switch (connectionStatus) {
      case "connected":
        return {
          icon: <Wifi className="w-4 h-4 text-crypto-green" />,
          label: "Ao Vivo",
          color: "text-crypto-green",
          bg: "bg-crypto-green/10",
        };
      case "rest-api":
        return {
          icon: <Wifi className="w-4 h-4 text-crypto-cyan" />,
          label: "REST API",
          color: "text-crypto-cyan",
          bg: "bg-crypto-cyan/10",
        };
      case "disconnected":
        return {
          icon: <WifiOff className="w-4 h-4 text-crypto-red" />,
          label: "Desconectado",
          color: "text-crypto-red",
          bg: "bg-crypto-red/10",
        };
      case "connecting":
        return {
          icon: <Loader2 className="w-4 h-4 text-crypto-gold animate-spin" />,
          label: "Conectando...",
          color: "text-crypto-gold",
          bg: "bg-crypto-gold/10",
        };
    }
  };

  const connection = getConnectionContent();

  const shortcuts = [
    { keys: "1-6", desc: "Navegar seções" },
    { keys: "T", desc: "Alternar tema" },
    { keys: "M", desc: "Alternar modo" },
    { keys: "B", desc: "Ligar/Desligar bot" },
    { keys: "S", desc: "Selecionar símbolo" },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background/95 backdrop-blur-xl border-t border-border/50 rounded-t-2xl max-h-[70vh] z-[100]">
        {/* Handle indicator */}
        <div className="w-12 h-1 rounded-full bg-border mx-auto mt-3" />

        <DrawerHeader className="pb-2 pt-2">
          <DrawerTitle className="text-sm font-semibold gradient-text-cyan flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Configurações Rápidas
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto cyan-scrollbar space-y-4">
          {/* Trading Mode Toggle */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Modo de Trading
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs font-medium transition-colors",
                    tradingMode === "paper"
                      ? "text-crypto-cyan"
                      : "text-muted-foreground"
                  )}
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
                  className={cn(
                    "text-xs font-medium transition-colors",
                    tradingMode === "live"
                      ? "text-crypto-red"
                      : "text-muted-foreground"
                  )}
                >
                  Real
                </span>
              </div>
            </div>
          </div>

          {/* Connection + Bot Status Row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Connection Status */}
            <div className="glass-card rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Conexão
              </span>
              <div className="flex items-center gap-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", connection.bg)}>
                  {connection.icon}
                </div>
                <span className={cn("text-xs font-medium", connection.color)}>
                  {connection.label}
                </span>
              </div>
            </div>

            {/* Bot Status */}
            <div className="glass-card rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Bot Status
              </span>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  botActive ? "bg-crypto-green/10" : "bg-muted/50"
                )}>
                  <Bot className={cn(
                    "w-4 h-4",
                    botActive ? "text-crypto-green" : "text-muted-foreground"
                  )} />
                </div>
                <div className="flex flex-col">
                  <span className={cn(
                    "text-xs font-medium",
                    botActive ? "text-crypto-green" : "text-muted-foreground"
                  )}>
                    {botActive ? "Ativo" : "Inativo"}
                  </span>
                  {botActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-crypto-green pulse-soft" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tema
              </span>
              {mounted && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-3 hover:bg-secondary/80 rounded-lg"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  <motion.div
                    key={theme}
                    initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    {theme === "dark" ? (
                      <Sun className="w-4 h-4 text-crypto-gold" />
                    ) : (
                      <Moon className="w-4 h-4 text-muted-foreground" />
                    )}
                  </motion.div>
                  <span className="text-xs font-medium">
                    {theme === "dark" ? "Escuro" : "Claro"}
                  </span>
                </Button>
              )}
            </div>
          </div>

          {/* Symbol Selector */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Símbolo
            </span>
            <div className="flex flex-wrap gap-2">
              {TOP_SYMBOLS.map((symbol) => {
                const isActive = selectedSymbol === symbol;
                const base = symbol.replace("USDT", "");
                return (
                  <motion.button
                    key={symbol}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => {
                      setSelectedSymbol(symbol);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 touch-target",
                      isActive
                        ? "bg-crypto-cyan/15 text-crypto-cyan border border-crypto-cyan/30 glow-cyan-sm"
                        : "bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary/80 hover:text-foreground"
                    )}
                  >
                    {base}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Portfolio Summary */}
          <div className="glass-card rounded-xl p-4 space-y-3 card-accent-cyan">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Portfólio
            </span>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-crypto-cyan/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-crypto-cyan" />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold number-animate">
                    ${formatPrice(portfolio.totalValue)}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold px-1.5 py-0.5 rounded-md number-animate",
                      isPositive
                        ? "text-crypto-green bg-crypto-green/10"
                        : "text-crypto-red bg-crypto-red/10"
                    )}
                  >
                    {isPositive ? "+" : ""}
                    {formatPercent(portfolio.pnlPercent)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  {isPositive ? (
                    <TrendingUp className="w-3 h-3 text-crypto-green" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-crypto-red" />
                  )}
                  <span>L/P: {isPositive ? "+" : ""}{formatPrice(portfolio.pnl)}</span>
                </div>
              </div>
            </div>
            <Separator className="bg-border/50" />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Caixa</span>
                  <span className="text-xs font-medium">${formatPrice(portfolio.cashBalance)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Ativos</span>
                  <span className="text-xs font-medium">${formatPrice(portfolio.assetBalance)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Central de Educação Link */}
          <div className="glass-card rounded-xl p-4 card-accent-cyan">
            <Button
              variant="ghost"
              className="w-full h-9 gap-2 text-crypto-cyan hover:bg-crypto-cyan/10 hover:text-crypto-cyan rounded-lg text-xs font-semibold"
              onClick={() => {
                setActiveSection("education");
                onOpenChange(false);
              }}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Acessar Central de Educação
            </Button>
          </div>

          {/* Clear Mock Data */}
          <div className="glass-card rounded-xl p-4">
            <Button
              variant="ghost"
              className="w-full h-9 gap-2 text-crypto-red hover:bg-crypto-red/10 hover:text-crypto-red rounded-lg text-xs font-medium"
              onClick={() => {
                clearMockData();
                fetch("/api/trades", { method: "DELETE" }).catch(() => {});
                onOpenChange(false);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Dados Simulados
            </Button>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="flex items-center justify-between w-full"
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Keyboard className="w-3.5 h-3.5" />
                Atalhos do Teclado
              </span>
              <motion.div
                animate={{ rotate: showShortcuts ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </motion.div>
            </button>

            <AnimatePresence>
              {showShortcuts && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-1">
                    {shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.keys}
                        className="flex items-center justify-between"
                      >
                        <span className="text-xs text-muted-foreground">
                          {shortcut.desc}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-crypto-cyan/20 bg-crypto-cyan/5 text-crypto-cyan px-2"
                        >
                          {shortcut.keys}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
