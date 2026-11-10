"use client";

import React, { useState, useEffect } from "react";
import { type BotInstance } from "@/lib/store";
import { formatCurrency, formatPercent } from "@/lib/format";
import { AppCard, AppSwitch } from "./atoms";
import { X, Sliders, Shield, Target, Zap, DollarSign, Check } from "lucide-react";

interface BotDrawerProps {
  bot: BotInstance | null;
  open: boolean;
  onClose: () => void;
  onSave: (botId: string, updates: Partial<BotInstance>) => void;
}

export function BotDrawer({ bot, open, onClose, onSave }: BotDrawerProps) {
  const [takeProfit, setTakeProfit] = useState<number>(3.5);
  const [stopLoss, setStopLoss] = useState<number>(1.8);
  const [capitalAllocation, setCapitalAllocation] = useState<number>(500);
  const [trailingStop, setTrailingStop] = useState<boolean>(true);
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  useEffect(() => {
    if (bot) {
      setTakeProfit(bot.takeProfitPercent ?? 3.5);
      setStopLoss(bot.stopLossPercent ?? 1.8);
      setCapitalAllocation(bot.allocatedBalance ?? 500);
      setTrailingStop(bot.trailingStop ?? true);
      setSavedFeedback(false);
    }
  }, [bot]);

  if (!open || !bot) return null;

  const handleSave = () => {
    onSave(bot.id, {
      takeProfitPercent: takeProfit,
      stopLossPercent: stopLoss,
      allocatedBalance: capitalAllocation,
      trailingStop: trailingStop,
    });
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-instrument-sans">
      {/* Backdrop sutil */}
      <div
        className="absolute inset-0 bg-[#0E1B2C]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#FFFFFF] dark:bg-[#0f1622] shadow-2xl border-l border-[#E7EBF0] dark:border-white/10 flex flex-col justify-between">
          {/* Header do Drawer */}
          <div className="p-6 border-b border-[#E7EBF0] dark:border-white/10 flex items-center justify-between">
            <div>
              <span className="text-[12px] font-mono uppercase tracking-wider text-[#1F5FD6] font-semibold">
                {bot.pair} • {bot.strategy}
              </span>
              <h3 className="font-instrument-serif text-[24px] text-[#0E1B2C] dark:text-[#f8fafc] leading-tight">
                Ajustar {bot.name}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#4A586A] hover:bg-[#EEF1F5] dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo com Sliders e Campos */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* Alvo de Lucro (Take Profit) */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[#0E1B2C] dark:text-[#f8fafc] flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-[#0B8F6A]" />
                  Alvo de Lucro (Take Profit)
                </span>
                <span className="font-mono font-bold text-[#0B8F6A]">
                  +{takeProfit}%
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="15.0"
                step="0.1"
                value={takeProfit}
                onChange={(e) => setTakeProfit(parseFloat(e.target.value))}
                className="w-full accent-[#0B8F6A] cursor-pointer"
              />
              <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                Encerra a operação automaticamente ao atingir o percentual de ganho.
              </p>
            </div>

            {/* Trava de Perda (Stop Loss) */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[#0E1B2C] dark:text-[#f8fafc] flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#B42318]" />
                  Trava de Perda Máxima (Stop Loss)
                </span>
                <span className="font-mono font-bold text-[#B42318]">
                  -{stopLoss}%
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.1"
                value={stopLoss}
                onChange={(e) => setStopLoss(parseFloat(e.target.value))}
                className="w-full accent-[#B42318] cursor-pointer"
              />
              <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                Proteção máxima obrigatória limitada a 2.0% conforme guardrails.
              </p>
            </div>

            {/* Capital Alocado */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[#0E1B2C] dark:text-[#f8fafc] flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-[#1F5FD6]" />
                  Capital Dedicado (USDT)
                </span>
                <span className="font-mono font-bold text-[#0E1B2C] dark:text-white">
                  {formatCurrency(capitalAllocation)}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={capitalAllocation}
                onChange={(e) => setCapitalAllocation(parseFloat(e.target.value))}
                className="w-full accent-[#1F5FD6] cursor-pointer"
              />
              <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                Limite de saldo que este robô pode empenhar simultaneamente.
              </p>
            </div>

            {/* Trailing Stop */}
            <div className="p-4 rounded-[16px] bg-[#EEF1F5] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 flex items-center justify-between">
              <div>
                <h5 className="font-semibold text-sm text-[#0E1B2C] dark:text-[#f8fafc]">
                  Trailing Stop Inteligente
                </h5>
                <p className="text-xs text-[#4A586A] dark:text-[#94a3b8]">
                  Sobe o stop protegendo o lucro conforme o preço avança.
                </p>
              </div>
              <AppSwitch checked={trailingStop} onCheckedChange={setTrailingStop} />
            </div>
          </div>

          {/* Footer com Botões */}
          <div className="p-6 border-t border-[#E7EBF0] dark:border-white/10 flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4A586A] hover:text-[#0E1B2C] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-full bg-[#0E1B2C] dark:bg-[#5BE3A8] text-white dark:text-[#0E1B2C] font-semibold text-sm hover:opacity-90 transition-opacity flex items-center space-x-1.5"
            >
              {savedFeedback ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Salvo!</span>
                </>
              ) : (
                <span>Salvar alterações</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

