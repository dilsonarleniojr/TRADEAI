"use client";

import { useState } from "react";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { manualCloseBotPosition } from "@/lib/bot/multi-bot-engine";
import { LogOut, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FastCloseBadgeProps {
  symbol: string;
  className?: string;
  size?: "xs" | "sm" | "default";
  onActivateClick?: () => void;
  showInactiveBadge?: boolean;
}

export function FastCloseBadge({
  symbol,
  className,
  size = "default",
  onActivateClick,
  showInactiveBadge = true,
}: FastCloseBadgeProps) {
  const { toast } = useToast();
  const bots = useCryptoStore((s) => s.bots);
  const tickers = useCryptoStore((s) => s.tickers);
  const [isClosing, setIsClosing] = useState(false);

  const cleanSym = symbol.endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const baseSym = cleanSym.replace("USDT", "");
  const activeBot = bots.find((b) => b.symbol.toUpperCase() === cleanSym && b.active);
  const isBotInPosition = activeBot && (activeBot.status === "in_position" || (!!activeBot.position && activeBot.position.quantity > 0));

  let floatingPnlPct = 0;
  let hasFloatingPnl = false;
  if (isBotInPosition && activeBot?.position) {
    const curPrice = tickers[cleanSym]?.price ?? (activeBot.position.currentPrice || 0);
    const entryPrice = activeBot.position.entryPrice || 0;
    if (curPrice > 0 && entryPrice > 0) {
      floatingPnlPct = ((curPrice - entryPrice) / entryPrice) * 100;
      hasFloatingPnl = true;
    } else if (typeof activeBot.position.unrealizedPnlPercent === "number") {
      floatingPnlPct = activeBot.position.unrealizedPnlPercent;
      hasFloatingPnl = true;
    }
  }
  const isFloatingProfit = floatingPnlPct >= 0;

  const handleFastClose = async (e: React.MouseEvent, bot: BotInstance) => {
    e.stopPropagation();
    if (isClosing) return;

    setIsClosing(true);
    toast({
      title: `⚡ Zeragem Rápida a Mercado (${baseSym})`,
      description: `Encerrando posição de ${bot.name} a preço de mercado...`,
    });

    try {
      await manualCloseBotPosition(bot.id, {
        onToast: (t) => toast(t),
      });
    } catch (err: any) {
      toast({
        title: "Erro na Zeragem",
        description: err?.message || "Não foi possível liquidar a posição.",
        variant: "destructive",
      });
    } finally {
      setIsClosing(false);
    }
  };

  if (!activeBot) {
    if (!showInactiveBadge) return null;
    return (
      <Badge
        variant="outline"
        className={cn(
          "font-bold bg-cyan-500/10 text-cyan-300 border-cyan-500/30 flex items-center gap-1 cursor-pointer hover:bg-cyan-500/20 transition-colors",
          size === "xs" && "text-[8px] px-1 py-0 leading-none",
          size === "sm" && "text-[9px] px-1.5 py-0",
          size === "default" && "text-[10px] px-2 py-0.5",
          className
        )}
        onClick={(e) => {
          if (onActivateClick) {
            e.stopPropagation();
            onActivateClick();
          }
        }}
        title={`Clique para ativar robô para ${symbol}`}
      >
        <Zap className={cn("shrink-0", size === "xs" ? "w-2 h-2" : "w-3 h-3")} />
        <span>⚡ Clique para Ativar</span>
      </Badge>
    );
  }

  if (!isBotInPosition) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/50 flex items-center gap-1 shadow-sm font-mono",
          size === "xs" && "text-[8px] px-1.5 py-0 leading-none",
          size === "sm" && "text-[9px] px-1.5 py-0",
          size === "default" && "text-[10px] px-2 py-0.5",
          className
        )}
        title={`Robô ativo em ${symbol}: ${activeBot.name}`}
      >
        <span className={cn("rounded-full bg-emerald-400 animate-ping shrink-0", size === "xs" ? "w-1 h-1" : "w-1.5 h-1.5")} />
        <span>🟢 Bot em Execução</span>
      </Badge>
    );
  }

  // Robô em Posição: Badge com PnL Flutuante + Gatilho de Zeragem Rápida a Mercado
  return (
    <div className={cn("flex items-center gap-1 group/fastclose", className)}>
      <Badge
        variant="outline"
        className={cn(
          "font-bold flex items-center gap-1 shadow-sm font-mono transition-all",
          isFloatingProfit
            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30"
            : "bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30",
          size === "xs" && "text-[8px] px-1.5 py-0 leading-none",
          size === "sm" && "text-[9px] px-1.5 py-0",
          size === "default" && "text-[10px] px-2 py-0.5"
        )}
        title={`Robô em posição em ${symbol}: Entrada $${activeBot.position?.entryPrice?.toFixed(4) || "0"}`}
      >
        <span
          className={cn(
            "rounded-full animate-ping shrink-0",
            isFloatingProfit ? "bg-emerald-400" : "bg-amber-400",
            size === "xs" ? "w-1 h-1" : "w-1.5 h-1.5"
          )}
        />
        <span>
          {isFloatingProfit ? "🟢" : "🟡"} Em Posição ({hasFloatingPnl ? `${isFloatingProfit ? "+" : ""}${floatingPnlPct.toFixed(2)}%` : "0.00%"})
        </span>
      </Badge>

      {/* Botão de Zeragem Rápida a Mercado (Fast Close / Market Flatten) */}
      <Button
        size="sm"
        variant="destructive"
        disabled={isClosing}
        onClick={(e) => handleFastClose(e, activeBot)}
        className={cn(
          "font-bold bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 rounded transition-all flex items-center gap-1 cursor-pointer shadow-sm",
          size === "xs" && "h-4 px-1 text-[8px]",
          size === "sm" && "h-5 px-1.5 text-[9px]",
          size === "default" && "h-6 px-2 text-[10px]"
        )}
        title={`Zerar posição de ${baseSym} a mercado imediatamente (Fast Close)`}
      >
        {isClosing ? (
          <Loader2 className={cn("animate-spin", size === "xs" ? "w-2 h-2" : "w-2.5 h-2.5")} />
        ) : (
          <LogOut className={cn(size === "xs" ? "w-2 h-2" : "w-2.5 h-2.5")} />
        )}
        <span>{isClosing ? "Zerando..." : "Zerar"}</span>
      </Button>
    </div>
  );
}
