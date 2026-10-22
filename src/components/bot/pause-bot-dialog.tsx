"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Zap, ShieldCheck, ArrowRight, Loader2, DollarSign } from "lucide-react";
import type { BotInstance } from "@/lib/store";
import { cn } from "@/lib/utils";

interface PauseBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: BotInstance | null;
  onConfirmKeep: () => void;
  onConfirmLiquidate: () => Promise<void>;
}

export function PauseBotDialog({
  open,
  onOpenChange,
  bot,
  onConfirmKeep,
  onConfirmLiquidate,
}: PauseBotDialogProps) {
  const [isLiquidating, setIsLiquidating] = useState(false);

  if (!bot || !bot.position) return null;

  const pos = bot.position;
  const symClean = (pos.symbol || bot.symbol).replace("USDT", "");
  const currentPrice = pos.currentPrice || pos.entryPrice;
  const notional = pos.quantity * currentPrice;
  const pnlPercent = pos.unrealizedPnlPercent ?? (
    pos.entryPrice > 0 ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0
  );
  const pnlUsdt = pos.unrealizedPnl ?? (
    (currentPrice - pos.entryPrice) * pos.quantity
  );
  const isProfit = pnlPercent >= 0;
  const isLive = pos.mode === "live" || (!pos.mode && bot.stats?.lastAction?.includes("REAL"));

  const handleLiquidate = async () => {
    setIsLiquidating(true);
    try {
      await onConfirmLiquidate();
      onOpenChange(false);
    } finally {
      setIsLiquidating(false);
    }
  };

  const handleKeep = () => {
    onConfirmKeep();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isLiquidating && onOpenChange(v)}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto pro-scrollbar bg-card/95 backdrop-blur-xl border-border/60 shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                Pausar Robô com Posição Aberta?
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                O robô <span className="font-semibold text-foreground">{bot.name}</span> possui saldo ativo sob custódia.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Resumo da Posição */}
        <div className="bg-secondary/40 border border-border/40 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">{symClean}/USDT</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1.5 py-0 font-medium",
                  isLive
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                    : "border-sky-500/40 text-sky-400 bg-sky-500/10"
                )}
              >
                {isLive ? "🟢 Conta Real Spot" : "🔷 Simulado"}
              </Badge>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block">Valor Estimado</span>
              <span className="font-mono font-bold text-sm text-foreground">
                ${notional.toFixed(2)} USDT
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30 text-xs">
            <div>
              <span className="text-[10px] text-muted-foreground block">Quantidade em Carteira</span>
              <span className="font-mono font-medium text-foreground">
                {pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} {symClean}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block">PnL Não Realizado</span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  isProfit ? "text-crypto-green" : "text-crypto-red"
                )}
              >
                {isProfit ? "+" : ""}${pnlUsdt.toFixed(2)} ({isProfit ? "+" : ""}
                {pnlPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          O que você deseja fazer com este ativo ao desligar o robô?
        </p>

        {/* Opções de Ação */}
        <div className="space-y-2.5">
          {/* Opção 1: Liquidar a Mercado Imediatamente */}
          <button
            type="button"
            onClick={handleLiquidate}
            disabled={isLiquidating}
            className="w-full text-left p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 transition-all cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-rose-400 text-xs">
                {isLiquidating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 text-rose-400" />
                )}
                <span>Liquidar a Mercado e Pausar</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-rose-400 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Vende 100% de {symClean} a mercado {isLive ? "na Binance" : ""} imediatamente e desliga o robô. O capital retorna em USDT livre.
            </p>
          </button>

          {/* Opção 2: Manter Ativo em Carteira */}
          <button
            type="button"
            onClick={handleKeep}
            disabled={isLiquidating}
            className="w-full text-left p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-cyan-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Manter Ativo em Carteira e Pausar</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-cyan-400 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Desliga o robô mantendo as moedas na carteira Spot. Você poderá vender ou reativar um robô de IA depois pelo painel.
            </p>
          </button>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLiquidating}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Cancelar (Manter Robô Ligado)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
