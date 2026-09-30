"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Cpu, Wifi, RefreshCw, Database } from "lucide-react";

interface TelemetryMetric {
  label: string;
  value: string;
  status: "ok" | "warn" | "error";
  icon: React.ReactNode;
}

export function TelemetryRibbon() {
  const [ping, setPing] = useState(12);
  const [mlTime, setMlTime] = useState(38);
  const [heap, setHeap] = useState(48);
  const [syncAge, setSyncAge] = useState(0);
  const [wsRecon, setWsRecon] = useState(0);

  // Simulate real-time telemetry updates
  useEffect(() => {
    const iv = setInterval(() => {
      setPing((p) => Math.max(4, Math.min(120, p + (Math.random() - 0.5) * 6)));
      setMlTime((m) => Math.max(20, Math.min(200, m + (Math.random() - 0.5) * 10)));
      setHeap((h) => Math.max(30, Math.min(95, h + (Math.random() - 0.5) * 2)));
      setSyncAge((a) => (a + 1) % 60);
    }, 1500);
    return () => clearInterval(iv);
  }, []);

  const metrics: TelemetryMetric[] = [
    {
      label: "WebSocket",
      value: `${ping.toFixed(0)}ms`,
      status: ping < 30 ? "ok" : ping < 80 ? "warn" : "error",
      icon: <Wifi className="w-3 h-3" />,
    },
    {
      label: "ML Inference",
      value: `${mlTime.toFixed(0)}ms`,
      status: mlTime < 60 ? "ok" : mlTime < 120 ? "warn" : "error",
      icon: <Cpu className="w-3 h-3" />,
    },
    {
      label: "Heap",
      value: `${heap.toFixed(0)}%`,
      status: heap < 70 ? "ok" : heap < 85 ? "warn" : "error",
      icon: <Activity className="w-3 h-3" />,
    },
    {
      label: "Sync",
      value: `${syncAge}s atrás`,
      status: syncAge < 30 ? "ok" : syncAge < 50 ? "warn" : "error",
      icon: <RefreshCw className="w-3 h-3" />,
    },
    {
      label: "Reconnects",
      value: String(wsRecon),
      status: wsRecon === 0 ? "ok" : wsRecon < 3 ? "warn" : "error",
      icon: <Database className="w-3 h-3" />,
    },
  ];

  const statusColor = {
    ok: "text-emerald-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };
  const statusDot = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    error: "bg-red-400",
  };

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 border-b border-white/5 bg-black/20 overflow-x-auto">
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center gap-1.5 shrink-0">
          <motion.div
            className={`w-1.5 h-1.5 rounded-full ${statusDot[m.status]}`}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className={`text-[10px] font-mono ${statusColor[m.status]}`}>
            {m.label}
          </span>
          <span className="text-[10px] font-mono text-foreground/60">{m.value}</span>
        </div>
      ))}
    </div>
  );
}
