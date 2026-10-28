"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock,
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

export function TradeJournalPanel() {
  const [records, setRecords] = useState<TradeJournalRecord[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(() =>
    tradeJournalEngine.calculateMetrics([])
  );
  const [filterMode, setFilterMode] = useState<"all" | "live" | "paper">("all");
  const [filterOutcome, setFilterOutcome] = useState<"all" | "win" | "loss">("all");
  const [searchSymbol, setSearchSymbol] = useState<string>("");
  const [horizonWindow, setHorizonWindow] = useState<LongHorizonWindow>("LIVE");
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

  useEffect(() => {
    // Inscrição no Diário de Trades
    const unsubJournal = tradeJournalEngine.subscribe((updatedList) => {
      setRecords(updatedList);
    });

    // Inscrição no Canal de Eventos de Execução em Tempo Real (BroadcastChannel + CustomEvent)
    const unsubExecutionBus = tradeJournalEngine.subscribeExecutionEvents((rec, evt) => {
      setLastLiveExecution({ record: rec, event: evt });
    });

    // Inscrição na Telemetria de Persistência Assíncrona em Lote (IndexedDB + SQLite WAL 500ms)
    const unsubPersistence = tradeJournalEngine.subscribePersistenceStats((stats) => {
      setPersistenceStats(stats);
    });

    // Inscrição em Anomalias de Order Flow
    const unsubAnomalies = orderFlowAnomalyScanner.subscribe((alert) => {
      setAnomalies(orderFlowAnomalyScanner.getRecentAlerts(20));
    });
    setAnomalies(orderFlowAnomalyScanner.getRecentAlerts(20));

    return () => {
      unsubJournal();
      unsubExecutionBus();
      unsubPersistence();
      unsubAnomalies();
    };
  }, []);

  // Filtragem dinâmica
  const filteredRecords = useMemo(() => {
    const filters: JournalFilterOptions = {
      mode: filterMode,
      outcome: filterOutcome,
      symbol: searchSymbol.trim() ? searchSymbol.trim() : undefined,
    };
    return tradeJournalEngine.getFilteredRecords(filters);
  }, [records, filterMode, filterOutcome, searchSymbol]);

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

  const handleRunColdTierCompaction = async () => {
    const report = tradeJournalEngine.runColdTierCompaction(records, 1000, {
      includeColumnarArchive: true,
    });
    setCompactionReport(report);
    try {
      await fetch("/api/journal/rollup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialCapital: 1000 }),
      });
    } catch {
      // Ignora falha de rede se offline
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
      {/* Header com Abas de Navegação */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#1f2937] bg-[#111827]/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <LineChart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Trade Journal & Performance Engine
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono">
                v2.6 Institutional
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Análise Pós-Trade, Rastreamento MAE/MFE, Desbalanceamento L2 e Notificações Remotas
            </p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1 bg-[#1a2234] p-1 rounded-lg border border-[#2d3748]">
          <button
            onClick={() => setActiveTab("journal")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "journal"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Diário de Trades
          </button>
          <button
            onClick={() => setActiveTab("orderflow")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === "orderflow"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Order Flow & RVOL
            {anomalies.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("telegram")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTab === "telegram"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
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

      {/* Conteúdo Principal */}
      <div className="p-6">
        {/* ABA 1: DIÁRIO DE TRADES */}
        {activeTab === "journal" && (
          <div className="space-y-6">
            {/* Grade de KPIs Institucionais */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-[#131b2a] border border-[#1f2937] p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Net PnL Líquido
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    className={`text-xl font-bold font-mono ${
                      metrics.totalNetPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {metrics.totalNetPnl >= 0 ? "+" : ""}${metrics.totalNetPnl.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">USD</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Taxas: -${metrics.totalFees.toFixed(2)} USD
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Taxa de Acerto (Win Rate)
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-white">
                    {metrics.winRate.toFixed(1)}%
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {metrics.winTrades}W / {metrics.lossTrades}L ({metrics.totalTrades} trades)
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Profit Factor
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
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
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Payoff Ratio: {metrics.payoffRatio.toFixed(2)}x
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold flex items-center justify-between">
                  MAE Médio
                  <span className="text-[9px] text-rose-400/80 lowercase">pior excursão</span>
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-rose-400">
                    {metrics.avgMaePercent.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Drawdown máx: {metrics.maxDrawdownPercent.toFixed(1)}%
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold flex items-center justify-between">
                  MFE Médio
                  <span className="text-[9px] text-emerald-400/80 lowercase">pico de lucro</span>
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    +{metrics.avgMfePercent.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Duração média: {metrics.avgDurationMinutes.toFixed(1)}m
                </span>
              </div>

              <div className="bg-[#131b2a] border border-[#1f2937] p-3.5 rounded-xl">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Índice de Sharpe
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-cyan-400">
                    {metrics.sharpeRatio.toFixed(2)}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Sortino: {metrics.sortinoRatio.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Curva de Patrimônio (Equity Curve) em SVG de Alta Resolução */}
            <div className="bg-[#131b2a] border border-[#1f2937] p-5 rounded-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Curva de Patrimônio Acumulado (Equity Curve)
                  </h3>
                  <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Stream Real-Time (BroadcastChannel + CustomEvent)
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 font-mono">
                    Worker IDB + SQLite WAL • Batch {persistenceStats.debounceMs}ms (
                    {persistenceStats.totalRecordsPersisted} salvos
                    {persistenceStats.lastFlushDurationMs > 0
                      ? ` • ${persistenceStats.lastFlushDurationMs}ms`
                      : ""}
                    )
                  </span>
                  <button
                    type="button"
                    onClick={handleRunColdTierCompaction}
                    title="Executar Compactação Colunar TJC1 e Agregação Diária Imutável UTC (Daily Rollup)"
                    className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-mono transition-colors cursor-pointer"
                  >
                    Cold-Tier TJC1 • Daily Rollup O(1)
                    {compactionReport && compactionReport.compressionRatio > 1
                      ? ` (${compactionReport.compressionRatio}x • ${compactionReport.totalRollupDays}d)`
                      : ""}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Seletor de Janela Temporal (Tick-by-Tick vs Daily Rollup O(1) para >50.000 trades) */}
                  <div className="flex items-center gap-0.5 bg-[#0b0e14] p-0.5 rounded-md border border-[#1f2937]">
                    {(["LIVE", "30D", "90D", "1Y", "ALL"] as LongHorizonWindow[]).map((win) => (
                      <button
                        key={win}
                        type="button"
                        onClick={() => setHorizonWindow(win)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                          horizonWindow === win
                            ? "bg-emerald-600 text-white font-bold"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {win === "LIVE" ? "TICKS" : `${win} O(1)`}
                      </button>
                    ))}
                  </div>
                  {lastLiveExecution && (
                    <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                      ⚡ {lastLiveExecution.event.source === "DIRECT_AI_TRADE" ? "Direct AI" : "Live Fleet"} •{" "}
                      {lastLiveExecution.record.symbol} ({lastLiveExecution.event.triggerType || lastLiveExecution.record.exitReason}){" "}
                      {lastLiveExecution.record.netPnl >= 0 ? "+" : ""}${lastLiveExecution.record.netPnl.toFixed(2)}
                    </span>
                  )}
                  {metrics.equityCurve.length > 200 && (
                    <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.5 rounded font-mono">
                      LTTB Ativo (60 pts / {metrics.equityCurve.length} trades)
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-mono">
                    Base Inicial: $1,000.00 USD ({metrics.equityCurve.length} pts)
                  </span>
                </div>
              </div>

              <div className="w-full h-44 relative bg-[#090d16] rounded-lg border border-[#1a2333] emerald-border-glow p-2 flex items-center justify-center overflow-hidden">
                {metrics.equityCurve.length <= 1 ? (
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Aguardando encerramento de trades para plotar a curva de patrimônio contínua.
                  </div>
                ) : (
                  <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 160">
                    {/* Linha Zero / Base */}
                    <line
                      x1="0"
                      y1="80"
                      x2="800"
                      y2="80"
                      stroke="#223046"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />

                    {/* Caminho da Curva com Amostragem Adaptativa LTTB (preservação O(1) de nós DOM) */}
                    {(() => {
                      const rawPoints = metrics.equityCurve;
                      const points =
                        rawPoints.length > 200
                          ? lttbDownsample(rawPoints, 60, {
                              getX: (_, i) => i,
                              getY: (p) => p.equity,
                            })
                          : rawPoints;
                      const equities = points.map((p) => p.equity);
                      const minEq = Math.min(...equities) * 0.995;
                      const maxEq = Math.max(...equities) * 1.005;
                      const range = maxEq - minEq || 1;

                      const coords = points.map((p, idx) => {
                        const x = (idx / (points.length - 1)) * 790 + 5;
                        const y = 150 - ((p.equity - minEq) / range) * 140;
                        return { x, y, p };
                      });

                      const pathD = coords.reduce(
                        (acc, c, i) => `${acc} ${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`,
                        ""
                      );
                      const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} 160 L ${coords[0].x.toFixed(1)} 160 Z`;

                      return (
                        <g>
                          <path d={areaD} className="svg-fill-emerald" />
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {coords.map((c, i) => (
                            <circle
                              key={i}
                              cx={c.x}
                              cy={c.y}
                              r="3.5"
                              fill="#10b981"
                              stroke="#0b0e14"
                              strokeWidth="1.5"
                            />
                          ))}
                        </g>
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>

            {/* Barra de Filtros e Exportação */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#131b2a] border border-[#1f2937] p-3 rounded-xl">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Filtrar por par (ex: BTC, SOL)..."
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  className="bg-[#0b0e14] border border-[#2d3748] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44 font-mono"
                />

                <select
                  value={filterMode}
                  onChange={(e: any) => setFilterMode(e.target.value)}
                  className="bg-[#0b0e14] border border-[#2d3748] rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Todos os Modos</option>
                  <option value="live">⚡ Live (Real)</option>
                  <option value="paper">📝 Paper (Simulado)</option>
                </select>

                <select
                  value={filterOutcome}
                  onChange={(e: any) => setFilterOutcome(e.target.value)}
                  className="bg-[#0b0e14] border border-[#2d3748] rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Todos os Resultados</option>
                  <option value="win">🟢 Apenas Lucros (Wins)</option>
                  <option value="loss">🔴 Apenas Prejuízos (Losses)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCsv}
                  disabled={filteredRecords.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2234] border border-[#2d3748] text-xs font-medium text-slate-300 hover:text-white hover:bg-[#222d42] disabled:opacity-40 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  Exportar CSV
                </button>
                <button
                  onClick={handleExportJson}
                  disabled={filteredRecords.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2234] border border-[#2d3748] text-xs font-medium text-slate-300 hover:text-white hover:bg-[#222d42] disabled:opacity-40 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  Exportar JSON
                </button>
              </div>
            </div>

            {/* Tabela de Histórico Pós-Trade */}
            <div className="overflow-x-auto rounded-xl border border-[#1f2937] bg-[#111827]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1f2937] bg-[#141d2e] text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Ativo / Robô</th>
                    <th className="py-3 px-3">Modo</th>
                    <th className="py-3 px-3">Preço Entrada / Saída</th>
                    <th className="py-3 px-3">Duração</th>
                    <th className="py-3 px-3 text-right">Net PnL</th>
                    <th className="py-3 px-3 text-center">MAE (Pior Queda)</th>
                    <th className="py-3 px-3 text-center">MFE (Pico Lucro)</th>
                    <th className="py-3 px-3 text-right">Fricção (Taxas)</th>
                    <th className="py-3 px-4">Motivo Saída</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2937]/50 font-mono">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                        Nenhum registro de trade encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      const isWin = r.netPnl >= 0;
                      return (
                        <tr key={r.id} className="hover:bg-[#151f33] transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {isWin ? (
                                <ArrowUpRight className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-rose-400 shrink-0" />
                              )}
                              <div>
                                <span className="font-bold text-white text-xs">{r.symbol}</span>
                                <span className="text-[10px] text-slate-400 block font-sans">
                                  {r.botName}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3 font-sans">
                            {r.mode === "live" ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                LIVE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 border border-blue-500/30 text-blue-400">
                                PAPER
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <div className="text-slate-300">${r.entryPrice.toFixed(4)}</div>
                            <div className="text-[10px] text-slate-500">→ ${r.exitPrice.toFixed(4)}</div>
                          </td>

                          <td className="py-3 px-3 text-slate-300 font-sans text-[11px]">
                            {r.durationFormatted}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <span
                              className={`font-bold ${
                                isWin ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {isWin ? "+" : ""}${r.netPnl.toFixed(2)}
                            </span>
                            <span
                              className={`block text-[10px] ${
                                isWin ? "text-emerald-500/80" : "text-rose-500/80"
                              }`}
                            >
                              {isWin ? "+" : ""}{r.netGainPercent.toFixed(2)}%
                            </span>
                          </td>

                          {/* Badge MAE */}
                          <td className="py-3 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                              {r.maePercent.toFixed(2)}%
                            </span>
                          </td>

                          {/* Badge MFE */}
                          <td className="py-3 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              +{r.mfePercent.toFixed(2)}%
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right text-slate-400">
                            ${(r.commissionFeesUsd + r.spreadCostUsd).toFixed(3)}
                          </td>

                          <td className="py-3 px-4 font-sans text-slate-300 text-[11px] max-w-[180px] truncate" title={r.exitReason}>
                            {r.exitReason}
                          </td>
                        </tr>
                      );
                    })
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
