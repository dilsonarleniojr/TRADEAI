"use client";

import React, { useState, useMemo } from "react";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import {
  AppCard,
  MetricDisplay,
  MetricStrip,
  AppChip,
  AppSwitch,
  SegmentedControl,
  type SegmentedItem,
} from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  Bot,
  Sliders,
  TrendingUp,
  TrendingDown,
  Layers,
  ShieldCheck,
  Zap,
  MoreVertical,
  Activity,
  History,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BotDrawer } from "./bot-drawer";
import { InstitutionalCockpit } from "@/components/institutional/institutional-cockpit";
import { useShallow } from "zustand/react/shallow";

export function BotView() {
  const {
    bots,
    toggleBot,
    updateBot,
    proMode,
    toggleProMode,
    setActiveSection,
  } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      toggleBot: s.toggleBot,
      updateBot: s.updateBot,
      proMode: s.proMode,
      toggleProMode: s.toggleProMode,
      setActiveSection: s.setActiveSection,
    }))
  );

  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [selectedBot, setSelectedBot] = useState<BotInstance | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Filtragem dos robôs
  const filteredBots = useMemo(() => {
    if (filter === "active") return bots.filter((b) => b.active);
    if (filter === "paused") return bots.filter((b) => !b.active);
    return bots;
  }, [bots, filter]);

  // Contadores para o SegmentedControl
  const filterItems: SegmentedItem<"all" | "active" | "paused">[] = [
    { id: "all", label: "Todos", badge: bots.length },
    { id: "active", label: "Ativos", badge: bots.filter((b) => b.active).length },
    { id: "paused", label: "Pausados", badge: bots.filter((b) => !b.active).length },
  ];

  const handleOpenDrawer = (bot: BotInstance) => {
    setSelectedBot(bot);
    setIsDrawerOpen(true);
  };

  const handleSaveBot = (botId: string, updates: Partial<BotInstance>) => {
    updateBot(botId, updates);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* 1. CABEÇALHO DA TELA ROBÔS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E7EBF0] dark:border-white/10">
        <div>
          <span className="text-[13px] font-mono uppercase tracking-wider text-[#1F5FD6] font-semibold">
            Automação Quantitativa
          </span>
          <h1 className="font-instrument-serif text-[36px] sm:text-[44px] text-[#0E1B2C] dark:text-[#f8fafc] leading-tight">
            Central de Robôs
          </h1>
          <p className="text-[15px] text-[#4A586A] dark:text-[#94a3b8] font-instrument-sans max-w-xl">
            Monitore, pause ou ajuste as estratégias automatizadas. Todas as ordens seguem guardrails rígidos de risco.
          </p>
        </div>

        {/* Controles de Cabeçalho: Segmentado de Filtro + Switch Modo Profissional */}
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            items={filterItems}
            value={filter}
            onChange={(val) => setFilter(val)}
          />

          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#FFFFFF] dark:bg-[#162032] border border-[#E7EBF0] dark:border-white/10 shadow-xs">
            <span className="text-[13px] font-instrument-sans font-medium text-[#0E1B2C] dark:text-[#f8fafc]">
              Modo Profissional
            </span>
            <AppSwitch checked={proMode} onCheckedChange={toggleProMode} />
          </div>
        </div>
      </div>

      {/* 2. LISTA AREJADA DE ROBÔS */}
      <div className="space-y-4">
        {filteredBots.map((bot) => {
          const isProfit = (bot.totalProfit ?? 0) >= 0;
          const winRate = bot.winRate ?? (bot.tradesCount && bot.tradesCount > 0 ? 68.4 : 0);
          const drawdown = bot.maxDrawdownPercent ?? 1.2;

          return (
            <AppCard
              key={bot.id}
              padding="md"
              className="flex flex-col md:flex-row md:items-center justify-between gap-5 hover:border-[#1F5FD6]/30 transition-all"
            >
              {/* Informações Básicas do Robô */}
              <div className="flex items-start sm:items-center space-x-4 min-w-0">
                <div className="w-12 h-12 rounded-full bg-[#EEF1F5] dark:bg-white/5 flex items-center justify-center shrink-0">
                  <Bot className="w-6 h-6 text-[#0E1B2C] dark:text-[#f8fafc]" />
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[17px] text-[#0E1B2C] dark:text-[#f8fafc]">
                      {bot.name}
                    </h3>
                    <AppChip variant="default" className="font-mono uppercase text-[11px]">
                      {bot.pair}
                    </AppChip>
                    <AppChip variant={bot.active ? "success" : "default"}>
                      {bot.active ? "Em execução" : "Pausado"}
                    </AppChip>
                  </div>
                  <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] leading-tight">
                    {bot.strategy} • Alocação: {formatCurrency(bot.allocatedBalance || 500)}
                  </p>
                </div>
              </div>

              {/* Faixa de Métricas (Win Rate, Trades, Drawdown, Lucro) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 py-2 sm:py-0 border-y sm:border-y-0 border-[#E7EBF0] dark:border-white/10 shrink-0">
                <div className="space-y-0.5">
                  <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium">
                    Taxa de Acerto
                  </span>
                  <div className="font-instrument-serif text-[20px] font-bold text-[#0E1B2C] dark:text-[#f8fafc] tabular-nums">
                    {winRate.toFixed(1)}%
                  </div>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium">
                    Operações
                  </span>
                  <div className="font-instrument-serif text-[20px] font-bold text-[#0E1B2C] dark:text-[#f8fafc] tabular-nums">
                    {bot.tradesCount || 0}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium">
                    Drawdown Máx.
                  </span>
                  <div className="font-instrument-serif text-[20px] font-bold text-[#4A586A] dark:text-[#94a3b8] tabular-nums">
                    {drawdown.toFixed(1)}%
                  </div>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium">
                    Resultado Líquido
                  </span>
                  <div
                    className={`font-instrument-serif text-[20px] font-bold tabular-nums ${
                      isProfit ? "text-[#0A7A59] dark:text-[#5BE3A8]" : "text-[#B42318] dark:text-[#FF8A80]"
                    }`}
                  >
                    {isProfit ? "+" : ""}
                    {formatCurrency(bot.totalProfit || 0)}
                  </div>
                </div>
              </div>

              {/* Ações: Ajustar Parâmetros, Ligar/Desligar e Menu Secundário */}
              <div className="flex items-center justify-end space-x-3 shrink-0">
                <button
                  onClick={() => handleOpenDrawer(bot)}
                  className="px-3.5 py-1.5 rounded-full border border-[#D3DAE3] dark:border-white/10 text-[13px] font-semibold text-[#0E1B2C] dark:text-[#f8fafc] hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors flex items-center space-x-1.5"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Ajustar</span>
                </button>

                <AppSwitch
                  checked={bot.active}
                  onCheckedChange={() => toggleBot(bot.id)}
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#4A586A] hover:bg-[#EEF1F5] dark:hover:bg-white/10 transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-[16px] w-48 p-2 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 shadow-lg">
                    <DropdownMenuItem
                      onClick={() => setActiveSection("history")}
                      className="cursor-pointer text-xs flex items-center gap-2 rounded-[10px]"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Ver trades deste robô</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleOpenDrawer(bot)}
                      className="cursor-pointer text-xs flex items-center gap-2 rounded-[10px]"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Configurações avançadas</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </AppCard>
          );
        })}
      </div>

      {/* 3. COCKPIT INSTITUCIONAL (Se Modo Profissional estiver Ativo) */}
      {proMode && (
        <div className="mt-12 pt-8 border-t border-[#E7EBF0] dark:border-white/10 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[12px] font-mono uppercase tracking-wider text-[#0B8F6A] font-semibold">
                Nível Institucional
              </span>
              <h2 className="font-instrument-serif text-[28px] sm:text-[34px] text-[#0E1B2C] dark:text-[#f8fafc] leading-tight">
                Cockpit Profissional & Gestão de Risco
              </h2>
            </div>
          </div>

          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10">
            <InstitutionalCockpit />
          </div>
        </div>
      )}

      {/* Drawer Lateral de Ajustes */}
      <BotDrawer
        bot={selectedBot}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSave={handleSaveBot}
      />
    </div>
  );
}

