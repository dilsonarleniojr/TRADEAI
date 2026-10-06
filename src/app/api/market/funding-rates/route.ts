import { NextResponse } from "next/server";
import { fetchWithSWR } from "@/lib/cache/swr-cache";

interface PremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
}

const TRACKED_SYMBOLS = new Set([
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "NEARUSDT",
  "SUIUSDT",
]);

export async function GET() {
  try {
    const { data } = await fetchWithSWR(
      "binance_funding_rates",
      async () => {
        const res = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex", {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: PremiumIndex[] = await res.json();
        return list
          .filter((item) => TRACKED_SYMBOLS.has(item.symbol))
          .map((item) => ({
            symbol: item.symbol,
            markPrice: parseFloat(item.markPrice),
            indexPrice: parseFloat(item.indexPrice),
            fundingRate: parseFloat(item.lastFundingRate) * 100, // percentage e.g. 0.01%
            nextFundingTime: item.nextFundingTime,
            timestamp: item.time,
          }));
      },
      10 * 1000 // 10 segundos TTL
    );

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("[FundingRatesAPI] Erro ao buscar dados de financiamento:", err.message);
    return NextResponse.json(
      { success: false, error: err.message || "Erro ao consultar Binance Futures" },
      { status: 502 }
    );
  }
}
