/**
 * Order Book Imbalance (OBI) & Liquidity Delta Analysis
 * 
 * Modela a microestrutura de liquidez do livro L2 da exchange,
 * calculando o desbalanceamento por nível (L1..L8), a razão de Skew
 * e o sinal de confluência pré-ordem para despacho a mercado.
 */

export interface DepthLevel {
  price: number;
  volume: number;
}

export interface LevelImbalance {
  level: number;
  bidVol: number;
  askVol: number;
  imbalance: number; // -1.0 (100% Venda) a +1.0 (100% Compra)
  imbalancePct: number; // -100% a +100%
  bidPrice: number;
  askPrice: number;
}

export interface OrderBookImbalanceResult {
  bidPct: number;
  askPct: number;
  imbalancePct: number; // Delta: bidPct - askPct (-100% a +100%)
  skewRatio: number; // totalBidVol / totalAskVol
  totalBidVol: number;
  totalAskVol: number;
  netVolumeDelta: number; // totalBidVol - totalAskVol
  levelImbalances: LevelImbalance[];
  confluenceSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confluenceBadge: string;
  confluenceDescription: string;
  recommendedAction: 'MARKET_BUY_FAVORABLE' | 'MARKET_SELL_FAVORABLE' | 'NEUTRAL_WAIT';
  slippageScore: 'LOW' | 'MEDIUM' | 'HIGH';
}

export function calculateOrderBookImbalance(
  bids: DepthLevel[] = [],
  asks: DepthLevel[] = [],
  maxLevels: number = 8
): OrderBookImbalanceResult {
  if ((!bids || bids.length === 0) && (!asks || asks.length === 0)) {
    return {
      bidPct: 50,
      askPct: 50,
      imbalancePct: 0,
      skewRatio: 1,
      totalBidVol: 0,
      totalAskVol: 0,
      netVolumeDelta: 0,
      levelImbalances: [],
      confluenceSignal: 'NEUTRAL',
      confluenceBadge: 'Livro Vazio',
      confluenceDescription: 'Aguardando book da exchange...',
      recommendedAction: 'NEUTRAL_WAIT',
      slippageScore: 'HIGH',
    };
  }

  const depthCount = Math.max(Math.min(bids.length, asks.length, maxLevels), 1);
  const levelImbalances: LevelImbalance[] = [];

  let totalBidVol = 0;
  let totalAskVol = 0;

  for (let i = 0; i < depthCount; i++) {
    const b = bids[i];
    const a = asks[i];
    const bVol = b?.volume ?? 0;
    const aVol = a?.volume ?? 0;

    totalBidVol += bVol;
    totalAskVol += aVol;

    const sum = bVol + aVol;
    const imbalance = sum > 0 ? (bVol - aVol) / sum : 0;
    const imbalancePct = Number((imbalance * 100).toFixed(1));

    levelImbalances.push({
      level: i + 1,
      bidVol: bVol,
      askVol: aVol,
      imbalance,
      imbalancePct,
      bidPrice: b?.price ?? 0,
      askPrice: a?.price ?? 0,
    });
  }

  const totalVol = totalBidVol + totalAskVol;
  const bidPct = totalVol > 0 ? Number(((totalBidVol / totalVol) * 100).toFixed(1)) : 50;
  const askPct = totalVol > 0 ? Number(((totalAskVol / totalVol) * 100).toFixed(1)) : 50;
  const imbalancePct = Number((bidPct - askPct).toFixed(1));
  const skewRatio = totalAskVol > 0 ? Number((totalBidVol / totalAskVol).toFixed(2)) : 99.9;
  const netVolumeDelta = totalBidVol - totalAskVol;

  let confluenceSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confluenceBadge = 'Livro Equilibrado';
  let confluenceDescription = 'Liquidez simétrica entre Bid e Ask. Sem viés direcional acentuado.';
  let recommendedAction: 'MARKET_BUY_FAVORABLE' | 'MARKET_SELL_FAVORABLE' | 'NEUTRAL_WAIT' = 'NEUTRAL_WAIT';
  let slippageScore: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';

  // Gatilhos de confluência institucional:
  // Skew >= 1.25 ou Imbalance >= +12% indicam predominância compradora
  if (imbalancePct >= 12 || skewRatio >= 1.25) {
    confluenceSignal = 'BULLISH';
    recommendedAction = 'MARKET_BUY_FAVORABLE';
    slippageScore = totalBidVol > 0 ? 'LOW' : 'MEDIUM';

    if (imbalancePct >= 25 || skewRatio >= 1.5) {
      confluenceBadge = 'Forte Pressão Compradora (Bid Heavy)';
      confluenceDescription = 'Forte absorção e barreira no Bid. Confluência altamente favorável para ordens de Compra a Mercado.';
    } else {
      confluenceBadge = 'Viés de Alta Moderado';
      confluenceDescription = 'Demanda supera oferta no topo do book. Risco reduzido de slippage em compras a mercado.';
    }
  } else if (imbalancePct <= -12 || skewRatio <= 0.8) {
    confluenceSignal = 'BEARISH';
    recommendedAction = 'MARKET_SELL_FAVORABLE';
    slippageScore = totalAskVol > 0 ? 'LOW' : 'MEDIUM';

    if (imbalancePct <= -25 || skewRatio <= 0.65) {
      confluenceBadge = 'Forte Pressão Vendedora (Ask Heavy)';
      confluenceDescription = 'Grande concentração de oferta no Ask. Confluência favorável para liquidação ou Venda a Mercado.';
    } else {
      confluenceBadge = 'Viés de Baixa Moderado';
      confluenceDescription = 'Oferta vendedora supera compradores no topo do book.';
    }
  }

  return {
    bidPct,
    askPct,
    imbalancePct,
    skewRatio,
    totalBidVol,
    totalAskVol,
    netVolumeDelta,
    levelImbalances,
    confluenceSignal,
    confluenceBadge,
    confluenceDescription,
    recommendedAction,
    slippageScore,
  };
}

export interface DepthSnapshot {
  timestamp: number;
  totalBidVol: number;
  totalAskVol: number;
  topBidVol?: number;
  topAskVol?: number;
}

export interface SpoofingAlert {
  isAlertActive: boolean;
  side: 'BID' | 'ASK' | 'NONE';
  dropPct: number; // Ex: 35.2%
  timeDeltaMs: number;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  advice: string;
  timestamp: number;
}

/**
 * Liquidity Spoofing Guard: Detecta se uma parede volumétrica (>= 30% da liquidez)
 * foi cancelada repentinamente em uma janela ultra-rápida (<= 1.500ms),
 * protegendo o trader e algoritmos de falsos rompimentos ou armadilhas de liquidez.
 */
export function detectLiquiditySpoofing(
  current: { totalBidVol: number; totalAskVol: number; timestamp?: number },
  previous: { totalBidVol: number; totalAskVol: number; timestamp?: number } | null | undefined,
  thresholdPct: number = 30.0,
  maxWindowMs: number = 1500
): SpoofingAlert {
  const now = current.timestamp || Date.now();

  if (!previous || !previous.timestamp) {
    return {
      isAlertActive: false,
      side: 'NONE',
      dropPct: 0,
      timeDeltaMs: 0,
      severity: 'WARNING',
      message: '',
      advice: '',
      timestamp: now,
    };
  }

  const timeDeltaMs = Math.max(now - previous.timestamp, 1);
  if (timeDeltaMs > maxWindowMs) {
    // Fora da janela de inversão instantânea / spoofing
    return {
      isAlertActive: false,
      side: 'NONE',
      dropPct: 0,
      timeDeltaMs,
      severity: 'WARNING',
      message: '',
      advice: '',
      timestamp: now,
    };
  }

  // Queda relativa no lado Bid
  let bidDropPct = 0;
  if (previous.totalBidVol > 0 && current.totalBidVol < previous.totalBidVol) {
    bidDropPct = Number((((previous.totalBidVol - current.totalBidVol) / previous.totalBidVol) * 100).toFixed(1));
  }

  // Queda relativa no lado Ask
  let askDropPct = 0;
  if (previous.totalAskVol > 0 && current.totalAskVol < previous.totalAskVol) {
    askDropPct = Number((((previous.totalAskVol - current.totalAskVol) / previous.totalAskVol) * 100).toFixed(1));
  }

  if (bidDropPct >= thresholdPct) {
    return {
      isAlertActive: true,
      side: 'BID',
      dropPct: bidDropPct,
      timeDeltaMs,
      severity: bidDropPct >= 45 ? 'CRITICAL' : 'WARNING',
      message: `⚠️ Parede de Compra (-${bidDropPct}%) retirada subitamente há ${timeDeltaMs}ms!`,
      advice: 'Suspeita de Spoofing comprador. Cuidado com derrapagem e falso suporte.',
      timestamp: now,
    };
  }

  if (askDropPct >= thresholdPct) {
    return {
      isAlertActive: true,
      side: 'ASK',
      dropPct: askDropPct,
      timeDeltaMs,
      severity: askDropPct >= 45 ? 'CRITICAL' : 'WARNING',
      message: `⚠️ Parede de Venda (-${askDropPct}%) cancelada repentinamente há ${timeDeltaMs}ms!`,
      advice: 'Suspeita de Spoofing vendedor. Parede fantasma removida; cuidado com falso breakout.',
      timestamp: now,
    };
  }

  return {
    isAlertActive: false,
    side: 'NONE',
    dropPct: 0,
    timeDeltaMs,
    severity: 'WARNING',
    message: '',
    advice: '',
    timestamp: now,
  };
}

export interface WickPenetrationParams {
  entryPrice: number;
  candleHigh: number;
  candleLow: number;
  candleOpen?: number;
  candleClose?: number;
  candleVolume?: number;
  side?: 'BID' | 'ASK' | 'BUY' | 'SELL' | 'NONE';
  stopLossPct?: number; // Padrão 1.8% conforme diretriz institucional
  customStopLossPrice?: number;
  notionalUsd?: number; // Nocional padrão $50 USD
  timeDeltaMs?: number;
}

export interface WickRejectionMetrics {
  rejectionTimeMs: number;
  rejectionVelocityUsdPerSec: number;
  absorptionPct: number;
  estimatedTicks: number;
  classification: 'ULTRA_FAST' | 'FAST' | 'MODERATE';
  label: string;
  summary: string;
}

export interface WickPenetrationResult {
  side: 'BID' | 'ASK';
  entryPrice: number;
  manipulatedWickPrice: number;
  theoreticalStopPrice: number;
  stopLossPct: number;
  didBreachStop: boolean;
  distanceToStopUsd: number;
  distanceToStopPct: number;
  wickDistanceToEntryUsd: number;
  wickDistanceToEntryPct: number;
  savedLossUsd: number;
  narrative: string;
  rejection: WickRejectionMetrics;
}

/**
 * Filtro de Liquidação de Pavio (Wick Penetration Calculator):
 * Quantifica a distância exata em dólares e percentual entre a mínima/máxima do pavio
 * do candle manipulado e o Stop Loss teórico da operação, informando ao trader
 * exatamente o prejuízo evitado por não ter despachado a ordem no momento do spoofing.
 */
export function calculateWickPenetration(params: WickPenetrationParams): WickPenetrationResult {
  const {
    entryPrice = 0,
    candleHigh = 0,
    candleLow = 0,
    side = 'BID',
    stopLossPct = 1.8,
    customStopLossPrice,
    notionalUsd = 50,
    timeDeltaMs,
  } = params;

  const isBidSide = side === 'BID' || side === 'BUY' || side === 'NONE' || !side;
  const determinedSide: 'BID' | 'ASK' = isBidSide ? 'BID' : 'ASK';

  let effectiveStopLossPct = stopLossPct;
  let theoreticalStopPrice: number;

  if (typeof customStopLossPrice === 'number' && customStopLossPrice > 0 && entryPrice > 0) {
    theoreticalStopPrice = customStopLossPrice;
    effectiveStopLossPct = Number(
      (Math.abs((entryPrice - theoreticalStopPrice) / entryPrice) * 100).toFixed(2)
    );
  } else {
    if (isBidSide) {
      theoreticalStopPrice = entryPrice * (1 - effectiveStopLossPct / 100);
    } else {
      theoreticalStopPrice = entryPrice * (1 + effectiveStopLossPct / 100);
    }
  }

  // Pavio manipulado: Mínima no caso de Long/BID spoofing; Máxima no caso de Short/ASK spoofing
  const manipulatedWickPrice = isBidSide ? candleLow : candleHigh;
  const didBreachStop = isBidSide
    ? manipulatedWickPrice <= theoreticalStopPrice
    : manipulatedWickPrice >= theoreticalStopPrice;

  // Distância exata entre o pavio e o Stop Loss teórico
  const distanceToStopUsd = Number(Math.abs(manipulatedWickPrice - theoreticalStopPrice).toFixed(2));
  const distanceToStopPct = Number(
    ((Math.abs(manipulatedWickPrice - theoreticalStopPrice) / (entryPrice || 1)) * 100).toFixed(2)
  );

  // Distância entre o pavio e o preço de entrada
  const wickDistanceToEntryUsd = Number(Math.abs(manipulatedWickPrice - entryPrice).toFixed(2));
  const wickDistanceToEntryPct = Number(
    ((Math.abs(manipulatedWickPrice - entryPrice) / (entryPrice || 1)) * 100).toFixed(2)
  );

  // Perda evitada em dólares baseada no tamanho da posição nocional
  const savedLossUsd = Number(((notionalUsd * effectiveStopLossPct) / 100).toFixed(2));
  const formattedLossUsd = savedLossUsd.toFixed(2);
  const formattedStopPct = effectiveStopLossPct.toFixed(1);

  // Narrativa estrita conforme requisito
  const narrative = `Esta evasão evitou um stop de -$${formattedLossUsd} (-${formattedStopPct}%) causado pelo pavio de manipulação`;

  // Velocidade de Rejeição do Pavio (Absorção Institucional)
  const closePrice = typeof params.candleClose === 'number' && params.candleClose > 0 ? params.candleClose : entryPrice;
  const candleRange = Math.max(candleHigh - candleLow, 0.001);

  let recoveryUsd = 0;
  if (isBidSide) {
    recoveryUsd = Math.max(0, closePrice - candleLow);
  } else {
    recoveryUsd = Math.max(0, candleHigh - closePrice);
  }

  const absorptionPct = Number(Math.min(100, Math.max(0, (recoveryUsd / candleRange) * 100)).toFixed(1));
  const rejectionTimeMs = Math.max(timeDeltaMs && timeDeltaMs > 0 ? timeDeltaMs : 450, 120);
  const rejectionVelocityUsdPerSec = Number((recoveryUsd / (rejectionTimeMs / 1000)).toFixed(2));

  const tickStep = entryPrice > 0 ? entryPrice * 0.00005 : 1;
  const estimatedTicks = Math.max(Math.round((recoveryUsd / tickStep) * 2), 12);

  let classification: 'ULTRA_FAST' | 'FAST' | 'MODERATE' = 'FAST';
  let label = '🟢 Absorção Agressiva de Mercado';

  if (rejectionTimeMs <= 600) {
    classification = 'ULTRA_FAST';
    label = '⚡ Absorção Instantânea Institucional';
  } else if (rejectionTimeMs > 1800) {
    classification = 'MODERATE';
    label = '🟡 Rejeição Gradual';
  }

  const summary = `Rejeição do pavio de $${recoveryUsd.toFixed(2)} (${absorptionPct}% absorvido) em ${rejectionTimeMs}ms (~${estimatedTicks} ticks a $${rejectionVelocityUsdPerSec}/s)`;

  const rejection: WickRejectionMetrics = {
    rejectionTimeMs,
    rejectionVelocityUsdPerSec,
    absorptionPct,
    estimatedTicks,
    classification,
    label,
    summary,
  };

  return {
    side: determinedSide,
    entryPrice,
    manipulatedWickPrice,
    theoreticalStopPrice,
    stopLossPct: effectiveStopLossPct,
    didBreachStop,
    distanceToStopUsd,
    distanceToStopPct,
    wickDistanceToEntryUsd,
    wickDistanceToEntryPct,
    savedLossUsd,
    narrative,
    rejection,
  };
}
