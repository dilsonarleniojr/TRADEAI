"use client";

import React, { useEffect, useState } from "react";
import { globalFrameScheduler, type FrameMetrics } from "@/lib/performance/adaptive-frame-scheduler";
import { Gauge, Cpu, Zap, Leaf, AlertCircle } from "lucide-react";

export function RenderTelemetryHUD() {
  const [metrics, setMetrics] = useState<FrameMetrics>(globalFrameScheduler.getMetrics());
  const [heapMb, setHeapMb] = useState<number | null>(null);

  useEffect(() => {
    // Inscreve-se nas atualizações periódicas de telemetria
    const interval = setInterval(() => {
      setMetrics(globalFrameScheduler.getMetrics());

      // Consulta heap do JS se disponível no runtime do browser/Electron (Chromium)
      if (typeof performance !== "undefined" && (performance as any).memory) {
        const used = (performance as any).memory.usedJSHeapSize;
        if (typeof used === "number") {
          setHeapMb(Math.round((used / (1024 * 1024)) * 10) / 10);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const isJankHigh = metrics.jankRatePct > 5.0;
  const isFastFrame = metrics.lastFrameDurationUs < 4000; // < 4ms

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-300 border ${
        metrics.isThrottled
          ? "bg-slate-900/80 border-emerald-500/30 text-emerald-400"
          : isJankHigh
          ? "bg-rose-950/80 border-rose-500/40 text-rose-300 animate-pulse"
          : "bg-slate-950/80 border-slate-800 text-slate-300 shadow-sm"
      }`}
      title={`Frametime: ${metrics.lastFrameDurationUs} µs | Jank Rate: ${metrics.jankRatePct}% | Total Frames: ${metrics.totalFrames}`}
    >
      {/* 1. Modo de Execução (V-Sync Nativo vs Eco Background) */}
      <div className="flex items-center gap-1">
        {metrics.isThrottled ? (
          <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20">
            <Leaf className="w-2.5 h-2.5" />
            ECO 2 FPS
          </span>
        ) : (
          <span className="flex items-center gap-1 text-cyan-400 font-bold bg-cyan-500/10 px-1 py-0.5 rounded border border-cyan-500/20">
            <Zap className="w-2.5 h-2.5 text-cyan-400" />
            {metrics.fps > 0 ? `${metrics.fps} FPS` : "V-SYNC"}
          </span>
        )}
      </div>

      <span className="text-slate-600">|</span>

      {/* 2. Frametime em Microssegundos (µs) */}
      <div className="flex items-center gap-1">
        <Gauge className={`w-2.5 h-2.5 ${isFastFrame ? "text-emerald-400" : "text-amber-400"}`} />
        <span className="text-slate-400">FRAME:</span>
        <span
          className={`font-semibold ${
            metrics.lastFrameDurationUs > 16666
              ? "text-rose-400"
              : metrics.lastFrameDurationUs > 5000
              ? "text-amber-300"
              : "text-emerald-300"
          }`}
        >
          {metrics.lastFrameDurationUs} µs
        </span>
      </div>

      <span className="text-slate-600">|</span>

      {/* 3. Jank Rate (%) */}
      <div className="flex items-center gap-1">
        {isJankHigh && <AlertCircle className="w-2.5 h-2.5 text-rose-400" />}
        <span className="text-slate-400">JANK:</span>
        <span className={`font-semibold ${isJankHigh ? "text-rose-400 font-bold" : "text-slate-200"}`}>
          {metrics.jankRatePct}%
        </span>
      </div>

      {/* 4. Heap Memory (se suportado pelo Chromium) */}
      {heapMb !== null && (
        <>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1 text-slate-400">
            <Cpu className="w-2.5 h-2.5 text-purple-400" />
            <span>HEAP:</span>
            <span className="text-purple-300 font-semibold">{heapMb} MB</span>
          </div>
        </>
      )}

      {/* 5. Motor de Render & IPC Atômico */}
      <span className="text-slate-600">|</span>
      <div className="flex items-center gap-1">
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold">
          GPU WEBGL2
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
          ATOMICS SAB
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
          L2 HEATMAP GPU
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
          GPU TF COMPUTE
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 font-semibold">
          WEBGPU COMPUTE
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30 font-semibold">
          SIMD SUBGROUPS
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-pink-500/15 text-pink-300 border border-pink-500/30 font-semibold">
          SHUFFLE ICEBERGS
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
          BLUE-B ICEBERG
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
          BLOOM PASS VRAM
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold">
          DUAL-AXIS BLOOM
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 font-semibold">
          MIPMAP TRILINEAR
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
          DYNAMIC ATR QUANT
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
          1D PALETTE COMPRESS
        </span>
        <span className="text-[8.5px] px-1 py-0.2 rounded bg-lime-500/15 text-lime-300 border border-lime-500/30 font-semibold">
          AUTO ATR HOOK
        </span>
      </div>
    </div>
  );
}
