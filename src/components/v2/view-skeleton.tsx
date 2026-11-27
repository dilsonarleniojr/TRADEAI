"use client";

import React, { useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface ViewSkeletonProps {
  label: string;
  onRetry?: () => void;
}

export function ViewSkeleton({ label, onRetry }: ViewSkeletonProps) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 10_000);
    return () => clearTimeout(timer);
  }, []);

  if (timedOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[45vh] gap-3 text-center p-6 bg-white dark:bg-[#0f1622] rounded-[24px] border border-[#E7EBF0] dark:border-white/10 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-[#FFF4DC] text-[#6B4300] flex items-center justify-center shadow-xs">
          <RefreshCw className="w-6 h-6 text-[#6B4300]" />
        </div>
        <h4 className="text-[16px] font-bold text-[#0E1B2C] dark:text-white">
          O carregamento de {label} demorou mais que o esperado
        </h4>
        <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] max-w-sm">
          A conexão pode estar oscilando ou os dados de mercado estão demorando a responder.
        </p>
        <button
          onClick={() => {
            setTimedOut(false);
            if (onRetry) {
              onRetry();
            } else {
              window.location.reload();
            }
          }}
          className="mt-2 px-5 py-2 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] text-[13px] font-semibold hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Tentar novamente</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[45vh] gap-3 p-6">
      <div className="w-12 h-12 rounded-2xl bg-[#0E1B2C] text-white flex items-center justify-center shadow-lg">
        <Loader2 className="w-6 h-6 text-[#5BE3A8] animate-spin" />
      </div>
      <p className="text-sm font-instrument-sans font-medium text-[#4A586A] dark:text-[#94a3b8] animate-pulse">
        Carregando {label}...
      </p>
    </div>
  );
}
