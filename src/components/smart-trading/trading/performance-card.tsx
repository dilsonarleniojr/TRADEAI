import * as React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartBadge } from "../ui/badge";

export interface PerformanceCardProps {
  title: string;
  value: string;
  subvalue?: string;
  subtext?: string;
  changePercent?: number;
  changeTimeframe?: string;
  changePeriod?: string;
  icon?: React.ReactNode;
  sparklineData?: number[];
}

export function SmartPerformanceCard({
  title,
  value,
  subvalue,
  subtext,
  changePercent,
  changeTimeframe = "24h",
  changePeriod,
  icon,
  sparklineData = [20, 24, 22, 28, 25, 30, 35, 34, 40],
}: PerformanceCardProps) {
  const isPositive = (changePercent ?? 0) >= 0;
  const activeSubvalue = subtext || subvalue;
  const activePeriod = changePeriod || changeTimeframe;

  // Mini sparkline SVG
  const min = Math.min(...sparklineData);
  const max = Math.max(...sparklineData);
  const range = max - min || 1;
  const width = 100;
  const height = 32;

  const points = sparklineData
    .map((val, idx) => {
      const x = (idx / (sparklineData.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="p-5 rounded-2xl bg-[#141414] border border-neutral-800 shadow-xl flex flex-col justify-between hover:border-neutral-700 transition-all select-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400">
          {title}
        </span>
        {icon && <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800">{icon}</div>}
      </div>

      <div className="my-3">
        <div className="text-2xl font-extrabold font-mono text-white tracking-tight">{value}</div>
        {activeSubvalue && <div className="text-xs text-neutral-400 mt-0.5">{activeSubvalue}</div>}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
        {changePercent !== undefined ? (
          <div className="flex items-center gap-1.5">
            <SmartBadge variant={isPositive ? "success" : "danger"} size="sm">
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isPositive ? "+" : ""}
              {changePercent.toFixed(2)}%
            </SmartBadge>
            <span className="text-[11px] text-neutral-500">{activePeriod}</span>
          </div>
        ) : (
          <span className="text-[11px] text-neutral-500">Métrica Consolidada</span>
        )}

        {/* Sparkline */}
        <div className="w-[100px] h-[32px]">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <polyline
              fill="none"
              stroke={isPositive ? "#22C55E" : "#EF4444"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
