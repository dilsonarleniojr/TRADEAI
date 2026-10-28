"use client";

import * as React from "react";
import { SlidersHorizontal, Play, BarChart3, TrendingUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartBadge } from "../ui/badge";
import { SmartButton } from "../ui/button";
import { SmartTable, SmartTableHeader, SmartTableBody, SmartTableRow, SmartTableHead, SmartTableCell } from "../ui/table";
import { lttbDownsample } from "@/lib/performance/lttb";

export function SmartBacktestMetricsCard() {
  const [isRunning, setIsRunning] = React.useState(false);
  const [strategy, setStrategy] = React.useState("conformal");
  const [initialCapital, setInitialCapital] = React.useState("10000");

  const equityPoints = [10000, 10350, 10180, 10720, 10600, 11250, 11890, 12400, 12200, 13100, 13850, 14860];
  const sampledPoints = React.useMemo(() => {
    return equityPoints.length > 200 ? lttbDownsample(equityPoints, 60) : equityPoints;
  }, [equityPoints]);

  const minEquity = Math.min(...sampledPoints);
  const maxEquity = Math.max(...sampledPoints);
  const range = maxEquity - minEquity || 1;
  const width = 600;
  const height = 180;

  const pointsSvg = sampledPoints
    .map((val, idx) => {
      const x = (idx / (sampledPoints.length - 1)) * width;
      const y = height - ((val - minEquity) / range) * (height - 30) - 15;
      return `${x},${y}`;
    })
    .join(" ");

  const handleRun = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 800);
  };

  return (
    <div className="w-full bg-[#111111] border border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Simulação Histórica de Backtesting</h3>
            <p className="text-xs text-neutral-400">Validação walk-forward com fricção realista (slippage & taxas maker/taker)</p>
          </div>
        </div>

        <SmartButton
          variant="primary"
          size="md"
          isLoading={isRunning}
          onClick={handleRun}
          leftIcon={<Play className="w-4 h-4 fill-current" />}
        >
          Executar Simulação
        </SmartButton>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
          <span className="text-[11px] text-neutral-400 font-semibold uppercase">Retorno Líquido</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">+48.60%</div>
          <span className="text-[10px] text-neutral-500 font-mono">+$4,860.00 USD</span>
        </div>

        <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
          <span className="text-[11px] text-neutral-400 font-semibold uppercase">Índice Sharpe</span>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1">2.45</div>
          <span className="text-[10px] text-emerald-400 font-medium">Excelente (&gt; 2.0)</span>
        </div>

        <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
          <span className="text-[11px] text-neutral-400 font-semibold uppercase">Max Drawdown</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">-4.20%</div>
          <span className="text-[10px] text-neutral-500 font-mono">Trava Máx: 5.0%</span>
        </div>

        <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
          <span className="text-[11px] text-neutral-400 font-semibold uppercase">Taxa de Acerto</span>
          <div className="text-xl font-bold font-mono text-white mt-1">68.4%</div>
          <span className="text-[10px] text-neutral-500 font-mono">152 de 222 trades</span>
        </div>

        <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
          <span className="text-[11px] text-neutral-400 font-semibold uppercase">Profit Factor</span>
          <div className="text-xl font-bold font-mono text-purple-400 mt-1">2.18</div>
          <span className="text-[10px] text-neutral-500 font-mono">Payoff 1.84</span>
        </div>
      </div>

      {/* Equity Curve SVG */}
      <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 cyan-border-glow">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-neutral-300">Curva de Patrimônio Líquido (Equity Curve)</span>
          <span className="text-xs font-mono text-emerald-400 font-bold">$14,860.00 USD</span>
        </div>

        <div className="w-full h-[180px]">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((r) => (
              <line
                key={r}
                x1="0"
                y1={height * r}
                x2={width}
                y2={height * r}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="4 4"
              />
            ))}

            <polygon
              className="svg-fill-blue"
              points={`0,${height} ${pointsSvg} ${width},${height}`}
            />

            <polyline
              fill="none"
              stroke="#3B82F6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsSvg}
            />
          </svg>
        </div>
      </div>

      {/* Sample Trades Log Table */}
      <div>
        <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">
          Amostra das Últimas Execuções Históricas
        </h4>
        <SmartTable>
          <SmartTableHeader>
            <SmartTableRow>
              <SmartTableHead>Horário</SmartTableHead>
              <SmartTableHead>Par</SmartTableHead>
              <SmartTableHead>Tipo</SmartTableHead>
              <SmartTableHead>Entrada</SmartTableHead>
              <SmartTableHead>Saída</SmartTableHead>
              <SmartTableHead>PnL Líquido</SmartTableHead>
              <SmartTableHead>Status</SmartTableHead>
            </SmartTableRow>
          </SmartTableHeader>
          <SmartTableBody>
            {[
              { time: "2026-10-23 18:42", pair: "BTC/USDT", side: "BUY", entry: 66820, exit: 68150, pnl: "+$245.20", isWin: true },
              { time: "2026-10-23 15:10", pair: "SOL/USDT", side: "BUY", entry: 174.5, exit: 181.2, pnl: "+$182.40", isWin: true },
              { time: "2026-10-23 11:05", pair: "ETH/USDT", side: "SELL", entry: 3510, exit: 3540, pnl: "-$42.00", isWin: false },
              { time: "2026-10-23 08:30", pair: "BTC/USDT", side: "BUY", entry: 65400, exit: 66900, pnl: "+$310.50", isWin: true },
            ].map((t, i) => (
              <SmartTableRow key={i}>
                <SmartTableCell className="font-mono text-xs">{t.time}</SmartTableCell>
                <SmartTableCell className="font-bold text-white text-xs">{t.pair}</SmartTableCell>
                <SmartTableCell>
                  <SmartBadge variant={t.side === "BUY" ? "success" : "danger"} size="sm">
                    {t.side}
                  </SmartBadge>
                </SmartTableCell>
                <SmartTableCell className="font-mono text-xs">${t.entry.toLocaleString()}</SmartTableCell>
                <SmartTableCell className="font-mono text-xs">${t.exit.toLocaleString()}</SmartTableCell>
                <SmartTableCell className={cn("font-mono font-bold text-xs", t.isWin ? "text-emerald-400" : "text-red-400")}>
                  {t.pnl}
                </SmartTableCell>
                <SmartTableCell>
                  <SmartBadge variant={t.isWin ? "success" : "danger"} size="sm">
                    {t.isWin ? "Take Profit" : "Stop Loss"}
                  </SmartBadge>
                </SmartTableCell>
              </SmartTableRow>
            ))}
          </SmartTableBody>
        </SmartTable>
      </div>
    </div>
  );
}
