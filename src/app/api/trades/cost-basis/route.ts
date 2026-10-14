import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBinanceCredentials } from "@/lib/binance-session";
import crypto from "crypto";

interface TradeRecord {
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  timestamp: Date;
}

/**
 * Calcula o preço médio ponderado real das compras não vendidas (FIFO/Custo Médio Ponderado)
 */
function calculateCostBasis(trades: TradeRecord[]) {
  let openQty = 0;
  let totalCost = 0;
  let lastBuyPrice = 0;
  let lastBuyTime: string | null = null;
  let buyTradesCount = 0;

  for (const t of trades) {
    if (t.side === "BUY") {
      openQty += t.quantity;
      totalCost += t.quantity * t.price;
      lastBuyPrice = t.price;
      lastBuyTime = t.timestamp.toISOString();
      buyTradesCount++;
    } else if (t.side === "SELL") {
      const avgBefore = openQty > 0 ? totalCost / openQty : 0;
      openQty -= t.quantity;
      if (openQty <= 0.0000001) {
        openQty = 0;
        totalCost = 0;
      } else {
        totalCost = openQty * avgBefore;
      }
    }
  }

  const avgPrice = openQty > 0 ? totalCost / openQty : lastBuyPrice;

  return {
    openQty: parseFloat(openQty.toFixed(8)),
    avgPrice: parseFloat(avgPrice.toFixed(8)),
    totalCost: parseFloat(totalCost.toFixed(4)),
    lastBuyPrice,
    lastBuyTime,
    buyTradesCount,
    hasHistory: trades.length > 0,
  };
}

/**
 * Sincroniza trades da Binance para a tabela Trade local caso haja trades recentes não salvos
 */
async function syncBinanceTrades(symbol: string, apiKey: string, apiSecret: string, testnet: boolean) {
  if (!apiKey || !apiSecret) return;
  const baseUrl = testnet ? "https://testnet.binance.vision" : "https://api.binance.com";
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&timestamp=${timestamp}&limit=100`;
  const signature = crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
  const url = `${baseUrl}/api/v3/myTrades?${queryString}&signature=${signature}`;

  try {
    const res = await fetch(url, {
      headers: { "X-MBX-APIKEY": apiKey },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!res.ok) return;
    const binanceTrades: any[] = await res.json();

    for (const bt of binanceTrades) {
      const tradeId = `binance_${symbol}_${bt.id}`;
      const side = bt.isBuyer ? "BUY" : "SELL";
      const price = parseFloat(bt.price);
      const quantity = parseFloat(bt.qty);
      const total = parseFloat(bt.quoteQty) || price * quantity;
      const tradeTime = new Date(bt.time);

      // Upsert ou verifica existência
      const existing = await db.trade.findUnique({
        where: { id: tradeId },
      });

      if (!existing) {
        await db.trade.create({
          data: {
            id: tradeId,
            symbol,
            side,
            price,
            quantity,
            total,
            strategy: "Binance Sync",
            mode: "live",
            pnl: 0,
            timestamp: tradeTime,
          },
        });
      }
    }
  } catch (err: any) {
    console.warn(`[CostBasis API] Falha na sincronização de myTrades para ${symbol}:`, err.message);
  }
}

// GET /api/trades/cost-basis?symbol=BTCUSDT&mode=live
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolParam = searchParams.get("symbol");
    const mode = searchParams.get("mode") === "live" ? "live" : "paper";

    if (!symbolParam) {
      return NextResponse.json(
        { success: false, error: "Parâmetro 'symbol' obrigatório" },
        { status: 400 }
      );
    }

    const cleanSym = symbolParam.trim().toUpperCase();
    const symbol = cleanSym.endsWith("USDT") ? cleanSym : `${cleanSym}USDT`;

    // 1. Em modo live, sincronizar com Binance se tiver credenciais
    if (mode === "live") {
      const { apiKey, apiSecret, testnet } = getBinanceCredentials(request);
      if (apiKey && apiSecret) {
        await syncBinanceTrades(symbol, apiKey, apiSecret, testnet);
      }
    }

    // 2. Buscar trades no banco de dados local
    const trades = await db.trade.findMany({
      where: {
        symbol,
        mode,
      },
      orderBy: { timestamp: "asc" },
    });

    const basis = calculateCostBasis(trades);

    return NextResponse.json({
      success: true,
      data: {
        symbol,
        mode,
        costKnown: basis.hasHistory && basis.avgPrice > 0,
        avgBuyPrice: basis.avgPrice,
        openQuantity: basis.openQty,
        totalCost: basis.totalCost,
        lastBuyPrice: basis.lastBuyPrice,
        lastBuyTime: basis.lastBuyTime,
        tradesCount: trades.length,
        buyTradesCount: basis.buyTradesCount,
      },
    });
  } catch (error: any) {
    console.error("[CostBasis API] Erro ao apurar base de custo:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
