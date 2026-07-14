import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, totalVolume, side } = body;

    if (!symbol || !totalVolume || !side) {
      return NextResponse.json(
        { success: false, error: "Symbol, totalVolume, and side are required" },
        { status: 400 }
      );
    }

    // Smart Order Routing (SOR) Simulation
    // Split order across multiple hypothetical order books (Binance Spot, Futures, and alternative pools)
    // to achieve the minimal average slippage and maximum execute rate
    const binanceSpotShare = totalVolume * 0.55;
    const binanceFuturesShare = totalVolume * 0.35;
    const crossOTCShare = totalVolume * 0.10;

    const simulatedAvgPrice = side === "BUY" ? 95000 * 1.0005 : 95000 * 0.9995;

    return NextResponse.json({
      success: true,
      data: {
        symbol,
        side,
        totalVolume,
        splits: [
          { exchange: "Binance Spot", volume: binanceSpotShare, percentage: 55, estSlippagePct: 0.02 },
          { exchange: "Binance Futures", volume: binanceFuturesShare, percentage: 35, estSlippagePct: 0.04 },
          { exchange: "Cross-OTC Pool", volume: crossOTCShare, percentage: 10, estSlippagePct: 0.01 },
        ],
        simulatedAveragePrice: simulatedAvgPrice,
        savingUsd: totalVolume * 0.0015, // estimated savings vs direct market order
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
