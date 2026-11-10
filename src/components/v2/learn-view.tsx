"use client";

import React, { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { AppSwitch } from "./atoms";
import { useTheme } from "next-themes";
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
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function LearnView() {
  const {
    openApiSettingsModal,
    setOpenApiSettingsModal,
    openAiSettingsModal,
    setOpenAiSettingsModal,
    proMode,
    toggleProMode,
    setActiveSection,
  } = useCryptoStore(
    useShallow((s) => ({
      openApiSettingsModal: s.openApiSettingsModal,
      setOpenApiSettingsModal: s.setOpenApiSettingsModal,
      openAiSettingsModal: s.openAiSettingsModal,
      setOpenAiSettingsModal: s.setOpenAiSettingsModal,
      proMode: s.proMode,
      toggleProMode: s.toggleProMode,
      setActiveSection: s.setActiveSection,
    }))
  );

  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"cursos" | "indicadores" | "glossario" | "backtesting" | "ajustes">("cursos");

  // Backtesting state
  const [backtestMode, setBacktestMode] = useState<"simples" | "otimizacao">("simples");
  const [compareStrategies, setCompareStrategies] = useState<boolean>(false);
  const [backtestSymbol, setBacktestSymbol] = useState<string>("BTC/USDT");
  const [backtestStrategy, setBacktestStrategy] = useState<string>("RSI");
  const [initialCapital, setInitialCapital] = useState<string>("0,00");

  // Diálogos de risco
  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
  const [shutdownModalOpen, setShutdownModalOpen] = useState(false);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-instrument-serif text-[40px] sm:text-[48px] text-[#0E1B2C] dark:text-white leading-tight">
            {activeTab === "backtesting" ? "Backtesting" : "Aprender e ajustes"}
          </h1>
          <p className="text-[14px] text-[#4A586A] dark:text-[#94a3b8]">
            {activeTab === "backtesting"
              ? "Teste uma estratégia com dados históricos antes de usá-la num robô."
              : "Aprenda trading quantitativo, configure robôs e entenda as métricas de risco. Cada curso termina com um quiz rápido."}
          </p>
        </div>

        {/* Abas Superiores */}
        <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px] sm:text-[14px]">
          {[
            { id: "cursos", label: "Cursos" },
            { id: "indicadores", label: "Indicadores" },
            { id: "glossario", label: "Glossário" },
            { id: "backtesting", label: "Backtesting" },
            { id: "ajustes", label: "Ajustes" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 sm:px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-white dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white font-semibold shadow-xs"
                  : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. ABA: CURSOS & AJUSTES RÁPIDOS (Artboard 09_aprender_ajustes.png) */}
      {(activeTab === "cursos" || activeTab === "ajustes") && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Cards de Cursos (8 colunas) */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Curso 1 */}
            <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1 rounded-full bg-[#EEF1F5] text-[12px] font-semibold text-[#0E1B2C]">
                    Fácil
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#EEF1F5] text-[12px] font-semibold text-[#0E1B2C]">
                    10 min
                  </span>
                </div>

                <h3 className="font-instrument-serif text-[28px] sm:text-[32px] text-[#0E1B2C] dark:text-white leading-tight">
                  Introdução ao trading quantitativo
                </h3>

                <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] leading-relaxed">
                  Aprenda as bases e teste o que entendeu num quiz de fixação no final.
                </p>
              </div>

              <button
                onClick={() => {}}
                className="w-fit px-6 py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity"
              >
                Começar curso
              </button>
            </div>

            {/* Curso 2 */}
            <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1 rounded-full bg-[#EEF1F5] text-[12px] font-semibold text-[#0E1B2C]">
                    Médio
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#EEF1F5] text-[12px] font-semibold text-[#0E1B2C]">
                    15 min
                  </span>
                </div>

                <h3 className="font-instrument-serif text-[28px] sm:text-[32px] text-[#0E1B2C] dark:text-white leading-tight">
                  Gestão de risco e prevenção de ruína
                </h3>

                <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] leading-relaxed">
                  Entenda como limitar perdas e proteger o capital, com quiz no final.
                </p>
              </div>

              <button
                onClick={() => {}}
                className="w-fit px-6 py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity"
              >
                Começar curso
              </button>
            </div>
          </div>

          {/* Coluna Direita: Painel Ajustes Rápidos & Zona de Risco (4 colunas) */}
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-6">
            <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white pb-2 border-b border-[#E7EBF0] dark:border-white/10">
              Ajustes rápidos
            </h3>

            <div className="divide-y divide-[#E7EBF0] dark:divide-white/5 text-[14px]">
              {/* Conexão com a Binance */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-[#0E1B2C] dark:text-white">
                    Conexão com a Binance
                  </h4>
                  <span className="text-[12px] text-[#0A7A59] font-medium block">
                    Ativa
                  </span>
                </div>
                <button
                  onClick={() => setOpenApiSettingsModal(true)}
                  className="px-4 py-1.5 rounded-full border border-[#D3DAE3] text-[13px] font-semibold text-[#0E1B2C] hover:bg-[#EEF1F5] transition-colors"
                >
                  Configurar
                </button>
              </div>

              {/* Motor de IA */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-[#0E1B2C] dark:text-white">
                    Motor de IA
                  </h4>
                  <span className="text-[12px] text-[#4A586A] block">
                    Gemini · chave configurada
                  </span>
                </div>
                <button
                  onClick={() => setOpenAiSettingsModal(true)}
                  className="px-4 py-1.5 rounded-full border border-[#D3DAE3] text-[13px] font-semibold text-[#0E1B2C] hover:bg-[#EEF1F5] transition-colors"
                >
                  Trocar
                </button>
              </div>

              {/* Modo Profissional */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-[#0E1B2C] dark:text-white">
                    Modo profissional
                  </h4>
                  <span className="text-[12px] text-[#4A586A] block">
                    Mostra Cockpit e telemetria
                  </span>
                </div>
                <AppSwitch checked={proMode} onCheckedChange={toggleProMode} />
              </div>

              {/* Tema */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-[#0E1B2C] dark:text-white">
                    Tema
                  </h4>
                  <span className="text-[12px] text-[#4A586A] block">
                    Claro ou escuro
                  </span>
                </div>
                <div className="inline-flex p-0.5 bg-[#EEF1F5] rounded-full border border-[#E7EBF0] text-[12px]">
                  <button
                    onClick={() => setTheme("light")}
                    className={`px-3 py-1 rounded-full font-medium transition-all ${
                      theme === "light" ? "bg-white text-[#0E1B2C] font-semibold shadow-xs" : "text-[#4A586A]"
                    }`}
                  >
                    Claro
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`px-3 py-1 rounded-full font-medium transition-all ${
                      theme === "dark" ? "bg-[#0E1B2C] text-white font-semibold shadow-xs" : "text-[#4A586A]"
                    }`}
                  >
                    Escuro
                  </button>
                </div>
              </div>
            </div>

            {/* Zona de Risco */}
            <div className="pt-2 space-y-3">
              <span className="text-[12px] text-[#4A586A] uppercase tracking-wider block font-medium">
                Zona de risco
              </span>

              <button
                onClick={() => setClearDataModalOpen(true)}
                className="w-full py-2.5 rounded-full bg-[#FDF4F3] border border-[#F1C9C5] text-[#B42318] text-[13px] font-semibold hover:bg-[#fce9e8] transition-colors"
              >
                Limpar dados simulados
              </button>

              <button
                onClick={() => setShutdownModalOpen(true)}
                className="w-full py-2.5 rounded-full bg-[#FDF4F3] border border-[#F1C9C5] text-[#B42318] text-[13px] font-semibold hover:bg-[#fce9e8] transition-colors"
              >
                Desligar plataforma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ABA: BACKTESTING (Artboard 08_backtesting.png) */}
      {activeTab === "backtesting" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] text-[13px]">
              <button
                onClick={() => setBacktestMode("simples")}
                className={`px-4 py-1.5 rounded-full transition-all ${
                  backtestMode === "simples" ? "bg-white text-[#0E1B2C] font-semibold shadow-xs" : "text-[#4A586A]"
                }`}
              >
                Teste simples
              </button>
              <button
                onClick={() => setBacktestMode("otimizacao")}
                className={`px-4 py-1.5 rounded-full transition-all ${
                  backtestMode === "otimizacao" ? "bg-white text-[#0E1B2C] font-semibold shadow-xs" : "text-[#4A586A]"
                }`}
              >
                Otimização
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Formulário Configuração (5 colunas) */}
            <div className="lg:col-span-5 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
              <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Configuração
              </h3>

              {/* Comparar Estratégias */}
              <div className="p-3.5 rounded-[16px] bg-[#EEF1F5] dark:bg-white/5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-[13px] text-[#0E1B2C] dark:text-white block">
                    Comparar estratégias
                  </span>
                  <span className="text-[12px] text-[#4A586A]">Rode várias lado a lado</span>
                </div>
                <AppSwitch checked={compareStrategies} onCheckedChange={setCompareStrategies} />
              </div>

              {/* Par */}
              <div className="space-y-1">
                <label className="text-[12px] text-[#4A586A] font-medium">Par</label>
                <select
                  value={backtestSymbol}
                  onChange={(e) => setBacktestSymbol(e.target.value)}
                  className="w-full h-11 px-3 rounded-[12px] border border-[#D3DAE3] bg-transparent text-[14px]"
                >
                  <option value="BTC/USDT">BTC/USDT</option>
                  <option value="ETH/USDT">ETH/USDT</option>
                  <option value="SOL/USDT">SOL/USDT</option>
                </select>
              </div>

              {/* Estratégia */}
              <div className="space-y-1">
                <label className="text-[12px] text-[#4A586A] font-medium">Estratégia</label>
                <select
                  value={backtestStrategy}
                  onChange={(e) => setBacktestStrategy(e.target.value)}
                  className="w-full h-11 px-3 rounded-[12px] border border-[#D3DAE3] bg-transparent text-[14px]"
                >
                  <option value="RSI">RSI</option>
                  <option value="MACD">MACD</option>
                  <option value="Bollinger">Bandas de Bollinger</option>
                </select>
              </div>

              {/* Datas Início / Fim */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[12px] text-[#4A586A] font-medium">Início</label>
                  <input
                    type="text"
                    placeholder="dd/mm/aaaa"
                    className="w-full h-11 px-3 rounded-[12px] border border-[#D3DAE3] text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] text-[#4A586A] font-medium">Fim</label>
                  <input
                    type="text"
                    placeholder="dd/mm/aaaa"
                    className="w-full h-11 px-3 rounded-[12px] border border-[#D3DAE3] text-[13px]"
                  />
                </div>
              </div>

              {/* Capital Inicial */}
              <div className="space-y-1">
                <label className="text-[12px] text-[#4A586A] font-medium">Capital inicial (USDT)</label>
                <input
                  type="text"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(e.target.value)}
                  className="w-full h-11 px-3 rounded-[12px] border border-[#D3DAE3] text-[14px]"
                />
              </div>

              {/* Parâmetros do RSI */}
              <div className="space-y-2 pt-1">
                <span className="text-[13px] font-bold text-[#0E1B2C] dark:text-white block">
                  Parâmetros do RSI
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#4A586A] block">Período</label>
                    <input type="text" placeholder="—" className="w-full h-10 px-2 text-center rounded-[10px] border border-[#D3DAE3] text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#4A586A] block truncate">Comprar abaixo</label>
                    <input type="text" placeholder="—" className="w-full h-10 px-2 text-center rounded-[10px] border border-[#D3DAE3] text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#4A586A] block truncate">Vender acima</label>
                    <input type="text" placeholder="—" className="w-full h-10 px-2 text-center rounded-[10px] border border-[#D3DAE3] text-[13px]" />
                  </div>
                </div>
              </div>

              <button
                onClick={() => {}}
                className="w-full py-3 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity mt-2"
              >
                Executar backtest
              </button>
            </div>

            {/* Painel Resultado (7 colunas) */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Resultado
              </h3>

              {/* 3 Caixas Tracejadas */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-[16px] border-2 border-dashed border-[#D3DAE3] space-y-1">
                  <span className="text-[12px] text-[#4A586A] block">Retorno</span>
                  <span className="font-instrument-serif text-[28px] text-[#4A586A]">—</span>
                </div>
                <div className="p-4 rounded-[16px] border-2 border-dashed border-[#D3DAE3] space-y-1">
                  <span className="text-[12px] text-[#4A586A] block">Taxa de acerto</span>
                  <span className="font-instrument-serif text-[28px] text-[#4A586A]">—</span>
                </div>
                <div className="p-4 rounded-[16px] border-2 border-dashed border-[#D3DAE3] space-y-1">
                  <span className="text-[12px] text-[#4A586A] block">Queda máxima</span>
                  <span className="font-instrument-serif text-[28px] text-[#4A586A]">—</span>
                </div>
              </div>

              {/* Estado Vazio Cinza */}
              <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] rounded-[24px] p-12 text-center space-y-2">
                <h4 className="font-bold text-[16px] text-[#0E1B2C] dark:text-white">
                  Nenhum teste rodado ainda
                </h4>
                <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] max-w-md mx-auto">
                  Preencha a configuração e toque em "Executar backtest". O retorno, a curva de patrimônio e os trades simulados aparecem aqui.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Diálogos de Confirmação da Zona de Risco */}
      <AlertDialog open={clearDataModalOpen} onOpenChange={setClearDataModalOpen}>
        <AlertDialogContent className="rounded-[24px] max-w-md p-6 bg-white border border-[#F1C9C5]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-instrument-serif text-2xl text-[#B42318] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#B42318]" />
              Limpar Dados Simulados
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#4A586A] pt-2">
              Isso zerará o histórico de operações simuladas, diário de trades e logs de backtest do banco SQLite local. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setClearDataModalOpen(false)}
              className="rounded-full bg-[#B42318] text-white font-semibold"
            >
              Confirmar limpeza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={shutdownModalOpen} onOpenChange={setShutdownModalOpen}>
        <AlertDialogContent className="rounded-[24px] max-w-md p-6 bg-white border border-[#F1C9C5]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-instrument-serif text-2xl text-[#B42318] flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#B42318]" />
              Desligar Plataforma
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#4A586A] pt-2">
              Isso encerrará o processo do servidor local e pausará todas as conexões WebSocket com a Binance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setShutdownModalOpen(false)}
              className="rounded-full bg-[#B42318] text-white font-semibold"
            >
              Desligar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
