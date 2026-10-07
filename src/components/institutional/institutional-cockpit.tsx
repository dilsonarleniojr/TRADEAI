"use client";

import { useInstitutionalRealtime } from "@/hooks/use-institutional-realtime";
import { InstitutionalHeader } from "./header-institutional";
import { RealtimeNetPnlChart } from "./pnl-realtime-chart";
import { StrategyCardsGrid } from "./strategy-cards-grid";
import { MicrostructurePanel } from "./microstructure-panel";
import { PredictiveAlertsPanel } from "./predictive-alerts-panel";
import { BotHealthPanel } from "./bot-health-panel";
import { motion } from "framer-motion";

export function InstitutionalCockpit() {
  // Ativar sincronização contínua de alta resolução com SQLite WAL + Binance
  useInstitutionalRealtime();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 max-w-[1600px] mx-auto pb-8"
    >
      {/* 1. Painel Superior (Header Institucional) */}
      <InstitutionalHeader />

      {/* 2. Painel Central: Gráfico de PnL Líquido Real-Time */}
      <RealtimeNetPnlChart />

      {/* 3. Cards de Estratégias Institucionais */}
      <StrategyCardsGrid />

      {/* 4. Grid de Microestrutura L2 + Alertas Preditivos IA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Painel de Microestrutura (Livro L2 + OFI) */}
        <MicrostructurePanel />

        {/* Painel de Alertas Inteligentes + IA */}
        <PredictiveAlertsPanel />
      </div>

      {/* 5. Painel de Saúde dos Bots & SQLite WAL */}
      <BotHealthPanel />
    </motion.div>
  );
}
