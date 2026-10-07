"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  LineChart,
  Newspaper,
  FlaskConical,
  ShieldCheck,
  BookOpenCheck,
  CalendarCheck,
  Zap,
} from "lucide-react";
import { TradeIdeasTab } from "./trade-ideas-tab";
import { TechnicalAnalystTab } from "./technical-analyst-tab";
import { NewsToTradeTab } from "./news-to-trade-tab";
import { StrategyTesterTab } from "./strategy-tester-tab";
import { PortfolioRiskTab } from "./portfolio-risk-tab";
import { JournalAnalyzerTab } from "./journal-analyzer-tab";
import { DailyPlanTab } from "./daily-plan-tab";

export function TradeHubSection() {
  const [activeTab, setActiveTab] = useState<string>("ideas");

  const tabItems = [
    { id: "ideas", label: "Ideias de Troca", icon: Sparkles, desc: "5 Setups de Alta Probabilidade" },
    { id: "analyst", label: "Analista Técnico", icon: LineChart, desc: "D1/W1 & Suporte/Resistência" },
    { id: "news", label: "Notícias p/ Negócios", icon: Newspaper, desc: "Insights & Posicionamento" },
    { id: "backtest", label: "Teste de Estratégia", icon: FlaskConical, desc: "Win Rate, PF & Melhorias" },
    { id: "risk", label: "Gestor de Risco", icon: ShieldCheck, desc: "Stress Test & Cobertura" },
    { id: "journal", label: "Diário de Negociação", icon: BookOpenCheck, desc: "Últimos 20 Trades & 3 Regras" },
    { id: "plan", label: "Plano Diário", icon: CalendarCheck, desc: "Checklist com Horários" },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-card/90 via-card/50 to-cyan-950/20 p-6 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold px-2.5 py-0.5">
                <Zap className="w-3 h-3 mr-1" />
                Estúdio Quantitativo & IA
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                Engine V3 Conectado
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
              Estúdio Quant & IA
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
              7 Ferramentas especializadas com prompts quantitativos, análise em tempo real com dados da Binance e recomendações de nível institucional.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="rounded-xl bg-background/50 border border-border/40 p-2.5 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-xs">
                <div className="font-semibold text-foreground">Mercado Ativo</div>
                <div className="text-[10px] text-muted-foreground font-mono">Binance API Conectada</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto pb-1 scrollbar-none">
          <TabsList className="bg-card/70 backdrop-blur-md border border-border/40 p-1 rounded-xl h-auto flex flex-nowrap min-w-max gap-1">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-muted-foreground py-2.5 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2"
                >
                  <Icon className="w-4 h-4" />
                  <div className="text-left">
                    <div>{tab.label}</div>
                  </div>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab 1: Ideias de Troca */}
        <TabsContent value="ideas" className="mt-0 focus-visible:outline-none">
          <TradeIdeasTab />
        </TabsContent>

        {/* Tab 2: Analista Técnico */}
        <TabsContent value="analyst" className="mt-0 focus-visible:outline-none">
          <TechnicalAnalystTab />
        </TabsContent>

        {/* Tab 3: Notícias para Negócios */}
        <TabsContent value="news" className="mt-0 focus-visible:outline-none">
          <NewsToTradeTab />
        </TabsContent>

        {/* Tab 4: Teste de Estratégia */}
        <TabsContent value="backtest" className="mt-0 focus-visible:outline-none">
          <StrategyTesterTab />
        </TabsContent>

        {/* Tab 5: Gestor de Risco */}
        <TabsContent value="risk" className="mt-0 focus-visible:outline-none">
          <PortfolioRiskTab />
        </TabsContent>

        {/* Tab 6: Diário de Negociação */}
        <TabsContent value="journal" className="mt-0 focus-visible:outline-none">
          <JournalAnalyzerTab />
        </TabsContent>

        {/* Tab 7: Plano Diário */}
        <TabsContent value="plan" className="mt-0 focus-visible:outline-none">
          <DailyPlanTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default TradeHubSection;
