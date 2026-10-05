"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCryptoStore } from "@/lib/store";
import { useDataProvider } from "@/lib/data-provider";

const STALE_AFTER_MS = 60_000;

function formatAge(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 90) return `${s} s`;
  return `${Math.floor(s / 60)} min`;
}

// Avisa quando os dados de mercado pararam de chegar, para ninguém decidir com preço antigo.
export function DataFreshnessBanner() {
  const lastMarketUpdate = useCryptoStore((s) => s.lastMarketUpdate);
  const connectionStatus = useCryptoStore((s) => s.connectionStatus);
  const { syncBinanceCoins } = useDataProvider();
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const age = lastMarketUpdate > 0 ? now - lastMarketUpdate : 0;
  const offline = connectionStatus === "disconnected";
  const stale = lastMarketUpdate > 0 && age > STALE_AFTER_MS;

  if (!offline && !stale) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await syncBinanceCoins();
    } finally {
      setRetrying(false);
      setNow(Date.now());
    }
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-crypto-gold/40 bg-crypto-gold/10 px-3.5 py-2.5 text-xs"
    >
      {offline ? (
        <WifiOff className="w-4 h-4 text-crypto-gold shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-crypto-gold shrink-0" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-[200px]">
        <span className="font-semibold text-foreground">
          {offline ? "Sem conexão com a Binance." : `Dados de mercado atrasados há ${formatAge(age)}.`}
        </span>{" "}
        <span className="text-muted-foreground">
          Preços e sinais abaixo podem não refletir o mercado agora. Evite operar até normalizar.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRetry}
        disabled={retrying}
        className="h-9 gap-1.5 text-xs border-crypto-gold/40 text-crypto-gold hover:bg-crypto-gold/15 cursor-pointer"
      >
        {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Atualizar agora
      </Button>
    </div>
  );
}
