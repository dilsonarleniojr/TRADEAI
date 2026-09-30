"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pause, Play, TrendingUp, DollarSign, AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { BotInstance } from "@/lib/store/tradeSlice";

interface SurgicalPanelProps {
  bot: BotInstance;
  onClose: () => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAddMargin: (id: string, amount: number) => void;
}

export function SurgicalPanel({ bot, onClose, onToggle, onRemove, onAddMargin }: SurgicalPanelProps) {
  const [addMargin, setAddMargin] = useState([50]);
  const [confirmClose, setConfirmClose] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-mono">Intervenção Cirúrgica</p>
              <h3 className="font-bold text-sm text-foreground">{bot.name}</h3>
              <p className="text-xs text-muted-foreground">{bot.symbol} · {bot.strategy}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* PNL Status */}
          <div className={`p-3 rounded-xl text-center font-mono ${
            bot.pnl >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
          }`}>
            <p className="text-xs text-muted-foreground">PNL Atual</p>
            <p className={`text-xl font-bold ${bot.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {bot.pnl >= 0 ? "+" : ""}{bot.pnl.toFixed(2)} USDT
            </p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-11 gap-2 text-xs font-mono border-white/10 hover:bg-white/5"
              onClick={() => { onToggle(bot.id); onClose(); }}
            >
              {bot.status === "RUNNING" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {bot.status === "RUNNING" ? "Pausar Bot" : "Retomar Bot"}
            </Button>

            <Button
              variant="outline"
              className="h-11 gap-2 text-xs font-mono border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={onClose}
            >
              <TrendingUp className="w-4 h-4" />
              Force TP
            </Button>
          </div>

          {/* Add Margin */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Adicionar Margem
              </p>
              <span className="text-xs font-bold font-mono text-crypto-cyan">+${addMargin[0]}</span>
            </div>
            <Slider
              value={addMargin}
              onValueChange={setAddMargin}
              min={10} max={500} step={10}
              className="w-full"
            />
            <Button
              className="w-full h-8 text-xs font-mono bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 border border-crypto-cyan/30"
              onClick={() => { onAddMargin(bot.id, addMargin[0]); onClose(); }}
            >
              Confirmar Adição
            </Button>
          </div>

          {/* Danger zone */}
          <div className="border-t border-white/5 pt-3">
            {!confirmClose ? (
              <Button
                variant="ghost"
                className="w-full h-9 text-xs font-mono text-red-400 hover:bg-red-500/10 gap-2"
                onClick={() => setConfirmClose(true)}
              >
                <AlertTriangle className="w-3 h-3" /> Fechar Posição Agora
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 h-9 text-xs"
                  onClick={() => setConfirmClose(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-9 text-xs bg-red-500 hover:bg-red-600 text-white gap-1"
                  onClick={() => { onRemove(bot.id); onClose(); }}
                >
                  <Zap className="w-3 h-3" /> Confirmar Fechamento
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
