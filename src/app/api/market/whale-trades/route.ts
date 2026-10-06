import { NextResponse } from "next/server";
import { fetchWithSWR } from "@/lib/cache/swr-cache";

interface AggTrade {
  a: number; // Aggregate tradeId
  p: string; // Price
  q: string; // Quantity
  T: number; // Timestamp
  m: boolean; // Was buyer maker (m: true => sell, m: false => buy)
}

const TOP_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT"];

export async function GET() {
  try {
    const { data } = await fetchWithSWR(
      "binance_whale_trades",
      async () => {
        const symbolPromises = TOP_SYMBOLS.map(async (symbol) => {
          try {
            const res = await fetch(`https://api.binance.com/api/v3/aggTrades?symbol=${symbol}&limit=60`, {
              signal: AbortSignal.timeout(3500),
            });
            if (!res.ok) return [];
            const trades: AggTrade[] = await res.json();

            return trades
              .map((t) => {
                const price = parseFloat(t.p);
                const amountCoin = parseFloat(t.q);
                const amountUSD = price * amountCoin;
                return {
                  id: `${symbol}-${t.a}`,
                  symbol: symbol.replace("USDT", ""),
                  rawSymbol: symbol,
                  side: (t.m ? "SELL" : "BUY") as "BUY" | "SELL",
                  price,
                  amountUSD,
                  amountCoin,
                  timestamp: t.T,
                };
              })
              // Whales: consider trades over $10,000 USD
              .filter((t) => t.amountUSD >= 10000);
          } catch {
            return [];
          }
        });

        const results = await Promise.all(symbolPromises);
        return results
          .flat()
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 30);
      },
      3500 // 3.5 segundos TTL
    );

    return NextResponse.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Falha ao obter trades de baleias" },
      { status: 502 }
    );
  }
}
