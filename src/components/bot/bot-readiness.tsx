"use client";

import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useCryptoStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
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
  const { bots, tickers, tradingMode, accountSyncedAt, accountSource, binanceTestnet } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      tickers: s.tickers,
      tradingMode: s.tradingMode,
      accountSyncedAt: s.accountSyncedAt,
      accountSource: s.accountSource,
      binanceTestnet: s.binanceTestnet,
    }))
  );

  return useMemo(() => {
    const symbols = Array.from(new Set(bots.map((b) => b.symbol)));
    const missingPrice = symbols.filter((s) => !tickers[s]?.price);
    const missingCandles = symbols.filter((s) => (counts[s] ?? 0) < MIN_CANDLES);
    const live = tradingMode === "live";
    const balanceOk =
      accountSyncedAt !== null && (live ? !!accountSource?.startsWith("binance") : !accountSource?.startsWith("binance"));

    const checks: ReadinessCheck[] = [
      {
        label: "Robôs restaurados",
        ok: restored,
        detail: restored ? `${bots.length} robô(s) carregados` : "lendo a frota salva...",
      },
      {
        label: "Cotações",
        ok: Object.keys(tickers).length > 0 && missingPrice.length === 0,
        detail:
          missingPrice.length === 0
            ? "preços de todas as moedas dos robôs"
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
        label: live ? "Saldo da Binance" : "Saldo simulado",
        ok: balanceOk,
        detail: balanceOk
          ? `sincronizado às ${new Date(accountSyncedAt!).toLocaleTimeString("pt-BR")}`
          : live
            ? "aguardando sincronizar com a Binance"
            : "aguardando o saldo simulado",
      },
    ];

    return {
      ready: checks.every((c) => c.ok),
      checks,
      modeLabel: live ? (binanceTestnet ? "TESTNET" : "REAL") : "SIMULADO",
      pendingResume,
      symbols,
    };
  }, [restored, pendingResume, counts, bots, tickers, tradingMode, accountSyncedAt, accountSource, binanceTestnet]);
}

/**
 * Montado uma vez na página: restaura/salva a frota, acompanha os candles das moedas dos
 * robôs e avisa quando tudo está pronto para operar (de novo a cada troca de modo).
 */
export function BotReadinessWatcher() {
  const { toast } = useToast();
  const readiness = useBotReadiness();
  const notifiedFor = useRef<string | null>(null);
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

/** Faixa de status na Central de Robôs. */
export function BotReadinessBar() {
  const { ready, checks, modeLabel, pendingResume } = useBotReadiness();

  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex flex-col md:flex-row md:items-center gap-3 text-xs",
        ready ? "border-crypto-green/30 bg-crypto-green/5" : "border-amber-500/30 bg-amber-500/5"
      )}
    >
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
  );
}
