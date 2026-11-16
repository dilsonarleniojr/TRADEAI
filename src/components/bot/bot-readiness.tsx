"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useCryptoStore } from "@/lib/store";
import type { ConnectionProbeStatus, ServiceProbeResult } from "@/lib/store/accountSlice";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { getSymbolKlines } from "@/lib/bot/kline-cache";
import { MIN_CANDLES } from "@/lib/bot/entry-engine";
import { resumePendingBots, startBotPersistence, useFleetRestore } from "@/lib/bot/bot-persistence";
import { cn } from "@/lib/utils";

const CHECK_INTERVAL_MS = 5000;

interface KlineState {
  counts: Record<string, number>;
  setCount: (symbol: string, n: number) => void;
}

const useKlineCounts = create<KlineState>((set) => ({
  counts: {},
  setCount: (symbol, n) => set((s) => (s.counts[symbol] === n ? s : { counts: { ...s.counts, [symbol]: n } })),
}));

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** Estado de prontidão dos robôs no modo atual. */
export function useBotReadiness() {
  const restored = useFleetRestore((s) => s.restored);
  const pendingResume = useFleetRestore((s) => s.pendingResume);
  const counts = useKlineCounts((s) => s.counts);
  const {
    bots,
    tickers,
    tradingMode,
    accountSyncedAt,
    accountSource,
    binanceTestnet,
    selectedExchange,
    binanceConnected,
    okxConnected,
    okxSimulated,
    startupHealth,
    runStartupConnectionTests,
  } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      tickers: s.tickers,
      tradingMode: s.tradingMode,
      accountSyncedAt: s.accountSyncedAt,
      accountSource: s.accountSource,
      binanceTestnet: s.binanceTestnet,
      selectedExchange: s.selectedExchange,
      binanceConnected: s.binanceConnected,
      okxConnected: s.okxConnected,
      okxSimulated: s.okxSimulated,
      startupHealth: s.startupHealth,
      runStartupConnectionTests: s.runStartupConnectionTests,
    }))
  );

  return useMemo(() => {
    // Robôs em Auto-Screener ("AUTO" sem override fixo) selecionam ativos dinamicamente no tick;
    // Não existe par de negociação na exchange chamado "AUTO" ou "AUTOUSDT".
    const symbols = Array.from(
      new Set(
        bots
          .map((b) => {
            const override = b.overrideSymbol?.trim().toUpperCase();
            if (override && override !== "AUTO" && override !== "AUTOUSDT" && !override.includes("AUTO")) {
              return override;
            }
            const baseSym = b.symbol?.trim().toUpperCase();
            if (baseSym && baseSym !== "AUTO" && baseSym !== "AUTOUSDT" && !baseSym.includes("AUTO")) {
              return baseSym;
            }
            return null;
          })
          .filter((s): s is string => Boolean(s) && s.endsWith("USDT") && s !== "AUTOUSDT")
      )
    );
    const hasTickers = Object.keys(tickers).length > 0;
    const missingPrice = symbols.filter((s) => !tickers[s]?.price);
    const missingCandles = symbols.filter((s) => (counts[s] ?? 0) < MIN_CANDLES);
    const live = tradingMode === "live";
    const isOkx = selectedExchange === "okx";
    const expectedSourcePrefix = isOkx ? "okx" : "binance";
    const balanceOk =
      accountSyncedAt !== null &&
      (live ? Boolean(accountSource?.startsWith(expectedSourcePrefix)) : !accountSource?.startsWith("binance") && !accountSource?.startsWith("okx"));

    const exchangeLabel = isOkx ? "OKX" : "Binance";

    const checks: ReadinessCheck[] = [
      {
        label: "Robôs restaurados",
        ok: restored,
        detail: restored ? `${bots.length} robô(s) carregados` : "lendo a frota salva...",
      },
      {
        label: "Cotações",
        ok: hasTickers && missingPrice.length === 0,
        detail: !hasTickers
          ? "conectando ao feed de preços..."
          : missingPrice.length === 0
            ? symbols.length > 0
              ? "preços de todas as moedas dos robôs"
              : "cotações do Auto-Screener ativas"
            : `aguardando ${missingPrice.slice(0, 4).map((s) => s.replace("USDT", "")).join(", ")}`,
      },
      {
        label: "Histórico de candles",
        ok: missingCandles.length === 0,
        detail:
          missingCandles.length === 0
            ? `≥ ${MIN_CANDLES} candles de 1h por moeda`
            : `baixando ${missingCandles.slice(0, 4).map((s) => s.replace("USDT", "")).join(", ")}`,
      },
      {
        label: live ? `Saldo da ${exchangeLabel}` : "Saldo simulado",
        ok: balanceOk,
        detail: balanceOk
          ? `sincronizado às ${new Date(accountSyncedAt!).toLocaleTimeString("pt-BR")}`
          : live
            ? `aguardando sincronizar com a ${exchangeLabel}`
            : "aguardando o saldo simulado",
      },
    ];

    const currentModeText = live
      ? isOkx
        ? (okxSimulated ? "OKX DEMO" : "OKX REAL")
        : (binanceTestnet ? "BINANCE TESTNET" : "BINANCE REAL")
      : "SIMULADO";

    return {
      ready: checks.every((c) => c.ok),
      checks,
      modeLabel: currentModeText,
      pendingResume,
      symbols,
      startupHealth,
      runStartupConnectionTests,
    };
  }, [
    restored,
    pendingResume,
    counts,
    bots,
    tickers,
    tradingMode,
    accountSyncedAt,
    accountSource,
    binanceTestnet,
    selectedExchange,
    binanceConnected,
    okxConnected,
    okxSimulated,
    startupHealth,
    runStartupConnectionTests,
  ]);
}

/**
 * Montado uma vez na página: restaura/salva a frota, acompanha os candles das moedas dos
 * robôs e avisa quando tudo está pronto para operar (de novo a cada troca de modo).
 */
export function BotReadinessWatcher() {
  const { toast } = useToast();
  const readiness = useBotReadiness();
  const notifiedFor = useRef<string | null>(null);
  const startupToastSent = useRef<boolean>(false);
  const symbolsKey = readiness.symbols.join(",");

  useEffect(() => startBotPersistence(), []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      for (const s of symbolsKey.split(",").filter(Boolean)) {
        const klines = await getSymbolKlines(s);
        if (!cancelled) useKlineCounts.getState().setCount(s, klines.length);
      }
    };
    refresh();
    const timer = setInterval(refresh, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbolsKey]);

  useEffect(() => {
    const health = readiness.startupHealth;
    if (!health?.lastRunAt || startupToastSent.current) return;
    if (
      health.binance.status === "checking" ||
      health.okx.status === "checking" ||
      health.ai.status === "checking"
    ) {
      return;
    }
    startupToastSent.current = true;

    const results = [health.binance, health.okx, health.ai];
    const hasError = results.some((r) => r.status === "error");
    const hasWarning = results.some((r) => r.status === "warning");

    toast({
      title: hasError
        ? "⚠️ Diagnóstico inicial: falha em conexão"
        : hasWarning
          ? "⚠️ Conexões testadas com alertas"
          : "🔌 Conexões testadas ao abrir",
      description: `Binance: ${health.binance.label} · OKX: ${health.okx.label} · ${health.ai.label}`,
      variant: hasError ? "destructive" : "default",
    });
  }, [readiness.startupHealth, toast]);

  useEffect(() => {
    if (!readiness.ready) {
      // Ficou indisponível (ex.: troca de modo antes do saldo sincronizar): avisa de novo quando voltar.
      if (notifiedFor.current !== readiness.modeLabel) notifiedFor.current = null;
      return;
    }
    if (notifiedFor.current === readiness.modeLabel) return;
    notifiedFor.current = readiness.modeLabel;

    const pending = readiness.pendingResume.length;
    toast({
      title: `✅ Robôs prontos para operar (${readiness.modeLabel})`,
      description: pending
        ? `${pending} robô(s) estavam ligados antes da recarga e foram restaurados pausados.`
        : "Cotações, histórico de candles e saldo sincronizados.",
      action: pending ? (
        <ToastAction altText="Retomar robôs" onClick={() => resumePendingBots()}>
          Retomar {pending}
        </ToastAction>
      ) : undefined,
    });
  }, [readiness.ready, readiness.modeLabel, readiness.pendingResume.length, toast]);

  return null;
}

function probePillClasses(status: ConnectionProbeStatus): string {
  switch (status) {
    case "ok":
      return "border-crypto-green/30 bg-crypto-green/10 text-crypto-green";
    case "warning":
      return "border-amber-500/40 bg-amber-500/15 text-amber-500 dark:text-amber-300";
    case "error":
      return "border-rose-500/40 bg-rose-500/10 text-rose-500 dark:text-rose-300";
    case "checking":
      return "border-sky-500/30 bg-sky-500/10 text-sky-500 dark:text-sky-300";
    case "unconfigured":
    default:
      return "border-border/50 bg-secondary/40 text-muted-foreground";
  }
}

function ProbeIcon({ status }: { status: ConnectionProbeStatus }) {
  switch (status) {
    case "ok":
      return <CheckCircle2 className="w-3 h-3 shrink-0" />;
    case "warning":
      return <AlertTriangle className="w-3 h-3 shrink-0" />;
    case "error":
      return <XCircle className="w-3 h-3 shrink-0" />;
    case "checking":
      return <Loader2 className="w-3 h-3 shrink-0 animate-spin" />;
    default:
      return <XCircle className="w-3 h-3 shrink-0 opacity-60" />;
  }
}

/** Faixa de status na Central de Robôs. */
export function BotReadinessBar() {
  const { ready, checks, modeLabel, pendingResume, startupHealth, runStartupConnectionTests } = useBotReadiness();
  const { toast } = useToast();
  const [retesting, setRetesting] = useState(false);

  const probes: Array<{ key: string; name: string; result: ServiceProbeResult }> = [
    { key: "binance", name: "Binance", result: startupHealth.binance },
    { key: "okx", name: "OKX", result: startupHealth.okx },
    { key: "ai", name: "IA", result: startupHealth.ai },
  ];

  const handleRetest = async () => {
    setRetesting(true);
    try {
      const h = await runStartupConnectionTests();
      const hasErr = h.binance.status === "error" || h.okx.status === "error" || h.ai.status === "error";
      toast({
        title: hasErr ? "⚠️ Teste de conexões concluiu com falha" : "🔌 Teste de conexões concluído",
        description: `Binance: ${h.binance.label} | OKX: ${h.okx.label} | ${h.ai.label}`,
        variant: hasErr ? "destructive" : "default",
      });
    } finally {
      setRetesting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex flex-col gap-2.5 text-xs",
        ready ? "border-crypto-green/30 bg-crypto-green/5" : "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 font-semibold shrink-0">
          {ready ? (
            <CheckCircle2 className="w-4 h-4 text-crypto-green" />
          ) : (
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          )}
          <span className={ready ? "text-crypto-green" : "text-amber-400"}>
            {ready ? `Pronto para operar · ${modeLabel}` : `Preparando robôs · ${modeLabel}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 flex-1">
          {checks.map((c) => (
            <span
              key={c.label}
              title={c.detail}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px]",
                c.ok
                  ? "border-crypto-green/25 bg-crypto-green/10 text-crypto-green"
                  : "border-border/50 bg-secondary/30 text-muted-foreground"
              )}
            >
              {c.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {c.label}
              {!c.ok && <span className="opacity-70">— {c.detail}</span>}
            </span>
          ))}
        </div>

        {pendingResume.length > 0 && (
          <Button
            size="sm"
            onClick={() => resumePendingBots()}
            disabled={!ready}
            title={ready ? "Religar os robôs que estavam ativos" : "Aguarde ficar pronto para retomar"}
            className="h-7 text-xs bg-crypto-green hover:bg-crypto-green/90 text-white shrink-0"
          >
            <Play className="w-3 h-3 mr-1 fill-current" />
            Retomar {pendingResume.length} robô(s)
          </Button>
        )}
      </div>

      {/* Linha de diagnóstico de conexões (Binance, OKX e IA) */}
      <div className="pt-2 border-t border-border/30 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            Conexões:
          </span>
          {probes.map((p) => (
            <span
              key={p.key}
              title={p.result.detail}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium",
                probePillClasses(p.result.status)
              )}
            >
              <ProbeIcon status={p.result.status} />
              <span>{p.result.label}</span>
              {p.result.status !== "checking" && (
                <span className="opacity-75 hidden sm:inline">· {p.result.detail}</span>
              )}
            </span>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetest}
          disabled={retesting}
          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          title="Testar conexões Binance, OKX e IA agora"
        >
          <RefreshCw className={cn("w-3 h-3", retesting && "animate-spin")} />
          <span>{retesting ? "Testando..." : "Testar conexões"}</span>
        </Button>
      </div>
    </div>
  );
}
