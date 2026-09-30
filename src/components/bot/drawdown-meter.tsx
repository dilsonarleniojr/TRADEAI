"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface DrawdownMeterProps {
  currentEquity: number;
  drawdownLimit: number;
  peakEquity: number;
  totalAccount: number;
}

export function DrawdownMeter({
  currentEquity,
  drawdownLimit,
  peakEquity,
  totalAccount,
}: DrawdownMeterProps) {
  const { pct, color, label } = useMemo(() => {
    const safeFloor = drawdownLimit;
    const range = totalAccount - safeFloor;
    const distFromFloor = Math.max(0, currentEquity - safeFloor);
    const pct = range > 0 ? Math.min(1, distFromFloor / range) : 1;

    let color: string;
    let label: string;
    if (pct > 0.6) { color = "#22c55e"; label = "SEGURO"; }
    else if (pct > 0.25) { color = "#f59e0b"; label = "ALERTA"; }
    else { color = "#ef4444"; label = "CRÍTICO"; }

    return { pct, color, label };
  }, [currentEquity, drawdownLimit, peakEquity, totalAccount]);

  // SVG arc parameters
  const R = 54;
  const CX = 70;
  const CY = 70;
  const startAngle = 140;
  const endAngle = 400;
  const sweep = endAngle - startAngle;
  const arcLen = (sweep / 360) * 2 * Math.PI * R;
  const filledLen = pct * arcLen;

  function polarToXY(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  }

  function arcPath(from: number, to: number) {
    const s = polarToXY(from);
    const e = polarToXY(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const bgPath = arcPath(startAngle, endAngle);
  const fgPath = arcPath(startAngle, startAngle + pct * sweep);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="100" viewBox="0 0 140 100">
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <motion.path
          d={fgPath}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
        {/* Center text */}
        <text x={CX} y={CY - 6} textAnchor="middle" fill={color} fontSize="13" fontWeight="bold" fontFamily="monospace">
          ${currentEquity.toFixed(0)}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="monospace">
          limite ${drawdownLimit.toFixed(0)}
        </text>
        {/* Label */}
        <text x={CX} y={CY + 26} textAnchor="middle" fill={color} fontSize="8" fontWeight="bold" fontFamily="monospace">
          {label}
        </text>
      </svg>
      <span className="text-[10px] text-muted-foreground font-mono">Termômetro da Conta</span>
    </div>
  );
}
