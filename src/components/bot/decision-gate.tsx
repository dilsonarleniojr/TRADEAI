"use client";

import { useState, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Brain, TrendingUp, CheckCircle2, XCircle, Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AISuggestion, BotStrategy } from "@/lib/store/tradeSlice";

// Strategy icon map
const STRATEGY_COLORS: Record<string, string> = {
  OBI: "#22d3ee", Grid: "#a78bfa", TWAP: "#34d399", VWAP: "#34d399",
  AI: "#f59e0b", MeanReversion: "#ef4444", PairsTrading: "#818cf8",
  DCA: "#10b981", Sniper: "#f97316", Kelly: "#eab308", RSI: "#60a5fa", MACD: "#8b5cf6",
};

interface SwipeCardProps {
  suggestion: AISuggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isTop: boolean;
}

function SwipeCard({ suggestion, onAccept, onReject, isTop }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const acceptOpacity = useTransform(x, [0, 80], [0, 1]);
  const rejectOpacity = useTransform(x, [-80, 0], [1, 0]);
  const cardOpacity = useTransform(x, [-300, 0, 300], [0, 1, 0]);

  const riskDelta = suggestion.proposedRiskPct - suggestion.currentRiskPct;
  const color = STRATEGY_COLORS[suggestion.strategy] ?? "#22d3ee";
  const timeAgo = Math.round((Date.now() - suggestion.createdAt) / 60000);

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (info.offset.x > 100) {
      animate(x, 400, { duration: 0.3 }).then(() => onAccept(suggestion.id));
    } else if (info.offset.x < -100) {
      animate(x, -400, { duration: 0.3 }).then(() => onReject(suggestion.id));
    } else {
      animate(x, 0, { type: "spring", stiffness: 500 });
    }
  }

  if (suggestion.status !== "PENDING") {
    return null;
  }

  return (
    <motion.div
      style={{ x, rotate, opacity: cardOpacity }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      className={`absolute inset-0 rounded-2xl border p-4 space-y-3 cursor-grab active:cursor-grabbing select-none
        bg-zinc-900/95 border-white/10 backdrop-blur-md
        ${!isTop ? "scale-95 translate-y-2 opacity-60" : ""}
      `}
    >
      {/* Accept / Reject overlays */}
      <motion.div
        style={{ opacity: acceptOpacity }}
        className="absolute inset-0 rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 flex items-center justify-center z-10 pointer-events-none"
      >
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg">
          <CheckCircle2 className="w-8 h-8" /> ACEITAR
        </div>
      </motion.div>
      <motion.div
        style={{ opacity: rejectOpacity }}
        className="absolute inset-0 rounded-2xl border-2 border-red-500 bg-red-500/10 flex items-center justify-center z-10 pointer-events-none"
      >
        <div className="flex items-center gap-2 text-red-400 font-bold text-lg">
          <XCircle className="w-8 h-8" /> REJEITAR
        </div>
      </motion.div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}>
            <Brain className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground leading-tight">{suggestion.title}</p>
            <p className="text-[10px] text-muted-foreground">{suggestion.symbol}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className="text-[9px] font-mono" style={{ borderColor: `${color}50`, color }}>
            {suggestion.strategy}
          </Badge>
          <span className="text-[9px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />{timeAgo}m atrás
          </span>
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">{suggestion.reasoning}</p>

      {/* Risk Diff */}
      <div className="rounded-xl p-3 border space-y-1.5" style={{ backgroundColor: `${riskDelta > 0 ? "#f59e0b" : "#22d3ee"}10`, borderColor: `${riskDelta > 0 ? "#f59e0b" : "#22d3ee"}30` }}>
        <p className="text-[10px] text-muted-foreground font-mono uppercase">Impacto no Risco da Conta</p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-foreground">{suggestion.currentRiskPct.toFixed(1)}%</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <span className={`text-sm font-bold font-mono ${riskDelta > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {suggestion.proposedRiskPct.toFixed(1)}%
          </span>
          {riskDelta > 0 && <AlertTriangle className="w-3 h-3 text-amber-400" />}
        </div>
        <div className="flex gap-3 text-[10px] font-mono">
          <span className="text-muted-foreground">Sharpe: <span className="text-foreground">{suggestion.sharpeExpected.toFixed(2)}</span></span>
          <span className="text-muted-foreground">DD máx: <span className="text-foreground">{(suggestion.drawdownExpected * 100).toFixed(1)}%</span></span>
        </div>
      </div>

      {/* Swipe hint */}
      {isTop && (
        <p className="text-center text-[9px] text-muted-foreground/50 font-mono">
          ← arraste para rejeitar · aceitar para a direita →
        </p>
      )}
    </motion.div>
  );
}

interface DecisionGateProps {
  suggestions: AISuggestion[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function DecisionGate({ suggestions, onAccept, onReject }: DecisionGateProps) {
  const pending = suggestions.filter((s) => s.status === "PENDING");
  const resolved = suggestions.filter((s) => s.status !== "PENDING");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-crypto-cyan" />
          <span className="text-sm font-semibold">Caixa de Entrada da IA</span>
          {pending.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-crypto-cyan text-black text-[10px] font-bold flex items-center justify-center">
              {pending.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {resolved.length} resolvidas
        </span>
      </div>

      {/* Card Stack */}
      {pending.length > 0 ? (
        <div className="relative h-64">
          {[...pending].reverse().map((s, i) => (
            <SwipeCard
              key={s.id}
              suggestion={s}
              onAccept={onAccept}
              onReject={onReject}
              isTop={i === pending.length - 1}
            />
          ))}
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center rounded-2xl border border-dashed border-white/10">
          <div className="text-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
            <p className="text-xs text-muted-foreground">Nenhuma sugestão pendente</p>
          </div>
        </div>
      )}

      {/* Resolved list */}
      {resolved.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-mono uppercase">Histórico</p>
          {resolved.slice(0, 5).map((s) => (
            <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-white/3 border border-white/5">
              <span className="text-[11px] font-mono text-muted-foreground">{s.title}</span>
              <Badge variant="outline" className={`text-[9px] ${s.status === "ACCEPTED" ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}>
                {s.status === "ACCEPTED" ? "✓ Aceita" : "✗ Rejeitada"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
