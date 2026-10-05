import { useCallback, useEffect, useState } from "react";

const REFRESH_MS = 120_000;
const MAX_SYMBOLS = 30;
const BATCH_SIZE = 5;

// Busca 24 h de candles de 1 h para os pares visíveis e mantém os fechamentos por símbolo.
export function useSparklines(symbols: string[], enabled: boolean) {
  const [data, setData] = useState<Record<string, number[]>>({});

  // A lista muda a cada tick; a chave estável evita refazer as buscas sem necessidade
  const key = symbols.slice(0, MAX_SYMBOLS).join(",");

  const fetchAll = useCallback(async () => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) return;

    const results: Record<string, number[]> = {};
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      await Promise.all(
        list.slice(i, i + BATCH_SIZE).map(async (symbol) => {
          try {
            const resp = await fetch(`/api/market/klines?symbol=${symbol}&interval=1h&limit=24`);
            if (!resp.ok) return;
            const result = await resp.json();
            if (result.data) {
              results[symbol] = result.data.map((k: { close: string }) => parseFloat(k.close));
            }
          } catch {
            // ignora o par com erro
          }
        })
      );
    }
    setData((prev) => ({ ...prev, ...results }));
  }, [key]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(fetchAll, 0);
    const interval = setInterval(fetchAll, REFRESH_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [enabled, fetchAll]);

  return data;
}
