"use client";

import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCryptoStore } from "@/lib/store";
import { invalidateKlineCache } from "@/lib/bot/kline-cache";

const STARTUP_DAYS = 90;
const INTERVAL = "1h";
// Espera o store restaurar os robôs salvos antes de decidir quais moedas baixar.
const SETTLE_MS = 3000;

/**
 * Baixa o histórico de candles (1h, 90 dias) das moedas dos robôs, do BTC (referência
 * do filtro de força) e da moeda aberta no gráfico assim que o app carrega.
 * O download é incremental: depois da primeira vez, só busca os candles que faltam.
 * Moedas novas (robô criado ou moeda trocada no gráfico) são baixadas quando aparecem.
 */
export function HistoryBootstrap() {
  const { bots, chartSymbol } = useCryptoStore(
    useShallow((s) => ({ bots: s.bots, chartSymbol: s.selectedSymbol }))
  );
  const done = useRef(new Set<string>());
  const running = useRef(false);

  const key = useMemo(() => {
    const set = new Set<string>(["BTCUSDT", ...bots.map((b) => b.symbol)]);
    if (chartSymbol) set.add(chartSymbol);
    return Array.from(set).sort().join(",");
  }, [bots, chartSymbol]);

  const latestKey = useRef(key);
  latestKey.current = key;

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (running.current) return; // a execução em andamento pega as moedas novas ao terminar
      running.current = true;
      const tried = new Set<string>();
      try {
        // Repete enquanto surgirem moedas novas durante o download (ex.: store restaurado no meio).
        for (;;) {
          const pending = latestKey.current.split(",").filter((s) => s && !done.current.has(s) && !tried.has(s));
          if (pending.length === 0) break;
          const batch = pending.slice(0, 25);
          batch.forEach((s) => tried.add(s));
          const res = await fetch("/api/market/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbols: batch, interval: INTERVAL, days: STARTUP_DAYS }),
          });
          const json = await res.json().catch(() => null);
          for (const r of json?.results ?? []) {
            if (!r.error) done.current.add(r.symbol);
            else console.warn(`[Histórico] ${r.symbol}: ${r.error}`);
          }
        }
        invalidateKlineCache();
      } catch (e) {
        console.warn("[Histórico] download inicial falhou:", e);
      } finally {
        running.current = false;
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key]);

  return null;
}
