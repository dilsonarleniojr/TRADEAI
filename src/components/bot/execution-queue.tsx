"use client";

import type { ExecutionProgress } from "@/lib/store/tradeSlice";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

interface ExecutionQueueProps {
  botName: string;
  strategy: string;
  progress: ExecutionProgress;
}

export function ExecutionQueue({ botName, strategy, progress }: ExecutionQueueProps) {
  const pct = progress.totalSlices > 0 ? progress.slicesDone / progress.totalSlices : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span>{strategy} — {progress.slicesDone}/{progress.totalSlices} fatias</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {progress.estimatedMinutesLeft > 0 ? `~${progress.estimatedMinutesLeft}min` : "concluindo..."}
        </span>
      </div>
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-crypto-cyan rounded-full"
          style={{ filter: "drop-shadow(0 0 4px #22d3ee60)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground/60">
        <span>Vol exec: {progress.executedVolume.toFixed(2)}</span>
        <span>Rest: {progress.remainingVolume.toFixed(2)}</span>
      </div>
    </div>
  );
}
