import { NextResponse } from "next/server";
import { runBacktestSimulation, runGridSearchCalibration, type BacktestParams } from "@/lib/bot/backtest-engine";
import type { KlineData } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const symbol = (body.symbol || "BTCUSDT").trim().toUpperCase();
    const interval = body.interval || "15m";
    const limit = Math.min(1000, Math.max(100, Number(body.limit || 500)));
    const mode = body.mode || "simulate";

    const params: BacktestParams = {
      symbol,
      strategy: body.strategy || "QUANT_ENSEMBLE",
      allocationAmount: Number(body.allocationAmount || 100),
      takeProfit: Number(body.takeProfit || 2.5),
      stopLoss: Number(body.stopLoss || 1.2),
      trailingStop: body.trailingStop !== false,
      trailingStopDistance: Number(body.trailingStopDistance || 0.6),
      takerFeePercent: Number(body.takerFeePercent || 0.075),
      slippagePercent: Number(body.slippagePercent || 0.05),
    };

    // 1. Busca klines históricos da Binance
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Erro HTTP ${res.status} ao carregar klines da Binance para ${symbol}.` },
        { status: res.status }
      );
    }

    const rawKlines = await res.json();
    if (!Array.isArray(rawKlines) || rawKlines.length < 30) {
      return NextResponse.json(
        { success: false, error: "Histórico insuficiente de velas para backtesting." },
        { status: 400 }
      );
    }

    const klines: KlineData[] = rawKlines.map((r: any) => ({
      time: Number(r[0]),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
    }));

    if (mode === "calibrate") {
      const calibrationResult = runGridSearchCalibration(
        symbol,
        klines,
        params.allocationAmount,
        body.targetStrategy
      );
      return NextResponse.json({
        success: true,
        mode: "calibrate",
        data: calibrationResult,
        candlesCount: klines.length,
        periodStart: klines[0].time,
        periodEnd: klines[klines.length - 1].time,
      });
    }

    // 2. Executa a simulação de backtesting candle a candle
    const result = runBacktestSimulation(klines, params);

    return NextResponse.json({
      success: true,
      mode: "simulate",
      data: result,
      candlesCount: klines.length,
      periodStart: klines[0].time,
      periodEnd: klines[klines.length - 1].time,
    });
  } catch (err: any) {
    console.error("[BacktestAPI] Erro na execução:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Erro interno ao executar backtest." },
      { status: 500 }
    );
  }
}
