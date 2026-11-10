"use client";

import React, { useState, useMemo } from "react";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import { AppSwitch } from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, AlertTriangle, ShieldAlert } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function BotView() {
  const {
    bots,
    toggleBot,
    setAllBotsActive,
    setActiveSection,
    tradingMode,
  } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      toggleBot: s.toggleBot,
      setAllBotsActive: s.setAllBotsActive,
      setActiveSection: s.setActiveSection,
      tradingMode: s.tradingMode,
    }))
  );

  const [filter, setFilter] = useState<"todos" | "ligados" | "pausados">("todos");
  const [selectedBotId, setSelectedBotId] = useState<string>(bots[0]?.id || "bot-1");
  const [emergencyAlertOpen, setEmergencyAlertOpen] = useState(false);

  const activeCount = bots.filter((b) => b.active).length;
  const pausedCount = bots.filter((b) => !b.active).length;

  const filteredBots = useMemo(() => {
    if (filter === "ligados") return bots.filter((b) => b.active);
    if (filter === "pausados") return bots.filter((b) => !b.active);
    return bots;
  }, [bots, filter]);

  const selectedBot = bots.find((b) => b.id === selectedBotId) || bots[0];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-instrument-serif text-[40px] sm:text-[48px] text-[#0E1B2C] dark:text-white leading-tight">
            Robôs
          </h1>
          <p className="text-[14px] text-[#4A586A] dark:text-[#94a3b8]">
            5 robôs configurados, {activeCount === 0 ? "todos pausados" : `${activeCount} em operação`}. Modo {tradingMode === "paper" ? "simulado" : "real"}.
          </p>
        </div>

        {/* Ações da direita: Novo robô, Ligar todos, Menu Mais */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {}}
            className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[14px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            Novo robô
          </button>

          <button
            onClick={() => setAllBotsActive(activeCount === 0)}
            className="px-5 py-2 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] text-[14px] font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            {activeCount === 0 ? "Ligar todos (5)" : "Pausar todos"}
          </button>

          {/* Menu Mais */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[14px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center space-x-1">
                <span>Mais</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 rounded-[18px] bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 shadow-xl font-instrument-sans">
              <DropdownMenuItem onClick={() => setAllBotsActive(false)} className="cursor-pointer text-sm font-medium rounded-[10px]">
                Pausar todos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {}} className="cursor-pointer text-sm font-medium rounded-[10px]">
                Zerar métricas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {}} className="cursor-pointer text-sm font-medium rounded-[10px]">
                Limpar simulação
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setEmergencyAlertOpen(true)}
                className="cursor-pointer text-sm font-medium text-[#B42318] hover:bg-[#FDF4F3] rounded-[10px]"
              >
                Excluir todos os robôs
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setEmergencyAlertOpen(true)}
                className="cursor-pointer text-sm font-medium text-[#B42318] hover:bg-[#FDF4F3] rounded-[10px] font-semibold"
              >
                Parada de emergência
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 2. METRICSTRIP EM CARTÃO BRANCO */}
      <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E7EBF0] dark:divide-white/10 shadow-xs">
        <div className="pb-3 sm:pb-0 sm:pr-6">
          <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Ligados</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            {activeCount} <span className="text-[20px] font-normal text-[#4A586A]">de 5</span>
          </span>
        </div>

        <div className="py-3 sm:py-0 sm:px-6">
          <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Resultado realizado</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            US$ 0,00
          </span>
        </div>

        <div className="py-3 sm:py-0 sm:px-6">
          <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Posições abertas</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            0
          </span>
        </div>

        <div className="pt-3 sm:pt-0 sm:pl-6">
          <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] block">Limite de perda diária</span>
          <span className="font-instrument-serif text-[34px] sm:text-[40px] text-[#0E1B2C] dark:text-white tabular-nums font-bold">
            US$ 300,00
          </span>
        </div>
      </div>

      {/* 3. DUAS COLUNAS: LISTA DE ROBÔS (ESQUERDA) + DETALHES (DIREITA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Filtros e Lista */}
        <div className="lg:col-span-8 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 shadow-xs space-y-4">
          {/* Pílulas de Filtro */}
          <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px]">
            {[
              { id: "todos", label: `Todos (${bots.length})` },
              { id: "ligados", label: `Ligados (${activeCount})` },
              { id: "pausados", label: `Pausados (${pausedCount})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={`px-3.5 py-1 rounded-full transition-all ${
                  filter === f.id
                    ? "bg-[#0E1B2C] text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Linhas da Lista de Robôs */}
          <div className="space-y-2 pt-2">
            {filteredBots.map((bot) => {
              const isSelected = bot.id === selectedBotId;
              return (
                <div
                  key={bot.id}
                  onClick={() => setSelectedBotId(bot.id)}
                  className={`p-4 rounded-[18px] transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 border ${
                    isSelected
                      ? "bg-[#EEF1F5] dark:bg-white/10 border-transparent"
                      : "bg-transparent border-transparent hover:bg-[#F8FAFC] dark:hover:bg-white/5"
                  }`}
                >
                  <div className="space-y-0.5 min-w-[200px]">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-[15px] text-[#0E1B2C] dark:text-white">
                        {bot.name}
                      </span>
                      <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] uppercase font-mono">
                        {bot.pair}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                      {bot.strategy} · Comitê Quant
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-left sm:text-right shrink-0 text-[13px]">
                    <div>
                      <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Alocação</span>
                      <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                        US$ 40,00
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Alvo / Stop</span>
                      <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                        +3,6% / −1,8%
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Resultado</span>
                      <span className="font-medium text-[#0E1B2C] dark:text-white tabular-nums">
                        US$ 0,00
                      </span>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()} className="shrink-0 self-end sm:self-center">
                    <AppSwitch
                      checked={bot.active}
                      onCheckedChange={() => toggleBot(bot.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coluna Direita: Painel Detalhes (Fiel ao artboard) */}
        {selectedBot && (
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-5">
            <div>
              <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] uppercase tracking-wider block font-medium">
                Detalhes
              </span>
              <h2 className="font-instrument-serif text-[32px] text-[#0E1B2C] dark:text-white leading-tight pt-0.5">
                {selectedBot.name}
              </h2>
              <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                {selectedBot.pair} · {selectedBot.strategy}
              </p>
            </div>

            {/* Linhas Chave / Valor */}
            <div className="divide-y divide-[#E7EBF0] dark:divide-white/5 text-[14px]">
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Alocação</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">US$ 40,00</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Alvo de lucro</span>
                <span className="font-medium text-[#0A7A59] dark:text-[#5BE3A8]">+3,6%</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Stop loss</span>
                <span className="font-medium text-[#B42318] dark:text-[#FF8A80]">−1,8%</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Trailing</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">0,55%</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Break-even a partir de</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">+2,2%</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Encerrar após</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">60 min sem evolução</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#4A586A] dark:text-[#94a3b8]">Reinvestir lucros</span>
                <span className="font-medium text-[#0E1B2C] dark:text-white">Sim</span>
              </div>
            </div>

            {/* Botões do Rodapé do Painel */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={() => toggleBot(selectedBot.id)}
                className="w-full py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity cursor-pointer"
              >
                {selectedBot.active ? `Pausar ${selectedBot.name}` : `Ligar ${selectedBot.name}`}
              </button>

              <button
                onClick={() => setActiveSection("history")}
                className="w-full py-2.5 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white font-semibold text-[14px] hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Ver trades (0)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmação de Emergência */}
      <AlertDialog open={emergencyAlertOpen} onOpenChange={setEmergencyAlertOpen}>
        <AlertDialogContent className="rounded-[24px] max-w-md p-6 bg-white dark:bg-[#0f1622] border border-[#F1C9C5] font-instrument-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-instrument-serif text-2xl text-[#B42318] flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#B42318]" />
              Parada de Emergência
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#4A586A] pt-2">
              Esta ação pausa imediatamente todos os robôs e cancela todas as ordens abertas na exchange. Posições já preenchidas continuarão ativas até que sejam fechadas manualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAllBotsActive(false);
                setEmergencyAlertOpen(false);
              }}
              className="rounded-full bg-[#B42318] text-white font-semibold hover:bg-[#911a10]"
            >
              Executar parada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
