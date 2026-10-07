import { NextRequest, NextResponse } from "next/server";
import { getOrderBookAnalysis } from "@/lib/bot/order-book-cache";
import { runSignalAgent } from "@/lib/ai/signal-agent";

// Sinal de IA com Tool Use. O agente consulta os motores reais (candles/indicadores, livro L2,
// funding/scanner, risco) e o gatekeeper recalcula o R:R. Qualquer falha do LLM vira HOLD com
// agent_error = true: um erro de sistema nunca gera BUY/SELL.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbol,
      price = 0,
      priceChange24h = 0,
      volume = 0,
      quoteVolume = 0,
      high24h = 0,
      low24h = 0,
    } = body;

    const cleanSymbol = symbol ? (symbol.endsWith("USDT") ? symbol : `${symbol}USDT`) : "BTCUSDT";
    const numericPrice = Number(price) || 0;

    // Contexto de fluxo (exibido no painel e enviado ao agente como resumo inicial).
    const vwap =
      volume > 0 && quoteVolume > 0
        ? quoteVolume / volume
        : high24h > 0 && low24h > 0
        ? (high24h + low24h + numericPrice) / 3
        : numericPrice;
    const vwapDistancePercent = vwap > 0 ? ((numericPrice - vwap) / vwap) * 100 : 0;

    let orderFlowImbalance: number | undefined;
    try {
      const depth = await getOrderBookAnalysis(cleanSymbol);
      // bestBid = 0 indica placeholder do cache. ok = false com preços válidos é só o filtro do robô.
      if (depth.bestBid > 0) orderFlowImbalance = depth.orderFlowImbalance;
    } catch {
      // O agente pode consultar o livro pela ferramenta própria.
    }

    let fundingRatePercent: number | undefined;
    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${cleanSymbol}`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.lastFundingRate !== undefined) fundingRatePercent = parseFloat(data.lastFundingRate) * 100;
      }
    } catch {
      // Sem funding: o campo fica ausente em vez de assumir um valor.
    }

    const liquidityController =
      orderFlowImbalance === undefined
        ? "Livro de ofertas indisponível"
        : orderFlowImbalance > 0.15
        ? "Compradores agressivos controlando o book"
        : orderFlowImbalance < -0.15
        ? "Vendedores institucionais pressionando o book"
        : "Liquidez equilibrada sem absorção clara";

    const brief = [
      `Variação 24h: ${priceChange24h}% | Máx: ${high24h} | Mín: ${low24h}`,
      `VWAP 24h: ${vwap.toFixed(6)} (distância ${vwapDistancePercent.toFixed(2)}%)`,
      orderFlowImbalance !== undefined ? `OFI atual: ${orderFlowImbalance.toFixed(3)}` : null,
      fundingRatePercent !== undefined ? `Funding 8h: ${fundingRatePercent.toFixed(4)}%` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await runSignalAgent(cleanSymbol, numericPrice, brief);

    if (result.agent_error) {
      console.warn(`[SignalAgent] Fail-safe HOLD para ${cleanSymbol}: ${result.error_reason}`);
    } else if (result.vetoed) {
      console.warn(`[RiskMatrixGatekeeper] ${cleanSymbol}: ${result.veto_reason}`);
    }

    return NextResponse.json({
      success: true,
      signal: {
        ...result,
        // Compatibilidade com componentes existentes
        action: result.signal,
        confidence: result.confidence_score / 100,
        reasoning: result.key_driver,
        stopLoss: result.stop_loss,
        takeProfit: result.take_profit,
        flow_context: {
          vwap: Math.round(vwap * 10000) / 10000,
          vwap_distance_percent: Math.round(vwapDistancePercent * 100) / 100,
          order_flow_imbalance:
            orderFlowImbalance !== undefined ? Math.round(orderFlowImbalance * 1000) / 1000 : undefined,
          funding_rate_percent:
            fundingRatePercent !== undefined ? Math.round(fundingRatePercent * 10000) / 10000 : undefined,
          liquidity_controller: liquidityController,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("AI Signal error:", error);
    return NextResponse.json({ error: "Falha ao gerar sinal", details: message }, { status: 500 });
  }
}
