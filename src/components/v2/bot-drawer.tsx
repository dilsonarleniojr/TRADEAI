"use client";

import React, { useState } from "react";
import { type BotInstance } from "@/lib/store";
import { formatCurrency, formatPercent } from "@/lib/format";
import { AppCard, AppSwitch } from "./atoms";
import { ExchangeBadge } from "@/components/bot/exchange-badge";
import { X, Sliders, Shield, Target, Zap, DollarSign, Check } from "lucide-react";

interface BotDrawerProps {
  bot: BotInstance | null;
  open: boolean;
  onClose: () => void;
  onSave: (botId: string, updates: Partial<BotInstance>) => void;
}

export function BotDrawer({ bot, open, onClose, onSave }: BotDrawerProps) {
  if (!open || !bot) return null;
  return <BotDrawerContent key={bot.id} bot={bot} onClose={onClose} onSave={onSave} />;
}

function BotDrawerContent({
  bot,
  onClose,
  onSave,
}: {
  bot: BotInstance;
  onClose: () => void;
  onSave: (botId: string, updates: Partial<BotInstance>) => void;
}) {
  const [takeProfit, setTakeProfit] = useState<number>(bot.takeProfit ?? 3.5);
  const [stopLoss, setStopLoss] = useState<number>(bot.stopLoss ?? 1.8);
  const [capitalAllocation, setCapitalAllocation] = useState<number>(bot.allocationAmount ?? 25);
  const [exchange, setExchange] = useState<"binance" | "okx">(bot.exchange === "okx" ? "okx" : "binance");
  const [trailingStop, setTrailingStop] = useState<boolean>(bot.trailingStop ?? true);
  const [useBtcGatekeeper, setUseBtcGatekeeper] = useState<boolean>(bot.useBtcGatekeeper ?? true);
  const [useOrderBookFilter, setUseOrderBookFilter] = useState<boolean>(bot.useOrderBookFilter ?? true);
  const [usePartialTp, setUsePartialTp] = useState<boolean>(bot.usePartialTp ?? true);
  const [disableConsecutiveLossBrake, setDisableConsecutiveLossBrake] = useState<boolean>(
    bot.disableConsecutiveLossBrake ?? false
  );
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  const hasOpenPosition = !!(bot.position && bot.position.quantity > 0);

  const handleSave = () => {
    onSave(bot.id, {
      exchange,
      takeProfit,
      stopLoss,
      allocationAmount: capitalAllocation,
      trailingStop,
      useBtcGatekeeper,
      useOrderBookFilter,
      usePartialTp,
      disableConsecutiveLossBrake,
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

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen max-w-full sm:max-w-md bg-[#FFFFFF] dark:bg-[#0f1622] shadow-2xl border-l border-[#E7EBF0] dark:border-white/10 flex flex-col justify-between">
          {/* Header do Drawer */}
          <div className="p-6 border-b border-[#E7EBF0] dark:border-white/10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <ExchangeBadge exchange={exchange} />
                <span className="text-[12px] font-mono uppercase tracking-wider text-[#1F5FD6] font-semibold">
                  {bot.symbol === "AUTO" ? "Auto-Screener" : bot.symbol} • {bot.strategy}
                </span>
              </div>
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
            {/* Corretora de Execução */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[#0E1B2C] dark:text-[#f8fafc]">
                  Corretora de Execução
                </span>
                {hasOpenPosition && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-300 font-medium">
                    Bloqueado (posição aberta)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "binance", label: "Binance Spot" },
                    { id: "okx", label: "OKX V5 Unified" },
                  ] as const
                ).map((item) => {
                  const selected = exchange === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={hasOpenPosition}
                      onClick={() => setExchange(item.id)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        selected
                          ? item.id === "okx"
                            ? "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                            : "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "border-[#E7EBF0] dark:border-white/10 bg-[#F8FAFC] dark:bg-white/5 text-[#4A586A] dark:text-[#94a3b8]"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

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
                min="10"
                max="5000"
                step="5"
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

            {/* Guardrails de Risco do Robô */}
            <div className="space-y-2.5 pt-2 border-t border-[#E7EBF0] dark:border-white/10">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4A586A] dark:text-[#94a3b8] block">
                Proteções & Filtros de Entrada
              </span>

              <div className="p-3.5 rounded-[14px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 flex items-center justify-between gap-3">
                <div>
                  <h5 className="font-semibold text-[13px] text-[#0E1B2C] dark:text-[#f8fafc]">
                    Filtro Macro BTC (Gatekeeper)
                  </h5>
                  <p className="text-[11px] text-[#4A586A] dark:text-[#94a3b8]">
                    Pausa compras quando o Bitcoin entra em queda forte.
                  </p>
                </div>
                <AppSwitch checked={useBtcGatekeeper} onCheckedChange={setUseBtcGatekeeper} />
              </div>

              <div className="p-3.5 rounded-[14px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 flex items-center justify-between gap-3">
                <div>
                  <h5 className="font-semibold text-[13px] text-[#0E1B2C] dark:text-[#f8fafc]">
                    Filtro de Livro L2 & Spread
                  </h5>
                  <p className="text-[11px] text-[#4A586A] dark:text-[#94a3b8]">
                    Bloqueia entradas com spread aberto ou pressão vendedora.
                  </p>
                </div>
                <AppSwitch checked={useOrderBookFilter} onCheckedChange={setUseOrderBookFilter} />
              </div>

              <div className="p-3.5 rounded-[14px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 flex items-center justify-between gap-3">
                <div>
                  <h5 className="font-semibold text-[13px] text-[#0E1B2C] dark:text-[#f8fafc]">
                    Realização Parcial (TP Parcial)
                  </h5>
                  <p className="text-[11px] text-[#4A586A] dark:text-[#94a3b8]">
                    Realiza parte do lucro em 1R e protege o restante no break-even.
                  </p>
                </div>
                <AppSwitch checked={usePartialTp} onCheckedChange={setUsePartialTp} />
              </div>

              <div className="p-3.5 rounded-[14px] bg-[#FDF4F3] dark:bg-rose-500/10 border border-[#F1C9C5] dark:border-rose-500/30 flex items-center justify-between gap-3">
                <div>
                  <h5 className="font-semibold text-[13px] text-[#B42318] dark:text-rose-300">
                    Liberar freio de 3 perdas consecutivas
                  </h5>
                  <p className="text-[11px] text-[#4A586A] dark:text-[#94a3b8]">
                    Permite que este robô continue operando mesmo após 3 stops seguidos.
                  </p>
                </div>
                <AppSwitch
                  checked={disableConsecutiveLossBrake}
                  onCheckedChange={setDisableConsecutiveLossBrake}
                />
              </div>
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

