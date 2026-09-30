"use client";

import { useState } from "react";
import { Glossary } from "./glossary";
import { MiniCourses } from "./mini-courses";
import { IndicatorExplainer } from "./indicator-explainer";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, BookOpen, Layers, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type EducationTab = "courses" | "explainers" | "glossary";

export function EducationSection() {
  const [activeTab, setActiveTab] = useState<EducationTab>("courses");

  const renderTabContent = () => {
    switch (activeTab) {
      case "courses":
        return <MiniCourses />;
      case "explainers":
        return <IndicatorExplainer />;
      case "glossary":
        return <Glossary />;
      default:
        return null;
    }
  };

  const tabs = [
    { id: "courses" as const, label: "Mini-Cursos", icon: GraduationCap },
    { id: "explainers" as const, label: "Indicadores", icon: Layers },
    { id: "glossary" as const, label: "Glossário", icon: BookOpen },
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Education Header */}
      <div className="glass-card gradient-border p-5 relative overflow-hidden flex flex-col justify-between">
        {/* Glow circle overlay */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-crypto-cyan/10 blur-xl pointer-events-none" />
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-crypto-cyan">
            <GraduationCap className="w-5 h-5 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">Central de Aprendizado</span>
          </div>
          <h2 className="text-xl font-bold text-foreground">TRADEAI Education</h2>
          <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
            Domine trading quantitativo, configure robôs de investimentos e entenda as métricas de riscos estatísticos com nossa academia interativa.
          </p>
        </div>
      </div>

      {/* Tabs list bar */}
      <div className="flex bg-secondary/30 rounded-xl p-1 border border-border/40">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer select-none",
                isActive
                  ? "bg-crypto-cyan/15 text-crypto-cyan border border-crypto-cyan/10 glow-cyan-sm shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Tab Body with transitions */}
      <div className="min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
