"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  usePnLStore,
  useStrategyStore,
  useAlertStore,
  useMicrostructureStore,
  useExecutionStore,
  useBotHealthStore,
  type PnLDataPoint,
  type InstitutionalAlert,
  type MicrostructureData,
} from "@/lib/store/institutional-stores";
import { useCryptoStore } from "@/lib/store";

export function useInstitutionalRealtime() {
  const tradingMode = useCryptoStore((s) => s.tradingMode);

  const updateGlobalPnL = usePnLStore((s) => s.updateGlobalPnL);
  const setSeries = usePnLStore((s) => s.setSeries);
  const setStrategies = useStrategyStore((s) => s.setStrategies);
  const setAlerts = useAlertStore((s) => s.setAlerts);
  const setAllMicrostructures = useMicrostructureStore((s) => s.setAllMicrostructures);
  const updateExecutionMetrics = useExecutionStore((s) => s.updateExecutionMetrics);
  const updateHealthMetrics = useBotHealthStore((s) => s.updateHealthMetrics);

  const isPollingRef = useRef(false);
  const lastSyncTimestampRef = useRef(0);

  const syncMetrics = useCallback(async () => {
    if (isPollingRef.current) return;

    const store = useCryptoStore.getState();
    // Se a aba estiver em segundo plano e não houver posições abertas, economiza CPU e rede
    if (typeof document !== "undefined" && document.hidden) {
      const hasOpen = store.bots.some((b) => b.active && !!b.position && b.position.quantity > 0);
      if (!hasOpen) return;
    }

    isPollingRef.current = true;

    try {
      const modeParam = store.tradingMode === "live" ? "live" : "paper";
      const activeBotsCount = store.bots.filter((b) => b.active).length;
      const totalBotsCount = store.bots.length;

      const res = await fetch(
        `/api/bot/realtime-metrics?mode=${modeParam}&activeBots=${activeBotsCount}&totalBots=${totalBotsCount}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        updateHealthMetrics({
          wsState: "connecting",
          sqliteWalStatus: "CHECKPOINTING",
        });
        return;
      }

      const json = await res.json();
      if (!json.success || !json.data) return;

      const data = json.data;

      // 1. Atualizar usePnLStore
      if (data.globalNetPnl) {
        updateGlobalPnL({
          totalNetPnl: data.globalNetPnl.totalNetPnl ?? 0,
          totalGrossPnl: data.globalNetPnl.totalGrossPnl ?? 0,
          totalFees: data.globalNetPnl.totalFees ?? 0,
          totalSlippage: data.globalNetPnl.totalSlippage ?? 0,
          intradayChangePercent: data.globalNetPnl.intradayChangePercent ?? 0,
          trend5mNet: data.globalNetPnl.trend5mNet ?? 0,
          trend1hNet: data.globalNetPnl.trend1hNet ?? 0,
          trend24hNet: data.globalNetPnl.trend24hNet ?? 0,
        });

        // Construir série temporal a partir dos trades reais da Binance / SQLite
        if (data.liveTradeFeed && Array.isArray(data.liveTradeFeed)) {
          let runningNet = 0;
          let runningGross = 0;
          const chronological = [...data.liveTradeFeed].reverse();

          const points: PnLDataPoint[] = chronological.map((t, idx) => {
            runningNet += t.netPnl;
            runningGross += t.netPnl + (t.feesPaid || 0) + (t.slippageL2 || 0);
            const d = new Date(t.timestamp);
            const timeFormatted = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

            // Mapear marcadores de eventos
            let eventMarker: PnLDataPoint["eventMarker"] = undefined;
            let eventLabel: string | undefined = undefined;

            if (idx === chronological.length - 1 && data.botHealth?.circuitBreaker?.tripped) {
              eventMarker = "CIRCUIT_BREAKER";
              eventLabel = "Circuit Breaker";
            } else if (t.netPnl > 0) {
              eventMarker = "SELL";
              eventLabel = `Take Profit +$${t.netPnl.toFixed(2)}`;
            } else if (Math.abs(t.netPnl) <= 0.05) {
              eventMarker = "BREAK_EVEN";
              eventLabel = "Break-Even Protegido";
            } else {
              eventMarker = "SELL";
              eventLabel = `Stop Loss -$${Math.abs(t.netPnl).toFixed(2)}`;
            }

            return {
              timestamp: d.getTime(),
              timeFormatted,
              netPnl: parseFloat(runningNet.toFixed(2)),
              grossPnl: parseFloat(runningGross.toFixed(2)),
              eventMarker,
              eventLabel,
              strategy: t.strategy,
            };
          });

          // Se a lista estiver vazia ou com poucos pontos, adicionar o ponto de referência agora
          if (points.length === 0) {
            const now = new Date();
            points.push({
              timestamp: now.getTime(),
              timeFormatted: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
              netPnl: data.globalNetPnl.totalNetPnl ?? 0,
              grossPnl: data.globalNetPnl.totalGrossPnl ?? 0,
            });
          }

          setSeries(points);
        }
      }

      // 2. Atualizar useStrategyStore
      if (data.strategies && Array.isArray(data.strategies)) {
        setStrategies(
          data.strategies.map((s: any) => ({
            name: s.name,
            key: s.key,
            totalTrades: s.totalTrades,
            winTrades: s.winTrades,
            lossTrades: s.lossTrades,
            drawTrades: s.drawTrades,
            winRateNet: s.winRateNet,
            grossPnl: s.grossPnl,
            feesPaid: s.feesPaid,
            slippageEstimated: s.slippageEstimated,
            netPnl: s.netPnl,
            payoffRatio: s.payoffRatio,
            maxDrawdownPercent: s.maxDrawdownPercent,
            status: s.status,
            statusEmoji: s.statusEmoji,
          }))
        );
      }

      // 3. Atualizar useAlertStore (Alertas Preditivos IA com Severidade e Recomendações)
      if (data.predictiveAlerts && Array.isArray(data.predictiveAlerts)) {
        const institutionalAlerts: InstitutionalAlert[] = data.predictiveAlerts.map((a: any) => {
          let sev: InstitutionalAlert["severity"] = "info";
          if (a.type === "risco" && a.confidencePercent >= 80) sev = "critico";
          else if (a.type === "risco") sev = "risco";
          else if (a.type === "aviso") sev = "atencao";
          else sev = "info";

          let cat: InstitutionalAlert["category"] = "PnL";
          if (a.category === "microestrutura") cat = "OFI";
          else if (a.category === "slippage") cat = "Slippage";
          else if (a.category === "saude") cat = "Saúde";
          else if (a.category === "risco") cat = "Risco";
          else cat = "PnL";

          return {
            id: a.id,
            category: cat,
            severity: sev,
            score: a.confidencePercent || 75,
            title: a.title,
            prediction: a.prediction,
            triggerReason: a.triggerReason,
            recommendedAction: a.recommendedAction,
            context: {
              strategy: a.metrics?.strategy ? String(a.metrics.strategy) : undefined,
              pair: a.symbol,
              botId: a.metrics?.botId ? String(a.metrics.botId) : undefined,
            },
            timestamp: a.timestamp,
          };
        });

        // Incluir alertas do sistema caso existam
        if (data.alerts && Array.isArray(data.alerts)) {
          data.alerts.forEach((sysAlert: any) => {
            const exists = institutionalAlerts.some((x) => x.id === sysAlert.id);
            if (!exists) {
              institutionalAlerts.push({
                id: sysAlert.id,
                category: "Saúde",
                severity: sysAlert.type === "error" ? "critico" : sysAlert.type === "warning" ? "atencao" : "info",
                score: 95,
                title: "Diagnóstico Operacional do Sistema",
                prediction: sysAlert.message,
                triggerReason: "Telemetria Contínua da Frota",
                recommendedAction: "Monitorar parâmetros em tempo real",
                context: {},
                timestamp: new Date(sysAlert.timestamp).toISOString(),
              });
            }
          });
        }

        setAlerts(institutionalAlerts);
      }

      // 4. Atualizar useMicrostructureStore (Livro L2 + OFI)
      if (data.executionAndRisk?.orderFlowImbalanceBySymbol) {
        const microMap: Record<string, MicrostructureData> = {};
        const symbolsObj = data.executionAndRisk.orderFlowImbalanceBySymbol;

        for (const [sym, item] of Object.entries<any>(symbolsObj)) {
          const ofi = item.orderFlowImbalance ?? 0;
          const spread = item.spreadPercent ?? 0.05;

          // Determinar estado preditivo da microestrutura
          let predState: MicrostructureData["predictiveAlert"] = "NORMAL";
          if (ofi > 0.45) predState = "ROMPIMENTO";
          else if (ofi < -0.45) predState = "REVERSAO";
          else if (spread > 0.20 || item.bidVolumeUsd < 5000) predState = "COLAPSO_LIQUIDEZ";

          // Sintetizar profundidade baseada nas ofertas reais coletadas
          const bestBid = item.bestBid || 68000;
          const bestAsk = item.bestAsk || 68010;
          const bidVol = item.bidVolumeUsd || 45000;
          const askVol = item.askVolumeUsd || 40000;

          const depthBids = [
            { price: bestBid, amount: bidVol * 0.35, total: bidVol * 0.35 },
            { price: bestBid * 0.999, amount: bidVol * 0.25, total: bidVol * 0.60 },
            { price: bestBid * 0.998, amount: bidVol * 0.20, total: bidVol * 0.80 },
            { price: bestBid * 0.997, amount: bidVol * 0.20, total: bidVol },
          ];

          const depthAsks = [
            { price: bestAsk, amount: askVol * 0.35, total: askVol * 0.35 },
            { price: bestAsk * 1.001, amount: askVol * 0.25, total: askVol * 0.60 },
            { price: bestAsk * 1.002, amount: askVol * 0.20, total: askVol * 0.80 },
            { price: bestAsk * 1.003, amount: askVol * 0.20, total: askVol },
          ];

          microMap[sym] = {
            symbol: sym,
            bestBid,
            bestAsk,
            spreadPercent: spread,
            orderFlowImbalance: ofi,
            bidVolumeUsd: item.bidVolumeUsd || 0,
            askVolumeUsd: item.askVolumeUsd || 0,
            aggressiveBuyVolumeUsd: Math.round((item.bidVolumeUsd || 0) * (item.buyerPercent ? item.buyerPercent / 100 : 0.5)),
            aggressiveSellVolumeUsd: Math.round((item.askVolumeUsd || 0) * (item.sellerPercent ? item.sellerPercent / 100 : 0.5)),
            estimatedSlippagePercent: item.estimatedSlippagePercent || 0.05,
            depthBids,
            depthAsks,
            predictiveAlert: predState,
            predictiveConfidence: Math.min(99, Math.round(Math.abs(ofi) * 40 + 60)),
            lastUpdate: Date.now(),
          };
        }

        setAllMicrostructures(microMap);
      }

      // 5. Atualizar useExecutionStore
      if (data.executionAndRisk) {
        updateExecutionMetrics({
          avgSlippageLast10Percent: data.executionAndRisk.avgSlippageLast10Percent ?? 0.05,
          dailyCumulativeFeesUsd: data.executionAndRisk.dailyCumulativeFeesUsd ?? 0,
          rejectedOrdersCount: data.executionAndRisk.rejectedOrders?.total ?? 0,
        });
      }

      // 6. Atualizar useBotHealthStore
      if (data.botHealth) {
        const activeBots = data.botHealth.activeBotsCount ?? 0;
        const totalBots = data.botHealth.totalBotsCount ?? 6;
        const pausedBots = data.botHealth.pausedBotsCount ?? 0;

        let globalBotState: "active" | "observation" | "paused" = "active";
        if (data.botHealth.circuitBreaker?.tripped || activeBots === 0) {
          globalBotState = "paused";
        } else if (pausedBots > 0 || (data.aiModelScores?.botHealth?.status === "ATENCAO")) {
          globalBotState = "observation";
        }

        updateHealthMetrics({
          globalBotState,
          activeBotsCount: activeBots,
          pausedBotsCount: pausedBots,
          totalBotsCount: totalBots,
          mutexBuysCount: data.botHealth.mutexes?.activeBuys ?? 0,
          mutexSellsCount: data.botHealth.mutexes?.activeSells ?? 0,
          zeroDuplicatesActive: true,
          wsState: "connected",
          sqliteWalStatus: data.sqliteAuditVerification?.divergenceDetected ? "ERROR" : "WAL_SYNCED",
          sqliteDivergenceDetected: !!data.sqliteAuditVerification?.divergenceDetected,
          sqliteAuditedTradesCount: data.sqliteAuditVerification?.totalTradesAudited ?? useCryptoStore.getState().trades.length,
          circuitBreakerTripped: !!data.botHealth.circuitBreaker?.tripped,
          circuitBreakerReason: data.botHealth.circuitBreaker?.reason,
          circuitBreakerLossUsd: data.botHealth.circuitBreaker?.accumulatedDailyLossUsd ?? 0,
          circuitBreakerLimitUsd: data.botHealth.circuitBreaker?.dailyLossLimitUsd ?? 15,
        });
      }
    } catch (err) {
      console.warn("[InstitutionalSync] Erro na sincronização:", err);
      updateHealthMetrics({ wsState: "connecting" });
    } finally {
      isPollingRef.current = false;
      lastSyncTimestampRef.current = Date.now();
    }
  }, [
    updateGlobalPnL,
    setSeries,
    setStrategies,
    setAlerts,
    setAllMicrostructures,
    updateExecutionMetrics,
    updateHealthMetrics,
  ]);

  useEffect(() => {
    // Sincronização inicial imediata ao montar ou mudar modo
    void syncMetrics();

    // Loop de telemetria estável a cada 4s (precisão institucional sem sobrecarregar a UI)
    const interval = setInterval(() => {
      void syncMetrics();
    }, 4000);

    return () => clearInterval(interval);
  }, [tradingMode, syncMetrics]);

  return { syncMetrics };
}
