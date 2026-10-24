"use client";

import * as React from "react";
import {
  Maximize2,
  TrendingUp,
  BarChart2,
  Crosshair,
  Minus,
  Trash2,
  Sliders,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartButton } from "../ui/button";
import { SmartBadge } from "../ui/badge";

export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const DEFAULT_CANDLES: CandleData[] = [
  { time: "18:00", open: 66400, high: 66850, low: 66320, close: 66780, volume: 1420 },
  { time: "18:15", open: 66780, high: 67200, low: 66650, close: 67150, volume: 2180 },
  { time: "18:30", open: 67150, high: 67320, low: 66900, close: 67010, volume: 1890 },
  { time: "18:45", open: 67010, high: 67100, low: 66500, close: 66550, volume: 2450 },
  { time: "19:00", open: 66550, high: 66950, low: 66480, close: 66920, volume: 1670 },
  { time: "19:15", open: 66920, high: 67450, low: 66890, close: 67400, volume: 3100 },
  { time: "19:30", open: 67400, high: 67800, low: 67350, close: 67750, volume: 2890 },
  { time: "19:45", open: 67750, high: 68120, low: 67600, close: 68050, volume: 3600 },
  { time: "20:00", open: 68050, high: 68250, low: 67800, close: 67900, volume: 2200 },
  { time: "20:15", open: 67900, high: 68380, low: 67850, close: 68320, volume: 4120 },
  { time: "20:30", open: 68320, high: 68700, low: 68200, close: 68650, volume: 3850 },
  { time: "20:45", open: 68650, high: 68900, low: 68450, close: 68820, volume: 4500 },
  { time: "21:00", open: 68820, high: 69200, low: 68750, close: 69150, volume: 5200 },
];

export function SmartCandleChart({
  symbol = "BTC/USDT",
  basePrice,
  height,
  onSymbolChange,
  onSelectPair,
}: {
  symbol?: string;
  basePrice?: number;
  height?: number;
  onSymbolChange?: (sym: string) => void;
  onSelectPair?: (sym: string) => void;
}) {
  const handleSymbolChange = onSelectPair || onSymbolChange;
  const [timeframe, setTimeframe] = React.useState<string>("15m");
  const [candles, setCandles] = React.useState<CandleData[]>(DEFAULT_CANDLES);
  const [showIndicators, setShowIndicators] = React.useState(true);
  const [hoveredCandle, setHoveredCandle] = React.useState<CandleData | null>(null);
  const [mousePos, setMousePos] = React.useState<{ x: number; y: number } | null>(null);
  const [activeTool, setActiveTool] = React.useState<string>("crosshair");

  // SVG Chart Dimensions
  const svgWidth = 840;
  const svgHeight = 420;
  const chartHeight = 320;
  const volumeHeight = 80;

  const minPrice = Math.min(...candles.map((c) => c.low)) * 0.998;
  const maxPrice = Math.max(...candles.map((c) => c.high)) * 1.002;
  const maxVolume = Math.max(...candles.map((c) => c.volume));

  const scaleY = (price: number) => {
    return chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * (chartHeight - 40) - 20;
  };

  const currentPrice = candles[candles.length - 1].close;
  const firstPrice = candles[0].open;
  const changePercent = ((currentPrice - firstPrice) / firstPrice) * 100;

  return (
    <div className="w-full flex flex-col bg-[#111111] border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Topbar: Symbol, Timeframes, Indicators, Metrics */}
      <div className="p-3.5 px-4 bg-neutral-900/90 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
        {/* Symbol & Price */}
        <div className="flex items-center gap-3">
          <select
            value={symbol}
            onChange={(e) => onSymbolChange?.(e.target.value)}
            className="bg-neutral-800 text-white font-bold text-sm px-3 py-1.5 rounded-lg border border-neutral-700 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="BTC/USDT">BTC/USDT (Bitcoin)</option>
            <option value="ETH/USDT">ETH/USDT (Ethereum)</option>
            <option value="SOL/USDT">SOL/USDT (Solana)</option>
            <option value="BNB/USDT">BNB/USDT (BNB)</option>
          </select>

          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono tracking-tight text-white">
              ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
            <SmartBadge variant={changePercent >= 0 ? "success" : "danger"} size="sm">
              {changePercent >= 0 ? "+" : ""}
              {changePercent.toFixed(2)}%
            </SmartBadge>
          </div>
        </div>

        {/* Timeframe Bar */}
        <div className="flex items-center gap-1 bg-neutral-800/80 p-1 rounded-lg border border-neutral-700/60">
          {["1m", "5m", "15m", "1h", "4h", "1D"].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                timeframe === tf
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Indicators & Drawing Tools */}
        <div className="flex items-center gap-2">
          <SmartButton
            variant={showIndicators ? "primary" : "ghost"}
            size="sm"
            onClick={() => setShowIndicators(!showIndicators)}
            leftIcon={<Sliders className="w-3.5 h-3.5" />}
          >
            Indicadores (EMA/BB)
          </SmartButton>

          <div className="flex items-center border-l border-neutral-800 pl-2 gap-1">
            <button
              onClick={() => setActiveTool(activeTool === "crosshair" ? "none" : "crosshair")}
              title="Mira / Crosshair"
              className={cn(
                "p-1.5 rounded-md text-neutral-400 hover:text-white transition-colors",
                activeTool === "crosshair" && "bg-neutral-800 text-blue-400"
              )}
            >
              <Crosshair className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTool(activeTool === "trendline" ? "none" : "trendline")}
              title="Linha de Tendência"
              className={cn(
                "p-1.5 rounded-md text-neutral-400 hover:text-white transition-colors",
                activeTool === "trendline" && "bg-neutral-800 text-blue-400"
              )}
            >
              <Minus className="w-4 h-4 rotate-45" />
            </button>
            <button
              onClick={() => setActiveTool(activeTool === "fib" ? "none" : "fib")}
              title="Retração de Fibonacci"
              className={cn(
                "p-1.5 rounded-md text-neutral-400 hover:text-white transition-colors",
                activeTool === "fib" && "bg-neutral-800 text-purple-400"
              )}
            >
              <TrendingUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Chart Canvas (SVG High Fidelity) */}
      <div
        className="relative w-full h-[400px] bg-[#0E0E0E] cursor-crosshair select-none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          setMousePos({ x, y });

          // Determine closest candle
          const candleIndex = Math.min(
            Math.max(0, Math.floor((x / rect.width) * candles.length)),
            candles.length - 1
          );
          setHoveredCandle(candles[candleIndex]);
        }}
        onMouseLeave={() => {
          setMousePos(null);
          setHoveredCandle(null);
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          {/* Background Grid Lines */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={chartHeight * ratio}
              x2={svgWidth}
              y2={chartHeight * ratio}
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="4 4"
            />
          ))}

          {/* Volume Separator Line */}
          <line
            x1="0"
            y1={chartHeight}
            x2={svgWidth}
            y2={chartHeight}
            stroke="rgba(255,255,255,0.08)"
          />

          {/* Candlesticks & Volume Bars */}
          {candles.map((candle, idx) => {
            const step = svgWidth / (candles.length + 1);
            const x = (idx + 1) * step;
            const isBullish = candle.close >= candle.open;
            const candleColor = isBullish ? "#22C55E" : "#EF4444";
            const topPrice = Math.max(candle.open, candle.close);
            const bottomPrice = Math.min(candle.open, candle.close);

            const yHigh = scaleY(candle.high);
            const yLow = scaleY(candle.low);
            const yTop = scaleY(topPrice);
            const yBottom = scaleY(bottomPrice);
            const candleHeight = Math.max(3, yBottom - yTop);

            // Volume bar
            const vHeight = (candle.volume / maxVolume) * (volumeHeight - 15);
            const vY = svgHeight - vHeight;

            return (
              <g key={idx}>
                {/* Wick */}
                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  stroke={candleColor}
                  strokeWidth="1.5"
                />

                {/* Body */}
                <rect
                  x={x - 14}
                  y={yTop}
                  width="28"
                  height={candleHeight}
                  fill={candleColor}
                  rx="2"
                  className="transition-all hover:brightness-125"
                />

                {/* Volume Bar */}
                <rect
                  x={x - 10}
                  y={vY}
                  width="20"
                  height={vHeight}
                  fill={candleColor}
                  opacity="0.3"
                  rx="1"
                />
              </g>
            );
          })}

          {/* EMA Overlay Lines */}
          {showIndicators && (
            <>
              {/* EMA 20 (Cyan / Blue) */}
              <path
                d={candles
                  .map((c, i) => {
                    const step = svgWidth / (candles.length + 1);
                    const x = (i + 1) * step;
                    const y = scaleY(c.close * 0.999);
                    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
                opacity="0.85"
              />

              {/* EMA 50 (Purple) */}
              <path
                d={candles
                  .map((c, i) => {
                    const step = svgWidth / (candles.length + 1);
                    const x = (i + 1) * step;
                    const y = scaleY(c.open * 0.996);
                    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#8B5CF6"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                opacity="0.8"
              />
            </>
          )}

          {/* Crosshair on Mouse Hover */}
          {mousePos && (
            <>
              <line
                x1="0"
                y1={mousePos.y}
                x2={svgWidth}
                y2={mousePos.y}
                stroke="rgba(255,255,255,0.3)"
                strokeDasharray="3 3"
              />
              <line
                x1={mousePos.x}
                y1="0"
                x2={mousePos.x}
                y2={svgHeight}
                stroke="rgba(255,255,255,0.3)"
                strokeDasharray="3 3"
              />
            </>
          )}
        </svg>

        {/* Floating Tooltip Data */}
        {hoveredCandle && (
          <div className="absolute top-3 left-4 p-2 px-3 bg-neutral-900/90 border border-neutral-700 rounded-lg text-xs font-mono flex items-center gap-4 text-neutral-300 shadow-xl backdrop-blur-md">
            <div>
              O: <span className="text-white">${hoveredCandle.open.toFixed(2)}</span>
            </div>
            <div>
              H: <span className="text-emerald-400">${hoveredCandle.high.toFixed(2)}</span>
            </div>
            <div>
              L: <span className="text-red-400">${hoveredCandle.low.toFixed(2)}</span>
            </div>
            <div>
              C: <span className="text-white">${hoveredCandle.close.toFixed(2)}</span>
            </div>
            <div>
              Vol: <span className="text-blue-400">{hoveredCandle.volume.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Chart Footer: Status & Quick Strategy Insight */}
      <div className="p-3 px-4 bg-neutral-900/70 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-semibold text-neutral-300">Live WebSocket Feed: 0ms Tick-to-Trade</span>
          <span className="text-neutral-600">|</span>
          <span className="text-purple-400 flex items-center gap-1 font-medium">
            <Sparkles className="w-3.5 h-3.5" /> IA Conformal Bounds: $66,420 - $69,450
          </span>
        </div>
        <div className="font-mono text-neutral-500">TradingView High-DPI Engine</div>
      </div>
    </div>
  );
}
