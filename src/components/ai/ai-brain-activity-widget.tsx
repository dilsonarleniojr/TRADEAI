"use client";

import { Fragment } from "react";
import { Brain, ChevronRight, CircleCheck, CircleX, ShieldAlert, TriangleAlert, Zap } from "lucide-react";
import type { AISignalData, AgentToolStatus } from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<AgentToolStatus, { className: string; icon: typeof Zap; text: string }> = {
  success: {
    className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    icon: Zap,
    text: "Sucesso",
  },
  fallback: {
    className: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    icon: TriangleAlert,
    text: "Dados parciais",
  },
  failed: {
    className: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    icon: CircleX,
    text: "Falha",
  },
};

const DECISION_STYLE = {
  BUY: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  SELL: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  HOLD: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
} as const;

const pill = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold leading-none";

type Props = Pick<AISignalData, "action" | "vetoed" | "agent_error" | "error_reason" | "agent_telemetry">;

/** Linha do tempo do agente: ferramentas chamadas, status de cada uma e a decisão final. */
export function AIBrainActivityWidget({ action, vetoed, agent_error, error_reason, agent_telemetry }: Props) {
  if (!agent_telemetry) return null;

  const { tools, provider, model, duration_ms } = agent_telemetry;
  const failedCount = tools.filter((t) => t.status === "failed").length;

  const decision = agent_error ? (
    <span className={cn(pill, "bg-rose-500/15 text-rose-300 border-rose-500/40")} title={error_reason}>
      <CircleX className="h-3 w-3" /> Falha do motor de IA: HOLD forçado
    </span>
  ) : vetoed ? (
    <span className={cn(pill, "bg-amber-500/15 text-amber-300 border-amber-500/40")}>
      <ShieldAlert className="h-3 w-3" /> Vetado pelo gatekeeper: HOLD
    </span>
  ) : (
    <span className={cn(pill, DECISION_STYLE[action])}>
      <CircleCheck className="h-3 w-3" /> Decisão: {action}
    </span>
  );

  return (
    <div className="rounded-lg border border-border/40 bg-secondary/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-crypto-cyan">
          <Brain className="h-3.5 w-3.5" /> Atividade do AI Brain
        </span>
        <span className="truncate text-[9px] font-mono text-muted-foreground">
          {[provider, model].filter(Boolean).join(" · ")} · {(duration_ms / 1000).toFixed(1)}s
        </span>
      </div>

      <ol className="flex flex-wrap items-center gap-1" aria-label="Etapas do agente">
        {tools.length === 0 ? (
          <li className={cn(pill, "bg-zinc-500/10 text-zinc-400 border-zinc-500/30")}>
            <Brain className="h-3 w-3" /> Análise sem ferramentas
          </li>
        ) : (
          tools.map((tool, i) => {
            const style = STATUS_STYLE[tool.status];
            const Icon = style.icon;
            return (
              <Fragment key={`${tool.name}-${i}`}>
                <li
                  className={cn(pill, style.className)}
                  title={`${style.text} · ${tool.duration_ms}ms${tool.error ? ` · ${tool.error}` : tool.summary ? ` · ${tool.summary}` : ""}`}
                >
                  <Icon className="h-3 w-3" />
                  {tool.label}
                  {tool.status === "failed" && <span className="opacity-80">· usando fallback</span>}
                </li>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" aria-hidden />
              </Fragment>
            );
          })
        )}
        {tools.length === 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" aria-hidden />}
        <li>{decision}</li>
      </ol>

      {(agent_error || failedCount > 0 || tools.some((t) => t.summary)) && (
        <ul className="space-y-0.5 text-[10px] font-mono text-muted-foreground">
          {tools.map((tool, i) =>
            tool.error ? (
              <li key={`e-${i}`} className="text-rose-300/90">
                ✕ {tool.label}: {tool.error}
              </li>
            ) : tool.summary ? (
              <li key={`s-${i}`}>
                {tool.status === "fallback" ? "△" : "✓"} {tool.label}: {tool.summary}
              </li>
            ) : null
          )}
          {agent_error && error_reason && <li className="text-rose-300/90">✕ Motor de IA: {error_reason}</li>}
        </ul>
      )}
    </div>
  );
}
