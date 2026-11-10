"use client";

import React, { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import {
  AppCard,
  SegmentedControl,
  type SegmentedItem,
  AppSwitch,
} from "./atoms";
import { EducationSection } from "@/components/education/education-section";
import { BacktestSection } from "@/components/backtest/backtest-section";
import {
  GraduationCap,
  FlaskConical,
  Settings,
  ShieldAlert,
  KeyRound,
  Brain,
  Sliders,
  AlertTriangle,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function LearnView() {
  const {
    openApiSettingsModal,
    setOpenApiSettingsModal,
    openAiSettingsModal,
    setOpenAiSettingsModal,
    proMode,
    toggleProMode,
    tradingMode,
    setTradingMode,
  } = useCryptoStore(
    useShallow((s) => ({
      openApiSettingsModal: s.openApiSettingsModal,
      setOpenApiSettingsModal: s.setOpenApiSettingsModal,
      openAiSettingsModal: s.openAiSettingsModal,
      setOpenAiSettingsModal: s.setOpenAiSettingsModal,
      proMode: s.proMode,
      toggleProMode: s.toggleProMode,
      tradingMode: s.tradingMode,
      setTradingMode: s.setTradingMode,
    }))
  );

  const [activeTab, setActiveTab] = useState<"courses" | "backtest" | "settings">("courses");

  const tabItems: SegmentedItem<"courses" | "backtest" | "settings">[] = [
    { id: "courses", label: "Cursos & Guias", icon: <GraduationCap className="w-4 h-4" /> },
    { id: "backtest", label: "Laboratório de Backtest", icon: <FlaskConical className="w-4 h-4" /> },
    { id: "settings", label: "Ajustes da Plataforma", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-[#E7EBF0] dark:border-white/10">
        <div>
          <span className="text-[13px] font-mono uppercase tracking-wider text-[#1F5FD6] font-semibold">
            Conhecimento & Simulação
          </span>
          <h1 className="font-instrument-serif text-[36px] sm:text-[44px] text-[#0E1B2C] dark:text-[#f8fafc] leading-tight">
            Aprender & Ajustes
          </h1>
          <p className="text-[15px] text-[#4A586A] dark:text-[#94a3b8]">
            Aprimore sua leitura de mercado, simule estratégias no histórico e configure sua conta.
          </p>
        </div>

        <SegmentedControl
          items={tabItems}
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
        />
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="min-h-[500px]">
        {activeTab === "courses" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-4 sm:p-6 shadow-xs">
            <EducationSection />
          </div>
        )}

        {activeTab === "backtest" && (
          <div className="rounded-[24px] overflow-hidden border border-[#E7EBF0] dark:border-white/10 bg-white dark:bg-[#0f1622] p-4 sm:p-6 shadow-xs">
            <BacktestSection />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6 max-w-3xl">
            {/* Bloco 1: Conexões e Provedores */}
            <AppCard padding="md">
              <h3 className="font-instrument-serif text-[22px] text-[#0E1B2C] dark:text-[#f8fafc] pb-3 border-b border-[#E7EBF0] dark:border-white/10">
                Conexões & Provedores
              </h3>

              <div className="divide-y divide-[#E7EBF0] dark:divide-white/10 pt-2">
                <div className="py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-full bg-[#E7EEFC] text-[#1F5FD6]">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[15px] text-[#0E1B2C] dark:text-[#f8fafc]">
                        Chaves de API da Binance
                      </h4>
                      <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                        Permissões estritas de leitura e negociação spot (saques revogados).
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenApiSettingsModal(true)}
                    className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-xs font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors"
                  >
                    Gerenciar
                  </button>
                </div>

                <div className="py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-full bg-[#F3E8FF] text-[#7C3AED]">
                      <Brain className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[15px] text-[#0E1B2C] dark:text-[#f8fafc]">
                        Motores de Inteligência Artificial
                      </h4>
                      <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                        Configuração de OpenAI, Gemini ou processador local.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenAiSettingsModal(true)}
                    className="px-4 py-2 rounded-full border border-[#D3DAE3] dark:border-white/20 text-xs font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors"
                  >
                    Configurar
                  </button>
                </div>

                <div className="py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-full bg-[#EEF1F5] dark:bg-white/5 text-[#0E1B2C] dark:text-white">
                      <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[15px] text-[#0E1B2C] dark:text-[#f8fafc]">
                        Modo Profissional Institucional
                      </h4>
                      <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                        Exibe o cockpit de risco L2 com Sharpe, Sortino e VaR em tempo real.
                      </p>
                    </div>
                  </div>
                  <AppSwitch checked={proMode} onCheckedChange={toggleProMode} />
                </div>
              </div>
            </AppCard>

            {/* Bloco 2: Zona de Risco e Segurança (Isolada com #FDF4F3 e borda #F1C9C5) */}
            <div className="p-6 rounded-[24px] bg-[#FDF4F3] border border-[#F1C9C5] text-[#B42318] space-y-4">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-instrument-serif text-[22px] font-bold text-[#B42318] leading-none">
                  Zona de Risco & Parada de Emergência
                </h3>
              </div>
              <p className="text-[13px] text-[#B42318]/90 leading-relaxed">
                As ações abaixo afetam a integridade dos dados locais ou o envio de ordens. O Circuit Breaker do sistema protege automaticamente sua conta contra quedas extremas.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/80 border border-[#F1C9C5] text-xs font-semibold text-[#B42318]">
                  <span className="w-2 h-2 rounded-full bg-[#B42318] animate-pulse" />
                  <span>Circuit Breaker Ativo: Perda Máxima Diária 3.0%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

