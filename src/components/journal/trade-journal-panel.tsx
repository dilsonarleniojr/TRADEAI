"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  tradeJournalEngine,
  type TradeJournalRecord,
  type PerformanceMetrics,
  type JournalFilterOptions,
  type BotExecutionEventPayload,
  type JournalPersistenceStats,
  type LongHorizonWindow,
  type ColdTierCompactionReport,
} from "@/lib/journal/trade-journal-engine";
import { lttbDownsample } from "@/lib/performance/lttb";
import {
  telegramNotificationService,
  type TelegramConfig,
} from "@/lib/telegram/telegram-service";
import {
  orderFlowAnomalyScanner,
  type AnomalyAlert,
} from "@/lib/order-flow/anomaly-scanner";
import {
  buildPostTradeCoTPrompt,
  calculateBipartiteExcursionWidths,
  calculateMfeCaptureEfficiency,
  computeUnderwaterDrawdownSeries,
  type UnderwaterPoint,
} from "@/lib/journal/post-trade-copilot-prompt";
import { useCryptoStore } from "@/lib/store";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Flame,
  LineChart,
  RefreshCw,
  Send,
  ShieldAlert,
  Sliders,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

type QuickFilterChip =
  | "ALL"
  | "DIRECT_AI"
  | "LIVE_FLEET"
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "HIGH_EFF_MFE";

const VIRTUAL_ROW_HEIGHT = 54;
const VIRTUAL_OVERSCAN = 6;
const VIRTUAL_VIEWPORT_HEIGHT = 486;

interface DualLayerEquityCurveViewportProps {
  equityCurve: Array<{ timestamp: number; equity: number }>;
  showUnderwaterDrawdown: boolean;
}

/**
 * Subcomponente Isolado (React.memo) para a Curva de Patrimônio Dual-Layer + Crosshair.
 * - Evita re-renderizar o TradeJournalPanel inteiro, os 6 KPIs e a tabela pós-trade a cada movimento do mouse em 144Hz.
 * - Memoiza a amostragem LTTB, o cálculo de Underwater Drawdown e as strings de caminho SVG (zero alocações na heap durante hover).
 */
const DualLayerEquityCurveViewport = React.memo(function DualLayerEquityCurveViewport({
  equityCurve,
  showUnderwaterDrawdown,
}: DualLayerEquityCurveViewportProps) {
  const [hoveredCurvePoint, setHoveredCurvePoint] = useState<{
    x: number;
    y: number;
    point: UnderwaterPoint;
    index: number;
  } | null>(null);

  const geometry = useMemo(() => {
    if (equityCurve.length <= 1) return null;
    const points =
      equityCurve.length > 200
        ? lttbDownsample(equityCurve, 60, {
            getX: (_, i) => i,
            getY: (p) => p.equity,
          })
        : equityCurve;

    const underwaterSeries = computeUnderwaterDrawdownSeries(points);
    let minEq = Infinity;
    let maxEq = -Infinity;
    let maxAbsDd = 1;

    for (let i = 0; i < underwaterSeries.length; i++) {
      const u = underwaterSeries[i];
      if (u.equity < minEq) minEq = u.equity;
      if (u.equity > maxEq) maxEq = u.equity;
      const absDd = Math.abs(u.drawdownPercent);
      if (absDd > maxAbsDd) maxAbsDd = absDd;
    }

    minEq *= 0.995;
    maxEq *= 1.005;
    const range = maxEq - minEq || 1;
    const denom = Math.max(1, underwaterSeries.length - 1);

    const coords = new Array<{
      x: number;
      y: number;
      ddY: number;
      p: UnderwaterPoint;
      idx: number;
    }>(underwaterSeries.length);

    let pathD = "";
    let ddPathD = "";

    for (let idx = 0; idx < underwaterSeries.length; idx++) {
      const p = underwaterSeries[idx];
      const x = (idx / denom) * 790 + 5;
      const y = 150 - ((p.equity - minEq) / range) * 135;
      const ddY = 8 + (Math.abs(p.drawdownPercent) / maxAbsDd) * 45;
      coords[idx] = { x, y, ddY, p, idx };
      const cmd = idx === 0 ? "M" : "L";
      pathD += ` ${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`;
      ddPathD += ` ${cmd} ${x.toFixed(1)} ${ddY.toFixed(1)}`;
    }

    const lastX = coords[coords.length - 1].x.toFixed(1);
    const firstX = coords[0].x.toFixed(1);
    const areaD = `${pathD} L ${lastX} 160 L ${firstX} 160 Z`;
    const ddAreaD = `${ddPathD} L ${lastX} 8 L ${firstX} 8 Z`;

    return { coords, pathD, areaD, ddPathD, ddAreaD };
  }, [equityCurve]);

  return (
    <div style={{ contain: "layout paint" }}>
      {/* Barra de Inspeção Crosshair Ponto-a-Ponto (Isolada do restante da árvore DOM) */}
      {hoveredCurvePoint && (
        <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-[#0b0e14] border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
          <div className="flex items-center gap-3">
            <span className="text-cyan-400 font-semibold">
              Ponto #{hoveredCurvePoint.index + 1}
            </span>
            <span className="text-slate-300">
              {new Date(hoveredCurvePoint.point.timestamp)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19)}{" "}
              UTC
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-300">
              Patrimônio:{" "}
              <strong className="text-emerald-400">
                ${hoveredCurvePoint.point.equity.toFixed(2)}
              </strong>
            </span>
            <span className="text-slate-300">
              Variação:{" "}
              <strong
                className={
                  hoveredCurvePoint.point.deltaPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }
              >
                {hoveredCurvePoint.point.deltaPnl >= 0 ? "+" : ""}
                ${hoveredCurvePoint.point.deltaPnl.toFixed(2)}
              </strong>
            </span>
            <span className="text-slate-300">
              Underwater DD:{" "}
              <strong className="text-rose-400">
                {hoveredCurvePoint.point.drawdownPercent.toFixed(2)}%
              </strong>
            </span>
          </div>
        </div>
      )}

      <div
        className="w-full h-48 relative bg-[#090d16] rounded-lg border border-[#1a2333] emerald-border-glow p-2 flex items-center justify-center overflow-hidden"
        onMouseLeave={() => setHoveredCurvePoint(null)}
      >
        {!geometry ? (
          <div className="flex flex-col items-center justify-center gap-2 text-center px-4">
            <div className="p-2 rounded-full bg-slate-800/80 border border-slate-700 text-emerald-400">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-slate-200">
              Aguardando encerramento de trades para plotar a curva de patrimônio contínua.
            </p>
            <p className="text-xs text-slate-400">
              Eventos de <code className="text-emerald-300">PARTIAL_TAKE_PROFIT</code> e fechamentos finais atualizam o gráfico em tempo real via BroadcastChannel.
            </p>
          </div>
        ) : (
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 160">
            <line
              x1="0"
              y1="80"
              x2="800"
              y2="80"
              stroke="#223046"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <g>
              {showUnderwaterDrawdown && (
                <>
                  <path d={geometry.ddAreaD} fill="rgba(244, 63, 94, 0.14)" />
                  <path
                    d={geometry.ddPathD}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                </>
              )}

              <path d={geometry.areaD} className="svg-fill-emerald" />
              <path
                d={geometry.pathD}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {hoveredCurvePoint && (
                <line
                  x1={hoveredCurvePoint.x}
                  y1="0"
                  x2={hoveredCurvePoint.x}
                  y2="160"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
              )}

              {geometry.coords.map((c, i) => (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r={hoveredCurvePoint?.index === c.idx ? "5.5" : "3.5"}
                  fill={c.p.deltaPnl >= 0 ? "#10b981" : "#f43f5e"}
                  stroke="#0b0e14"
                  strokeWidth="1.5"
                  className="cursor-pointer transition-all duration-100"
                  onMouseEnter={() =>
                    setHoveredCurvePoint({
                      x: c.x,
                      y: c.y,
                      point: c.p,
                      index: c.idx,
                    })
                  }
                />
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
});

interface VirtualPostTradeRowProps {
  record: TradeJournalRecord;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAuditRow: (id: string) => void;
}

/**
 * Linha Virtualizada Memoizada (React.memo) para eliminar re-renderizações desnecessárias
 * durante rolagem (Windowing O(1)) ou navegação por teclado (J/K).
 */
const VirtualPostTradeRow = React.memo(function VirtualPostTradeRow({
  record: r,
  isSelected,
  onSelect,
  onAuditRow,
}: VirtualPostTradeRowProps) {
  const isWin = r.netPnl >= 0;
  const bipartite = calculateBipartiteExcursionWidths(r.maePercent, r.mfePercent);
  const mfeCaptureEff = calculateMfeCaptureEfficiency(r.netGainPercent, r.mfePercent);

  return (
    <tr
      aria-selected={isSelected}
      style={{ height: `${VIRTUAL_ROW_HEIGHT}px` }}
      onClick={() => onSelect(r.id)}
      onDoubleClick={() => onAuditRow(r.id)}
      className={`transition-colors duration-100 cursor-pointer ${
        isSelected
          ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/40"
          : "hover:bg-[#151f33]"
      }`}
    >
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          {isWin ? (
            <ArrowUpRight className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <div>
            <span className="font-bold text-white text-xs">{r.symbol}</span>
            <span className="text-[11px] text-slate-300 block font-sans truncate max-w-[140px]">
              {r.botName}
            </span>
          </div>
        </div>
      </td>

      <td className="py-2.5 px-3 font-sans">
        {r.mode === "live" ? (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            LIVE
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 border border-blue-500/30 text-blue-300">
            PAPER
          </span>
        )}
      </td>

      <td className="py-2.5 px-3">
        <div className="text-slate-200">${r.entryPrice.toFixed(4)}</div>
        <div className="text-[11px] text-slate-400">→ ${r.exitPrice.toFixed(4)}</div>
      </td>

      <td className="py-2.5 px-3 text-slate-200 font-sans text-xs">
        {r.durationFormatted}
      </td>

      <td className="py-2.5 px-3 text-right">
        <span className={`font-bold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
          {isWin ? "+" : ""}${r.netPnl.toFixed(2)}
        </span>
        <span
          className={`block text-[11px] ${
            isWin ? "text-emerald-400/90" : "text-rose-400/90"
          }`}
        >
          {isWin ? "+" : ""}{r.netGainPercent.toFixed(2)}%
        </span>
      </td>

      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 min-w-[175px]">
          <span className="text-[11px] font-bold text-rose-400 w-12 text-right">
            {r.maePercent.toFixed(2)}%
          </span>
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex border border-slate-700/80">
            <div
              className="bg-rose-500 h-full"
              style={{ width: `${bipartite.maeWidthPercent}%` }}
              title={`MAE (Excursão Adversa): ${r.maePercent.toFixed(2)}%`}
            />
            <div
              className="bg-emerald-500 h-full"
              style={{ width: `${bipartite.mfeWidthPercent}%` }}
              title={`MFE (Excursão Favorável): +${r.mfePercent.toFixed(2)}%`}
            />
          </div>
          <span className="text-[11px] font-bold text-emerald-400 w-12">
            +{r.mfePercent.toFixed(2)}%
          </span>
        </div>
      </td>

      <td className="py-2.5 px-3 text-center">
        <span
          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
            mfeCaptureEff >= 70
              ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
              : mfeCaptureEff >= 40
              ? "bg-amber-500/15 border-amber-500/35 text-amber-300"
              : "bg-slate-800 border-slate-700 text-slate-300"
          }`}
          title="Porcentagem do pico de lucro aberto (MFE) efetivamente embolsada no fechamento líquido"
        >
          {mfeCaptureEff.toFixed(0)}%
        </span>
      </td>

      <td className="py-2.5 px-3 text-right text-slate-400">
        ${(r.commissionFeesUsd + r.spreadCostUsd).toFixed(3)}
      </td>

      <td
        className="py-2.5 px-4 font-sans text-slate-300 text-[11px] max-w-[180px] truncate"
        title={r.exitReason}
      >
        {r.exitReason}
      </td>
    </tr>
  );
});

export function TradeJournalPanel() {
  const [records, setRecords] = useState<TradeJournalRecord[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(() =>
    tradeJournalEngine.calculateMetrics([])
  );
  const [filterMode, setFilterMode] = useState<"all" | "live" | "paper">("all");
  const [filterOutcome, setFilterOutcome] = useState<"all" | "win" | "loss">("all");
  const [searchSymbol, setSearchSymbol] = useState<string>("");
  const [quickChip, setQuickChip] = useState<QuickFilterChip>("ALL");
  const [horizonWindow, setHorizonWindow] = useState<LongHorizonWindow>("LIVE");
  const [showUnderwaterDrawdown, setShowUnderwaterDrawdown] = useState<boolean>(true);
  const [showCoTPromptDrawer, setShowCoTPromptDrawer] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState<number>(0);
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [isCompacting, setIsCompacting] = useState<boolean>(false);
  const triggerQuantCopilotInstantAudit = useCryptoStore(
    (s) => s.triggerQuantCopilotInstantAudit
  );
  const [compactionReport, setCompactionReport] = useState<ColdTierCompactionReport | null>(() =>
    tradeJournalEngine.getLastCompactionReport()
  );
  const [activeTab, setActiveTab] = useState<"journal" | "telegram" | "orderflow">("journal");

  // Estado do Telegram
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() =>
    telegramNotificationService.getConfig()
  );
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Estado de Anomalias de Order Flow
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [lastLiveExecution, setLastLiveExecution] = useState<{
    record: TradeJournalRecord;
    event: BotExecutionEventPayload;
  } | null>(null);
  const [persistenceStats, setPersistenceStats] = useState<JournalPersistenceStats>(() =>
    tradeJournalEngine.getPersistenceStats()
  );

  // V-Sync Frame Coalescer (requestAnimationFrame) para suprimir cascatas de re-render em rajadas de alta frequência
  const rafFrameIdRef = useRef<number | null>(null);
  const pendingRecordsRef = useRef<TradeJournalRecord[] | null>(null);
  const pendingLiveExecRef = useRef<{
    record: TradeJournalRecord;
    event: BotExecutionEventPayload;
  } | null>(null);
  const pendingPersistenceRef = useRef<JournalPersistenceStats | null>(null);

  useEffect(() => {
    const scheduleVsyncCommit = () => {
      if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        if (pendingRecordsRef.current) {
          setRecords(pendingRecordsRef.current);
          pendingRecordsRef.current = null;
        }
        if (pendingLiveExecRef.current) {
          setLastLiveExecution(pendingLiveExecRef.current);
          pendingLiveExecRef.current = null;
        }
        if (pendingPersistenceRef.current) {
          setPersistenceStats(pendingPersistenceRef.current);
          pendingPersistenceRef.current = null;
        }
        return;
      }
      if (rafFrameIdRef.current !== null) return;
      rafFrameIdRef.current = window.requestAnimationFrame(() => {
        rafFrameIdRef.current = null;
        if (pendingRecordsRef.current) {
          setRecords(pendingRecordsRef.current);
          pendingRecordsRef.current = null;
        }
        if (pendingLiveExecRef.current) {
          setLastLiveExecution(pendingLiveExecRef.current);
          pendingLiveExecRef.current = null;
        }
        if (pendingPersistenceRef.current) {
          setPersistenceStats(pendingPersistenceRef.current);
          pendingPersistenceRef.current = null;
        }
      });
    };

    const unsubJournal = tradeJournalEngine.subscribe((updatedList) => {
      pendingRecordsRef.current = updatedList;
      scheduleVsyncCommit();
    });

    const unsubExecutionBus = tradeJournalEngine.subscribeExecutionEvents((rec, evt) => {
      pendingLiveExecRef.current = { record: rec, event: evt };
      scheduleVsyncCommit();
    });

    const unsubPersistence = tradeJournalEngine.subscribePersistenceStats((stats) => {
      pendingPersistenceRef.current = stats;
      scheduleVsyncCommit();
    });

    const unsubAnomalies = orderFlowAnomalyScanner.subscribe(() => {
      setAnomalies(orderFlowAnomalyScanner.getRecentAlerts(20));
    });
    setAnomalies(orderFlowAnomalyScanner.getRecentAlerts(20));

    return () => {
      if (
        rafFrameIdRef.current !== null &&
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(rafFrameIdRef.current);
      }
      unsubJournal();
      unsubExecutionBus();
      unsubPersistence();
      unsubAnomalies();
    };
  }, []);

  // Filtragem dinâmica + Quick Filter Chips em 1 clique
  const filteredRecords = useMemo(() => {
    const filters: JournalFilterOptions = {
      mode: filterMode,
      outcome: filterOutcome,
      symbol: searchSymbol.trim() ? searchSymbol.trim() : undefined,
    };
    const base = tradeJournalEngine.getFilteredRecords(filters);
    if (quickChip === "ALL") return base;

    return base.filter((r) => {
      const botLower = r.botName.toLowerCase();
      const reasonUpper = r.exitReason.toUpperCase();
      if (quickChip === "DIRECT_AI") {
        return botLower.includes("direct") || r.botId.includes("direct");
      }
      if (quickChip === "LIVE_FLEET") {
        return !botLower.includes("direct") && !r.botId.includes("direct");
      }
      if (quickChip === "TAKE_PROFIT") {
        return reasonUpper.includes("TP") || reasonUpper.includes("TAKE") || reasonUpper.includes("ALVO");
      }
      if (quickChip === "STOP_LOSS") {
        return reasonUpper.includes("SL") || reasonUpper.includes("STOP");
      }
      if (quickChip === "HIGH_EFF_MFE") {
        return calculateMfeCaptureEfficiency(r.netGainPercent, r.mfePercent) >= 70;
      }
      return true;
    });
  }, [records, filterMode, filterOutcome, searchSymbol, quickChip]);

  const selectedRecord = useMemo(
    () =>
      filteredRecords.find((r) => r.id === selectedRecordId) ??
      filteredRecords[0] ??
      null,
    [filteredRecords, selectedRecordId]
  );

  const handleSelectRow = useCallback((id: string) => {
    setSelectedRecordId(id);
  }, []);

  const handleAuditRow = useCallback((id: string) => {
    setSelectedRecordId(id);
    setShowCoTPromptDrawer(true);
  }, []);

  // Janela Virtual O(1) para a Tabela Pós-Trade (Zero-DOM Windowing para > 50.000 trades)
  const virtualWindow = useMemo(() => {
    const totalCount = filteredRecords.length;
    if (totalCount === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        visibleRows: [] as TradeJournalRecord[],
        topPaddingHeight: 0,
        bottomPaddingHeight: 0,
      };
    }
    const visibleCount = Math.ceil(VIRTUAL_VIEWPORT_HEIGHT / VIRTUAL_ROW_HEIGHT);
    const rawStart = Math.floor(tableScrollTop / VIRTUAL_ROW_HEIGHT);
    const startIndex = Math.max(0, rawStart - VIRTUAL_OVERSCAN);
    const endIndex = Math.min(totalCount, rawStart + visibleCount + VIRTUAL_OVERSCAN);

    return {
      startIndex,
      endIndex,
      visibleRows: filteredRecords.slice(startIndex, endIndex),
      topPaddingHeight: startIndex * VIRTUAL_ROW_HEIGHT,
      bottomPaddingHeight: Math.max(0, (totalCount - endIndex) * VIRTUAL_ROW_HEIGHT),
    };
  }, [filteredRecords, tableScrollTop]);

  // Navegação por Teclado Estilo Vim/Trading Desk (J/K ou Setas + Enter/Escape) com Auto-Scroll Virtual
  const handleTableKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (filteredRecords.length === 0) return;
    const currentIndex = filteredRecords.findIndex((r) => r.id === selectedRecord?.id);
    if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx =
        currentIndex < 0 ? 0 : Math.min(filteredRecords.length - 1, currentIndex + 1);
      setSelectedRecordId(filteredRecords[nextIdx].id);
      if (tableViewportRef.current) {
        const rowBottom = (nextIdx + 1) * VIRTUAL_ROW_HEIGHT;
        const viewBottom =
          tableViewportRef.current.scrollTop + tableViewportRef.current.clientHeight;
        if (rowBottom > viewBottom) {
          tableViewportRef.current.scrollTop =
            rowBottom - tableViewportRef.current.clientHeight + VIRTUAL_ROW_HEIGHT;
        }
      }
    } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = currentIndex <= 0 ? 0 : currentIndex - 1;
      setSelectedRecordId(filteredRecords[prevIdx].id);
      if (tableViewportRef.current) {
        const rowTop = prevIdx * VIRTUAL_ROW_HEIGHT;
        if (rowTop < tableViewportRef.current.scrollTop) {
          tableViewportRef.current.scrollTop = Math.max(0, rowTop - VIRTUAL_ROW_HEIGHT);
        }
      }
    } else if (e.key === "Enter" && selectedRecord) {
      e.preventDefault();
      setShowCoTPromptDrawer(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelectedRecordId(null);
    }
  };

  // Prompt Chain-of-Thought Institucional & Diagnóstico Clear-Box reativo ao trade selecionado
  const copilotBundle = useMemo(
    () =>
      buildPostTradeCoTPrompt({
        metrics,
        horizonWindow,
        anomalies,
        lastRecord: selectedRecord,
      }),
    [metrics, horizonWindow, anomalies, selectedRecord]
  );

  const handleCopyCoTPrompt = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(copilotBundle.promptText).catch(() => {});
    }
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Recálculo de métricas com base no filtro ou na tabela Daily Rollup O(1) para janelas 30D/90D/1Y/ALL
  useEffect(() => {
    if (horizonWindow === "LIVE") {
      const calculated = tradeJournalEngine.calculateMetrics(filteredRecords, 1000);
      setMetrics(calculated);
    } else {
      const rollupMetrics = tradeJournalEngine.getLongHorizonMetricsO1(
        horizonWindow,
        filterMode,
        1000
      );
      setMetrics(rollupMetrics);
    }
  }, [filteredRecords, horizonWindow, filterMode]);

  const hasActiveFilters =
    filterMode !== "all" ||
    filterOutcome !== "all" ||
    searchSymbol.trim().length > 0 ||
    quickChip !== "ALL";

  const handleResetFilters = () => {
    setFilterMode("all");
    setFilterOutcome("all");
    setSearchSymbol("");
    setQuickChip("ALL");
  };

  const handleRunColdTierCompaction = async () => {
    if (isCompacting) return;
    setIsCompacting(true);
    try {
      const report = tradeJournalEngine.runColdTierCompaction(records, 10000, {
        includeColumnarArchive: true,
      });
      setCompactionReport(report);
      await fetch("/api/journal/rollup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialCapital: 10000 }),
      });
    } catch {
      // Ignora falha de rede se offline
    } finally {
      setIsCompacting(false);
    }
  };

  // Ações de Exportação
  const handleExportCsv = () => {
    const csvContent = tradeJournalEngine.exportToCsv(filteredRecords);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tradeai_journal_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    const jsonContent = tradeJournalEngine.exportToJson(filteredRecords);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tradeai_journal_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Teste de conexão Telegram
  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await telegramNotificationService.testConnection(
        telegramConfig.botToken,
        telegramConfig.chatId
      );
      setTelegramTestResult(res);
      if (res.success) {
        telegramNotificationService.updateConfig(telegramConfig);
      }
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSaveTelegramConfig = () => {
    telegramNotificationService.updateConfig(telegramConfig);
    setTelegramTestResult({
      success: true,
      message: "Configurações do Telegram salvas e ativas com sucesso!",
    });
  };

  return (
    <div className="w-full bg-[#0b0e14] border border-[#1f2937] rounded-xl overflow-hidden shadow-2xl text-slate-200">
      {/* Header com Abas de Navegação e CTA Primário (4/8pt Grid: px-6=24px, py-4=16px, gap-4=16px) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1f2937] bg-[#111827]/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <LineChart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Trade Journal &amp; Performance Engine
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono">
                v2.6 Institutional
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Análise Pós-Trade, Rastreamento MAE/MFE, Desbalanceamento L2 e Notificações Remotas
            </p>
          </div>
        </div>

        {/* Cluster de Ação Primária (CTA) + Abas de Navegação */}
        <div className="flex flex-wrap items-center gap-3">
          {/* CTA Primário: Auditoria Copiloto Quant Pós-Trade (Destaque de Hierarquia Visual) */}
          <button
            type="button"
            onClick={() => setShowCoTPromptDrawer((prev) => !prev)}
            aria-expanded={showCoTPromptDrawer}
            className={`inline-flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-bold tracking-wide transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.98] ${
              showCoTPromptDrawer
                ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25 border border-cyan-300"
                : "bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20"
            }`}
          >
            <Brain className="w-4 h-4 shrink-0" />
            <span>{showCoTPromptDrawer ? "Ocultar Copiloto Quant" : "Auditar com Copiloto Quant"}</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-950/25 text-slate-950 font-mono text-xs font-extrabold">
              Alt+J
            </kbd>
          </button>

          {/* Abas Secundárias (Segmented Control 8pt Grid) */}
          <div
            role="tablist"
            aria-label="Seções do Trade Journal"
            className="flex items-center gap-1 bg-[#141c2b] p-1 rounded-lg border border-[#2d3748]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "journal"}
              onClick={() => setActiveTab("journal")}
              className={`h-8 px-3 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-[0.98] ${
                activeTab === "journal"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              Diário de Trades
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "orderflow"}
              onClick={() => setActiveTab("orderflow")}
              className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 active:scale-[0.98] ${
                activeTab === "orderflow"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Order Flow &amp; RVOL
              {anomalies.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "telegram"}
              onClick={() => setActiveTab("telegram")}
              className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-[0.98] ${
                activeTab === "telegram"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              Telegram Bot
              {telegramConfig.enabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal (p-6 = 24px) */}
      <div className="p-6">
        {/* ABA 1: DIÁRIO DE TRADES */}
        {activeTab === "journal" && (
          <div className="space-y-6">
            {/* Grade de KPIs Institucionais (Escala 4/8pt: gap-4=16px, p-4=16px, tipografia WCAG AA) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-[#131b2a] border border-[#1f2937] hover:border-slate-700 p-4 rounded-xl transition-colors">
                <span className="text-xs text-slate-300 uppercase tracking-wider block font-semibold">
                  Net PnL Líquido
                </span>
                <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                  <span
                    className={`text-xl font-bold font-mono ${
                      metrics.totalNetPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {metrics.totalNetPnl >= 0 ? "+" : ""}${metrics.totalNetPnl.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">USD</span>
                </div>
                <span className="text-xs text-slate-300 mt-1.5 block font-mono tabular-nums">
                  Taxas: -${metrics.totalFees.toFixed(2)} USD
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] hover:border-slate-700 p-4 rounded-xl transition-colors">
                <span className="text-xs text-slate-300 uppercase tracking-wider block font-semibold">
                  Taxa de Acerto
                </span>
                <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-xl font-bold font-mono text-white">
                    {metrics.winRate.toFixed(1)}%
                  </span>
                </div>
                <span className="text-xs text-slate-300 mt-1.5 block font-mono tabular-nums">
                  {metrics.winTrades}W / {metrics.lossTrades}L ({metrics.totalTrades} trades)
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] hover:border-slate-700 p-4 rounded-xl transition-colors">
                <span className="text-xs text-slate-300 uppercase tracking-wider block font-semibold">
                  Profit Factor
                </span>
                <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                  <span
                    className={`text-xl font-bold font-mono ${
                      metrics.profitFactor >= 1.5
                        ? "text-emerald-400"
                        : metrics.profitFactor >= 1.0
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {metrics.profitFactor.toFixed(2)}
                  </span>
                </div>
                <span className="text-xs text-slate-300 mt-1.5 block font-mono tabular-nums">
                  Payoff Ratio: {metrics.payoffRatio.toFixed(2)}x
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] hover:border-slate-700 p-4 rounded-xl transition-colors">
                <span className="text-xs text-slate-300 uppercase tracking-wider flex items-center justify-between font-semibold">
                  <span>MAE Médio</span>
                  <span className="text-xs text-rose-300 font-normal lowercase">risco</span>
                </span>
                <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-xl font-bold font-mono text-rose-400">
                    {metrics.avgMaePercent.toFixed(2)}%
                  </span>
                </div>
                <span className="text-xs text-slate-300 mt-1.5 block font-mono tabular-nums">
                  Drawdown máx: {metrics.maxDrawdownPercent.toFixed(1)}%
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] hover:border-slate-700 p-4 rounded-xl transition-colors">
                <span className="text-xs text-slate-300 uppercase tracking-wider flex items-center justify-between font-semibold">
                  <span>MFE Médio</span>
                  <span className="text-xs text-emerald-300 font-normal lowercase">pico</span>
                </span>
                <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    +{metrics.avgMfePercent.toFixed(2)}%
                  </span>
                </div>
                <span className="text-xs text-slate-300 mt-1.5 block font-mono tabular-nums">
                  Duração média: {metrics.avgDurationMinutes.toFixed(1)}m
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] hover:border-slate-700 p-4 rounded-xl transition-colors">
                <span className="text-xs text-slate-300 uppercase tracking-wider block font-semibold">
                  Índice de Sharpe
                </span>
                <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-xl font-bold font-mono text-cyan-400">
                    {metrics.sharpeRatio.toFixed(2)}
                  </span>
                </div>
                <span className="text-xs text-slate-300 mt-1.5 block font-mono tabular-nums">
                  Sortino: {metrics.sortinoRatio.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Curva de Patrimônio (Equity Curve) em SVG de Alta Resolução */}
            <div className="bg-[#131b2a] border border-[#1f2937] p-6 rounded-xl space-y-4">
              {/* Linha 1 de Hierarquia: Título + Controles Interativos de Visualização */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="text-base font-bold text-white leading-tight">
                      Curva de Patrimônio Acumulado &amp; Underwater Drawdown
                    </h3>
                    <p className="text-xs text-slate-300 font-mono tabular-nums mt-0.5">
                      Base Inicial: $1,000.00 USD ({metrics.equityCurve.length} pontos amostrados)
                    </p>
                  </div>
                </div>

                {/* Controles de Janela Temporal e Camadas (Escala 8pt: h-8 = 32px) */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Seletor de Janela Temporal (Tick-by-Tick vs Daily Rollup O(1) para >50.000 trades) */}
                  <div
                    role="group"
                    aria-label="Janela temporal da curva de patrimônio"
                    className="flex items-center gap-1 bg-[#0b0e14] p-1 rounded-lg border border-[#1f2937]"
                  >
                    {(["LIVE", "30D", "90D", "1Y", "ALL"] as LongHorizonWindow[]).map((win) => (
                      <button
                        key={win}
                        type="button"
                        onClick={() => setHorizonWindow(win)}
                        className={`h-7 px-2.5 rounded-md text-xs font-mono transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 ${
                          horizonWindow === win
                            ? "bg-emerald-600 text-white font-bold shadow-sm"
                            : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                        }`}
                      >
                        {win === "LIVE" ? "TICKS" : `${win} O(1)`}
                      </button>
                    ))}
                  </div>

                  {/* Toggle Underwater Drawdown Layer */}
                  <button
                    type="button"
                    aria-pressed={showUnderwaterDrawdown}
                    onClick={() => setShowUnderwaterDrawdown((prev) => !prev)}
                    className={`h-8 px-3 rounded-lg text-xs font-mono border transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 active:scale-[0.98] ${
                      showUnderwaterDrawdown
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-200 font-semibold"
                        : "bg-[#0b0e14] border-[#1f2937] text-slate-300 hover:text-white"
                    }`}
                  >
                    Underwater DD: {showUnderwaterDrawdown ? "ON" : "OFF"}
                  </button>

                  {/* Botão de Compactação Colunar TJC1 com Estado de Loading Explícito */}
                  <button
                    type="button"
                    onClick={handleRunColdTierCompaction}
                    disabled={isCompacting}
                    aria-busy={isCompacting}
                    title="Executar Compactação Colunar TJC1 e Agregação Diária Imutável UTC (Daily Rollup)"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0b0e14] hover:bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 text-xs font-mono transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.98]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCompacting ? "animate-spin text-cyan-400" : ""}`} />
                    <span>
                      {isCompacting ? "Compactando TJC1..." : "Rollup O(1)"}
                      {compactionReport && compactionReport.compressionRatio > 1 && !isCompacting
                        ? ` (${compactionReport.compressionRatio}x • ${compactionReport.totalRollupDays}d)`
                        : ""}
                    </span>
                  </button>
                </div>
              </div>

              {/* Linha 2 de Hierarquia: Barra de Telemetria de Infraestrutura (Separada das Ações) */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1f2937]/70">
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Stream Real-Time (BroadcastChannel + CustomEvent)
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/25 text-purple-200 font-mono tabular-nums">
                  Worker IDB + SQLite WAL • Batch {persistenceStats.debounceMs}ms (
                  {persistenceStats.totalRecordsPersisted} salvos
                  {persistenceStats.lastFlushDurationMs > 0
                    ? ` • ${persistenceStats.lastFlushDurationMs}ms`
                    : ""}
                  )
                </span>
                {lastLiveExecution && (
                  <span className="text-xs text-amber-200 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-md font-mono tabular-nums">
                    ⚡ {lastLiveExecution.event.source === "DIRECT_AI_TRADE" ? "Direct AI" : "Live Fleet"} •{" "}
                    {lastLiveExecution.record.symbol} ({lastLiveExecution.event.triggerType || lastLiveExecution.record.exitReason}){" "}
                    {lastLiveExecution.record.netPnl >= 0 ? "+" : ""}${lastLiveExecution.record.netPnl.toFixed(2)}
                  </span>
                )}
                {metrics.equityCurve.length > 200 && (
                  <span className="text-xs text-cyan-200 bg-cyan-950/60 border border-cyan-800/60 px-2.5 py-1 rounded-md font-mono tabular-nums">
                    LTTB Ativo (60 pts / {metrics.equityCurve.length} trades)
                  </span>
                )}
              </div>

              {/* Viewport SVG Dual-Layer Isolado (React.memo + contain: layout paint) */}
              <DualLayerEquityCurveViewport
                equityCurve={metrics.equityCurve}
                showUnderwaterDrawdown={showUnderwaterDrawdown}
              />

              {/* Gaveta/Card do Copiloto Quant Pós-Trade & Prompt Chain-of-Thought Estruturado */}
              {showCoTPromptDrawer && (
                <div className="mt-4 p-4 rounded-xl bg-[#0b0e14] border border-cyan-500/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                        Copiloto Quant Pós-Trade • Diagnóstico Clear-Box &amp; Prompt CoT
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                          copilotBundle.riskStatus === "CRITICO"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : copilotBundle.riskStatus === "ATENCAO"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        }`}
                      >
                        Status: {copilotBundle.riskStatus} • Eficiência MFE:{" "}
                        {copilotBundle.mfeCaptureEfficiencyPercent.toFixed(1)}%
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCoTPrompt}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-xs font-mono transition-colors cursor-pointer"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Prompt Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copiar Prompt Institucional CoT
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs space-y-1">
                    <div className="font-semibold text-emerald-300">
                      {copilotBundle.clearBoxHeadline}
                    </div>
                    <p className="text-slate-300">{copilotBundle.clearBoxRecommendation}</p>
                  </div>

                  <pre className="p-3 rounded-lg bg-[#070a10] border border-[#1f2937] text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-52 leading-relaxed">
                    {copilotBundle.promptText}
                  </pre>
                </div>
              )}
            </div>

            {/* Barra de Filtros, Quick Filter Chips e Exportação (4/8pt Grid: p-4=16px, gap-3=12px, h-8=32px) */}
            <div className="space-y-3 bg-[#131b2a] border border-[#1f2937] p-4 rounded-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label="Filtrar trades por símbolo do ativo"
                    placeholder="Filtrar por par (ex: BTC, SOL)..."
                    value={searchSymbol}
                    onChange={(e) => setSearchSymbol(e.target.value)}
                    className="h-8 bg-[#0b0e14] border border-[#2d3748] rounded-lg px-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 w-48 font-mono transition-all"
                  />

                  <select
                    aria-label="Filtrar por modo de execução"
                    value={filterMode}
                    onChange={(e: any) => setFilterMode(e.target.value)}
                    className="h-8 bg-[#0b0e14] border border-[#2d3748] rounded-lg px-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Modos</option>
                    <option value="live">⚡ Live (Real)</option>
                    <option value="paper">📝 Paper (Simulado)</option>
                  </select>

                  <select
                    aria-label="Filtrar por resultado financeiro"
                    value={filterOutcome}
                    onChange={(e: any) => setFilterOutcome(e.target.value)}
                    className="h-8 bg-[#0b0e14] border border-[#2d3748] rounded-lg px-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Resultados</option>
                    <option value="win">🟢 Apenas Lucros (Wins)</option>
                    <option value="loss">🔴 Apenas Prejuízos (Losses)</option>
                  </select>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="h-8 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 active:scale-95"
                    >
                      Limpar Filtros
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={filteredRecords.length === 0}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#1a2234] border border-[#2d3748] text-xs font-medium text-slate-200 hover:text-white hover:bg-[#222d42] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-[0.98]"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    Exportar CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    disabled={filteredRecords.length === 0}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#1a2234] border border-[#2d3748] text-xs font-medium text-slate-200 hover:text-white hover:bg-[#222d42] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.98]"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    Exportar JSON
                  </button>
                </div>
              </div>

              {/* Quick Filter Chips em 1 Clique */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1f2937]/80">
                <span className="text-xs text-slate-300 font-semibold mr-1">Filtro Rápido:</span>
                {(
                  [
                    { id: "ALL", label: "Todos" },
                    { id: "DIRECT_AI", label: "⚡ Direct AI Trade" },
                    { id: "LIVE_FLEET", label: "🤖 Frota ao Vivo" },
                    { id: "TAKE_PROFIT", label: "🎯 Take-Profit (TP1/TP2)" },
                    { id: "STOP_LOSS", label: "🛡️ Stop-Loss" },
                    { id: "HIGH_EFF_MFE", label: "🔥 Captura MFE ≥ 70%" },
                  ] as Array<{ id: QuickFilterChip; label: string }>
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={quickChip === chip.id}
                    onClick={() => setQuickChip(chip.id)}
                    className={`h-7 px-3 rounded-md text-xs font-mono transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 ${
                      quickChip === chip.id
                        ? "bg-emerald-600 text-white font-semibold shadow-sm"
                        : "bg-[#0b0e14] text-slate-300 hover:text-white hover:border-slate-600 border border-[#2d3748]"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Barra de Inspeção de Execução Individual + Navegação Vim/Trading Desk (J/K + Enter) */}
            {selectedRecord && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#0e1523] border border-cyan-500/30 text-xs font-mono tabular-nums">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 font-bold">
                    INSPEÇÃO ATIVA
                  </span>
                  <span className="font-bold text-white">
                    {selectedRecord.symbol} ({selectedRecord.side.toUpperCase()})
                  </span>
                  <span className="text-slate-300 font-sans">
                    Robô: <strong className="text-white">{selectedRecord.botName}</strong>
                  </span>
                  <span
                    className={
                      selectedRecord.netPnl >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"
                    }
                  >
                    PnL: {selectedRecord.netPnl >= 0 ? "+" : ""}${selectedRecord.netPnl.toFixed(2)} (
                    {selectedRecord.netGainPercent >= 0 ? "+" : ""}
                    {selectedRecord.netGainPercent.toFixed(2)}%)
                  </span>
                  <span className="text-slate-300">
                    MAE/MFE:{" "}
                    <strong className="text-rose-400">{selectedRecord.maePercent.toFixed(2)}%</strong> /{" "}
                    <strong className="text-emerald-400">+{selectedRecord.mfePercent.toFixed(2)}%</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-300 font-sans hidden sm:inline">
                    Teclado: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-mono">J</kbd>/
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-mono">K</kbd> navegar •{" "}
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-mono">Enter</kbd> Prompt CoT
                  </span>
                  <button
                    type="button"
                    onClick={() => triggerQuantCopilotInstantAudit()}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-sans font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-95"
                  >
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Abrir Modal Copiloto &amp; Dry-Run
                  </button>
                </div>
              </div>
            )}

            {/* Tabela Virtualizada O(1) Pós-Trade com Barra Bipartida MAE vs MFE e Navegação J/K */}
            <div
              ref={tableViewportRef}
              tabIndex={0}
              onKeyDown={handleTableKeyDown}
              onScroll={(e) => setTableScrollTop(e.currentTarget.scrollTop)}
              style={{
                maxHeight: `${VIRTUAL_VIEWPORT_HEIGHT}px`,
                contain: "layout paint",
              }}
              aria-label="Tabela de histórico pós-trade virtualizada (use J/K ou setas para navegar e Enter para auditar com Copiloto Quant)"
              className="overflow-auto rounded-xl border border-[#1f2937] bg-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
            >
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#141d2e] shadow-sm">
                  <tr className="border-b border-[#1f2937] text-slate-200 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Ativo / Robô</th>
                    <th className="py-3 px-3">Modo</th>
                    <th className="py-3 px-3">Preço Entrada / Saída</th>
                    <th className="py-3 px-3">Duração</th>
                    <th className="py-3 px-3 text-right">Net PnL</th>
                    <th className="py-3 px-3 text-center">Excursão Bipartida (MAE vs MFE)</th>
                    <th className="py-3 px-3 text-center">Captura MFE</th>
                    <th className="py-3 px-3 text-right">Fricção (Taxas)</th>
                    <th className="py-3 px-4">Motivo Saída</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2937]/50 font-mono tabular-nums">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 px-6 text-center font-sans">
                        <div className="max-w-md mx-auto flex flex-col items-center justify-center gap-3">
                          <div className="p-3 rounded-full bg-slate-800/90 border border-slate-700 text-cyan-400">
                            <Sliders className="w-6 h-6" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-white">
                              Nenhum registro de trade encontrado
                            </h4>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              {hasActiveFilters
                                ? "Os filtros selecionados não retornaram execuções. Limpe os filtros ativos para visualizar todo o histórico pós-trade."
                                : "Ainda não há operações encerradas na sessão atual. Assim que o Direct AI Trade ou a Frota ao Vivo realizar TP1/TP2 ou fechamento total, o registro aparecerá instantaneamente."}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            {hasActiveFilters && (
                              <button
                                type="button"
                                onClick={handleResetFilters}
                                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95"
                              >
                                Resetar Filtros Ativos
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowCoTPromptDrawer(true)}
                              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-95"
                            >
                              <Brain className="w-3.5 h-3.5" />
                              Inspecionar Copiloto Quant (Alt+J)
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {virtualWindow.topPaddingHeight > 0 && (
                        <tr aria-hidden="true" style={{ height: `${virtualWindow.topPaddingHeight}px` }}>
                          <td colSpan={9} />
                        </tr>
                      )}
                      {virtualWindow.visibleRows.map((r) => (
                        <VirtualPostTradeRow
                          key={r.id}
                          record={r}
                          isSelected={selectedRecord?.id === r.id}
                          onSelect={handleSelectRow}
                          onAuditRow={handleAuditRow}
                        />
                      ))}
                      {virtualWindow.bottomPaddingHeight > 0 && (
                        <tr
                          aria-hidden="true"
                          style={{ height: `${virtualWindow.bottomPaddingHeight}px` }}
                        >
                          <td colSpan={9} />
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ABA 2: SCANNER DE ORDER FLOW E ANOMALIAS */}
        {activeTab === "orderflow" && (
          <div className="space-y-6">
            <div className="bg-[#131b2a] border border-[#1f2937] p-5 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    Detector de Anomalias de Volume (RVOL) & Absorção L2
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Monitoramento contínuo de picos superiores a +3σ e desbalanceamento de livro &gt; 70/30 sustentado
                  </p>
                </div>
                <button
                  onClick={() => {
                    orderFlowAnomalyScanner.clearAlerts();
                    setAnomalies([]);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1a2234] border border-[#2d3748] text-xs font-medium text-slate-300 hover:text-white hover:bg-[#222d42] transition-colors"
                >
                  Limpar Alertas
                </button>
              </div>

              {/* Lista de Alertas Ativos */}
              <div className="mt-4 space-y-3">
                {anomalies.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2 bg-[#090d16] rounded-xl border border-[#1a2333]">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500/60" />
                    <span>Nenhuma anomalia de fluxo ou volume anômalo registrada no momento.</span>
                    <span className="text-[11px] text-slate-600">
                      O motor L2 está analisando ativamente os books e velas de 1m.
                    </span>
                  </div>
                ) : (
                  anomalies.map((a) => {
                    const isVolume = a.type === "VOLUME_SPIKE_3SIGMA";
                    const isBuyImbalance = a.type === "BOOK_IMBALANCE_BUY_DOMINANCE";
                    return (
                      <div
                        key={a.id}
                        className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all ${
                          a.severity === "CRITICAL"
                            ? "bg-rose-950/20 border-rose-500/40"
                            : isVolume
                            ? "bg-purple-950/20 border-purple-500/40"
                            : "bg-blue-950/20 border-blue-500/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 rounded-lg mt-0.5 ${
                              isVolume
                                ? "bg-purple-500/20 text-purple-400"
                                : isBuyImbalance
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            {isVolume ? <Flame className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{a.symbol}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                  a.severity === "CRITICAL"
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-amber-500/20 text-amber-300"
                                }`}
                              >
                                {a.severity}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(a.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">{a.message}</p>
                            {a.metrics.imbalanceRatio !== undefined && (
                              <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-400 font-mono">
                                <span>
                                  Liquidez Compradora: ${a.metrics.bidLiquidityUsd?.toLocaleString()} USDT
                                </span>
                                <span>
                                  Liquidez Vendedora: ${a.metrics.askLiquidityUsd?.toLocaleString()} USDT
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA 3: INTEGRAÇÃO E ALERTAS VIA TELEGRAM BOT */}
        {activeTab === "telegram" && (
          <div className="space-y-6 max-w-3xl">
            <div className="bg-[#131b2a] border border-[#1f2937] p-6 rounded-xl space-y-6">
              <div className="flex items-center justify-between border-b border-[#1f2937] pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Send className="w-5 h-5 text-blue-400" />
                    Notificações e Comandos Remotos Telegram
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Receba execuções, TP/SL, Kill Switch e controle os robôs via comandos `/status`, `/pause`, `/resume`, `/kill`.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Ativar Bot:</span>
                  <input
                    type="checkbox"
                    checked={telegramConfig.enabled}
                    onChange={(e) =>
                      setTelegramConfig({ ...telegramConfig, enabled: e.target.checked })
                    }
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Formulário de Configuração */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Telegram Bot Token (via @BotFather)
                  </label>
                  <input
                    type="password"
                    placeholder="Ex: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    value={telegramConfig.botToken}
                    onChange={(e) =>
                      setTelegramConfig({ ...telegramConfig, botToken: e.target.value })
                    }
                    className="w-full bg-[#0b0e14] border border-[#2d3748] rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Chat ID / ID do Operador (via @userinfobot)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 987654321 ou -100123456789"
                    value={telegramConfig.chatId}
                    onChange={(e) =>
                      setTelegramConfig({ ...telegramConfig, chatId: e.target.value })
                    }
                    className="w-full bg-[#0b0e14] border border-[#2d3748] rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Comandos remotos são estritamente autorizados apenas a partir deste Chat ID (Whitelisting).
                  </p>
                </div>

                {/* Seletores de Notificações */}
                <div className="pt-2 border-t border-[#1f2937] space-y-2.5">
                  <span className="text-xs font-semibold text-slate-300 block mb-2">
                    Eventos Habilitados para Despacho:
                  </span>
                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramConfig.notifyOnOrder}
                      onChange={(e) =>
                        setTelegramConfig({ ...telegramConfig, notifyOnOrder: e.target.checked })
                      }
                      className="w-3.5 h-3.5 accent-emerald-500 rounded"
                    />
                    <span>Execução de Novas Ordens de Compra/Venda com parâmetros de risco</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramConfig.notifyOnTpSl}
                      onChange={(e) =>
                        setTelegramConfig({ ...telegramConfig, notifyOnTpSl: e.target.checked })
                      }
                      className="w-3.5 h-3.5 accent-emerald-500 rounded"
                    />
                    <span>Take-Profit e Stop-Loss atingidos com resultado em USD, %, MAE e MFE</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramConfig.notifyOnKillSwitch}
                      onChange={(e) =>
                        setTelegramConfig({
                          ...telegramConfig,
                          notifyOnKillSwitch: e.target.checked,
                        })
                      }
                      className="w-3.5 h-3.5 accent-emerald-500 rounded"
                    />
                    <span>Acionamento de Circuit Breakers e Travas de Emergência</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramConfig.notifyDailyDigest}
                      onChange={(e) =>
                        setTelegramConfig({
                          ...telegramConfig,
                          notifyDailyDigest: e.target.checked,
                        })
                      }
                      className="w-3.5 h-3.5 accent-emerald-500 rounded"
                    />
                    <span>Relatório Consolidado Diário (Daily Digest à meia-noite UTC)</span>
                  </label>
                </div>

                {/* Feedback do Teste */}
                {telegramTestResult && (
                  <div
                    className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                      telegramTestResult.success
                        ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                        : "bg-rose-950/20 border-rose-500/40 text-rose-300"
                    }`}
                  >
                    {telegramTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    )}
                    <span>{telegramTestResult.message}</span>
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="flex items-center gap-3 pt-3">
                  <button
                    onClick={handleTestTelegram}
                    disabled={isTestingTelegram || !telegramConfig.botToken}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold text-white transition-all shadow-md"
                  >
                    {isTestingTelegram ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Testar Notificação Agora
                  </button>

                  <button
                    onClick={handleSaveTelegramConfig}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-all shadow-md"
                  >
                    Salvar Configurações
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
