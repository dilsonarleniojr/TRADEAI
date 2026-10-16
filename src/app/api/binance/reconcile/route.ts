import { NextResponse } from "next/server";
import { getBinanceCredentials } from "@/lib/binance-session";
import crypto from "crypto";

async function getSynchronizedTimestamp(baseUrl: string): Promise<number> {
  try {
    const timeRes = await fetch(`${baseUrl}/api/v3/time`, { cache: 'no-store' });
    if (timeRes.ok) {
      const timeData = await timeRes.json();
      if (typeof timeData.serverTime === 'number') {
        return timeData.serverTime;
      }
    }
  } catch {}
  return Date.now();
}

/**
 * GET /api/binance/reconcile
 * Lista todas as ordens abertas na Binance Spot (ou Testnet).
 */
export async function GET(request: Request) {
  try {
    const { apiKey, apiSecret, testnet } = getBinanceCredentials(request);

    if (!apiKey || !apiSecret) {
      return NextResponse.json({
        success: false,
        error: "Chaves de API da Binance não configuradas para este ambiente.",
        orders: [],
      }, { status: 400 });
    }

    const baseUrl = testnet ? "https://testnet.binance.vision" : "https://api.binance.com";
    const timestamp = await getSynchronizedTimestamp(baseUrl);
    const query = `timestamp=${timestamp}&recvWindow=60000`;
    const signature = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");

    const res = await fetch(`${baseUrl}/api/v3/openOrders?${query}&signature=${signature}`, {
      method: "GET",
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
      cache: "no-store",
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: data.msg || `Erro HTTP ${res.status} ao consultar openOrders na Binance.`,
        orders: [],
      }, { status: res.status });
    }

    const orders = Array.isArray(data) ? data.map((o: any) => ({
      orderId: String(o.orderId),
      clientOrderId: String(o.clientOrderId || ""),
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      price: parseFloat(o.price || "0"),
      origQty: parseFloat(o.origQty || "0"),
      executedQty: parseFloat(o.executedQty || "0"),
      status: o.status,
      time: Number(o.time),
    })) : [];

    return NextResponse.json({
      success: true,
      testnet,
      totalCount: orders.length,
      orders,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      orders: [],
    }, { status: 500 });
  }
}

/**
 * DELETE /api/binance/reconcile
 * Cancela ordens específicas ou todas as ordens abertas de um par na Binance.
 */
export async function DELETE(request: Request) {
  try {
    const { apiKey, apiSecret, testnet } = getBinanceCredentials(request);
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ success: false, error: "Chaves de API ausentes" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const orderId = searchParams.get("orderId");
    const cancelAllForSymbol = searchParams.get("cancelAll") === "true";

    const baseUrl = testnet ? "https://testnet.binance.vision" : "https://api.binance.com";

    if (cancelAllForSymbol && symbol) {
      const timestamp = await getSynchronizedTimestamp(baseUrl);
      const query = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=60000`;
      const signature = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");

      const cancelRes = await fetch(`${baseUrl}/api/v3/openOrders?${query}&signature=${signature}`, {
        method: "DELETE",
        headers: { "X-MBX-APIKEY": apiKey },
      });

      const cancelData = await cancelRes.json();
      if (!cancelRes.ok) {
        return NextResponse.json({ success: false, error: cancelData.msg || "Erro ao cancelar ordens do par" }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: `Todas as ordens de ${symbol} foram canceladas.`, data: cancelData });
    }

    if (symbol && orderId) {
      const timestamp = await getSynchronizedTimestamp(baseUrl);
      const query = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}&recvWindow=60000`;
      const signature = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");

      const cancelRes = await fetch(`${baseUrl}/api/v3/order?${query}&signature=${signature}`, {
        method: "DELETE",
        headers: { "X-MBX-APIKEY": apiKey },
      });

      const cancelData = await cancelRes.json();
      if (!cancelRes.ok) {
        return NextResponse.json({ success: false, error: cancelData.msg || "Erro ao cancelar ordem" }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: `Ordem ${orderId} cancelada com sucesso.`, data: cancelData });
    }

    return NextResponse.json({ success: false, error: "Parâmetros 'symbol' e opcional 'orderId' são necessários." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
