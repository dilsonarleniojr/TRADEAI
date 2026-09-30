"use client";

import { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { PnlTracker } from "@/components/dashboard/pnl-tracker";
import { ChevronRight, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { motion } from "framer-motion";

export function MiniPnl() {
  const { portfolio } = useCryptoStore();
  const [open, setOpen] = useState(false);
  const isPositive = portfolio.pnl >= 0;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer block md:hidden"
        >
          <Card className="glass-card gradient-border h-[120px] relative overflow-hidden flex flex-col justify-between p-3.5 hover:bg-secondary/10 transition-colors">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-crypto-gold" />
                P&L Compacto
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-60" />
            </div>

            {/* Content row */}
            <div className="flex items-end justify-between mt-1">
              <div>
                <p className="text-[10px] text-muted-foreground">Lucro/Prejuízo Líquido</p>
                <h3 className={`text-xl font-bold font-mono tracking-tight leading-none mt-1 ${
                  isPositive ? "text-crypto-green" : "text-crypto-red"
                }`}>
                  {isPositive ? "+" : ""}${formatPrice(portfolio.pnl)}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Retorno</p>
                <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded mt-1 inline-block ${
                  isPositive ? "bg-crypto-green/10 text-crypto-green" : "bg-crypto-red/10 text-crypto-red"
                }`}>
                  {portfolio.pnlPercent.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Sparkline simulation / text status */}
            <div className="text-[9px] text-muted-foreground mt-2 border-t border-border/30 pt-1.5 flex items-center gap-1.5 justify-between">
              <span className="flex items-center gap-1">
                {isPositive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-pulse" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-crypto-red animate-pulse" />
                )}
                Performance Geral do Robô
              </span>
              <span className="font-mono text-foreground font-semibold">
                {isPositive ? "Lucrativo" : "Rebaixamento"}
              </span>
            </div>
          </Card>
        </motion.div>
      </DrawerTrigger>
      
      <DrawerContent className="bg-background/95 backdrop-blur-xl border-t border-border/50 max-h-[85vh] z-[100] pb-6">
        <div className="w-12 h-1 rounded-full bg-border mx-auto mt-3 mb-2" />
        <div className="px-4 overflow-y-auto cyan-scrollbar">
          <PnlTracker />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
