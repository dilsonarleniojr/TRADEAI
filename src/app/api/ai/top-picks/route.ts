import { NextResponse } from 'next/server';
import { askAIOnce, parseJsonLoose } from '@/lib/ai-client';
import { calculatePivotPoints, checkResistanceProximity } from '@/lib/bot/indicators';
import {
  getVerifiedBinanceSpotRegistry,
  isTradableBinanceSpotSymbol,
  quantizeToBinanceTick,
  type VerifiedSpotSymbolMeta,
} from '@/lib/binance-spot-sync';

// Cache for 5 minutes to avoid excessive API calls
let cachedPicks: { data: TopPick[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

interface TopPick {
  rank: number;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  recommendation: string;
  reason: string;
  targetPrice: number;
  stopLoss: number;
  riskLevel: 'Baixo' | 'Médio' | 'Alto';
  category: string;
  score: number;
}

export async function POST(request: Request) {
  let marketData: Record<string, any> = {};
  let spotRegistry: Map<string, VerifiedSpotSymbolMeta> | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    marketData = body.marketData || {};
    const forceRefresh = Boolean(body.forceRefresh);

    spotRegistry = await getVerifiedBinanceSpotRegistry().catch(() => null);

    // Check cache first (respeita forceRefresh e valida se todos os picks em cache continuam elegíveis)
    if (!forceRefresh && cachedPicks && Date.now() - cachedPicks.timestamp < CACHE_DURATION) {
      const validCached = cachedPicks.data.filter((p) =>
        isTradableBinanceSpotSymbol(p.symbol, marketData[p.symbol], spotRegistry)
      );
      if (validCached.length >= 3) {
        return NextResponse.json({ success: true, picks: validCached, cached: true });
      }
    }

    if (!marketData || Object.keys(marketData).length === 0) {
      return NextResponse.json(
        { error: 'Dados de mercado não disponíveis' },
        { status: 400 }
      );
    }

    // Amostragem diversificada: selecionar apenas pares Spot 100% válidos e operáveis na Binance
    const allMarketEntries = Object.entries(marketData).filter(([sym, d]: [string, any]) => {
      if (!d || Number(d.price) <= 0) return false;
      if (!isTradableBinanceSpotSymbol(sym, d, spotRegistry)) return false;
      const vol = Number(d.quoteVolume) || 0;
      return vol > 250000;
    });

    const sortedByChange = [...allMarketEntries].sort((a, b) => (b[1].priceChangePercent || 0) - (a[1].priceChangePercent || 0));
    const topGainersSlice = sortedByChange.slice(0, 10);
    const topLosersSlice = sortedByChange.slice(-6);
    const randomLiquidSlice = [...allMarketEntries].sort(() => Math.random() - 0.5).slice(0, 14);

    const diverseEntries = Array.from(new Map([...topGainersSlice, ...topLosersSlice, ...randomLiquidSlice]).entries()).map(([k, v]) => [k, v] as [string, any]);
    const allowedSymbolsSet = new Set(diverseEntries.map(([sym]) => sym.toUpperCase()));

    // Prepare market summary for AI analysis com níveis e contexto técnico
    const marketSummary = diverseEntries
      .map(([symbol, data]: [string, any]) => {
        const p = Number(data.price) || 0;
        const h = Number(data.high || data.highPrice) || p * 1.02;
        const l = Number(data.low || data.lowPrice) || p * 0.98;
        const piv = calculatePivotPoints(h, l, p);
        const nearRes = p > 0 && piv.r1 > 0 ? (((piv.r1 - p) / p) * 100).toFixed(1) : 'N/A';
        return `${symbol}: $${p}, 24h: ${data.priceChangePercent?.toFixed(2) || 'N/A'}%, Vol: $${((data.quoteVolume || 0) / 1e6).toFixed(1)}M, R1 Dist: ${nearRes}%`;
      })
      .join('\n');

    const prompt = `Você é um analista quantitativo sênior de criptomoedas seguindo a metodologia technical-scanner. Analise os dados de mercado atuais da Binance Spot e selecione as 5 melhores oportunidades de investimento para CURTO PRAZO (1-7 dias).

DADOS DE MERCADO ATUAIS (APENAS PARES BINANCE SPOT VERIFICADOS):
${marketSummary}

REGRAS TÉCNICAS ESTRITAS (SKILL TECHNICAL-SCANNER):
1. Escolha EXCLUSIVAMENTE símbolos listados em DADOS DE MERCADO ATUAIS acima. NUNCA invente tickers, ações tokenizadas (*BUSDT) ou stablecoins.
2. NUNCA recomende COMPRA se o ativo estiver a menos de 0.8% da resistência R1 ou se já subiu mais de 10% nas 24h (para evitar comprar topo institucional). Nesses casos, classifique como "AGUARDAR PULLBACK".
3. Priorize ativos em tendência de alta saudável com volume robusto e espaço livre até as próximas resistências.
4. Relação Risco/Retorno obrigatória: R:R >= 2.3:1 (Target pelo menos 2.3x a distância do Stop Loss, com Stop Loss <= 2.0% abaixo do preço atual).
5. Para cada seleção, forneça análise técnica estrutural em português (2-3 frases).
6. Atribua um score (0-100) baseado na força do setup.

Responda APENAS com um array JSON contendo objetos com:
- rank: posição (1-5)
- symbol: símbolo exato da lista (ex: BTCUSDT)
- name: nome da criptomoeda
- currentPrice: preço atual
- priceChange24h: variação 24h em porcentagem
- recommendation: "COMPRA FORTE", "COMPRA", ou "AGUARDAR PULLBACK"
- reason: motivo detalhado em português (2-3 frases com níveis de suporte/resistência)
- targetPrice: preço alvo sugerido (com R:R >= 2.3:1)
- stopLoss: preço de stop loss sugerido
- riskLevel: "Baixo", "Médio" ou "Alto"
- category: categoria (Layer 1, DeFi, IA, etc.)
- score: score de 0-100

IMPORTANTE: Responda APENAS com o array JSON, sem texto adicional.`;

    const response = await askAIOnce(
      'Você é um analista de criptomoedas profissional da Binance Spot. Responda apenas com JSON válido. Foque exclusivamente nos símbolos verificados fornecidos.',
      prompt,
      { maxTokens: 6000 }
    );

    const rawPicks = parseJsonLoose<TopPick[]>(response);
    if (Array.isArray(rawPicks) && rawPicks.length > 0) {
      const sanitizedPicks = rawPicks
        .filter((p) => {
          const sym = String(p?.symbol || '').trim().toUpperCase();
          return (
            isTradableBinanceSpotSymbol(sym, marketData[sym], spotRegistry) &&
            (allowedSymbolsSet.has(sym) || Boolean(marketData[sym]))
          );
        })
        .map((p, index) => {
          const sym = String(p.symbol).trim().toUpperCase();
          const liveTicker = marketData[sym];
          const livePrice = Number(liveTicker?.price ?? p.currentPrice ?? 0);
          const tickSize = spotRegistry?.get(sym)?.tickSize;
          const rawTarget = Number(p.targetPrice) > livePrice ? Number(p.targetPrice) : livePrice * 1.045;
          const rawStop =
            Number(p.stopLoss) > 0 && Number(p.stopLoss) < livePrice
              ? Math.max(livePrice * 0.98, Number(p.stopLoss))
              : livePrice * 0.982;

          return {
            ...p,
            rank: index + 1,
            symbol: sym,
            currentPrice: quantizeToBinanceTick(livePrice, tickSize),
            priceChange24h: Number(liveTicker?.priceChangePercent ?? p.priceChange24h ?? 0),
            targetPrice: quantizeToBinanceTick(rawTarget, tickSize),
            stopLoss: quantizeToBinanceTick(rawStop, tickSize, 'floor'),
          };
        });

      if (sanitizedPicks.length >= 3) {
        cachedPicks = { data: sanitizedPicks, timestamp: Date.now() };
        return NextResponse.json({ success: true, picks: sanitizedPicks, cached: false });
      }
    }

    const fallbackPicks = generateFallbackPicks(marketData, spotRegistry);
    cachedPicks = { data: fallbackPicks, timestamp: Date.now() };
    return NextResponse.json({ success: true, picks: fallbackPicks, cached: false, fallback: true });
  } catch (error: unknown) {
    console.error('AI Top Picks error:', error);

    const fallbackPicks = generateFallbackPicks(marketData, spotRegistry);
    cachedPicks = { data: fallbackPicks, timestamp: Date.now() };
    return NextResponse.json({ success: true, picks: fallbackPicks, cached: false, fallback: true });
  }
}

function generateFallbackPicks(
  marketData: Record<string, any>,
  spotRegistry?: Map<string, VerifiedSpotSymbolMeta> | null
): TopPick[] {
  if (!marketData || Object.keys(marketData).length === 0) return [];

  const names: Record<string, string> = {
    BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', BNBUSDT: 'BNB', SOLUSDT: 'Solana',
    XRPUSDT: 'Ripple', ADAUSDT: 'Cardano', DOGEUSDT: 'Dogecoin', AVAXUSDT: 'Avalanche',
    DOTUSDT: 'Polkadot', LINKUSDT: 'Chainlink', ATOMUSDT: 'Cosmos', NEARUSDT: 'NEAR Protocol',
    SUIUSDT: 'Sui', APTUSDT: 'Aptos', SEIUSDT: 'Sei', INJUSDT: 'Injective',
    ARBUSDT: 'Arbitrum', OPUSDT: 'Optimism', UNIUSDT: 'Uniswap', AAVEUSDT: 'Aave',
    FETUSDT: 'Artificial Superintelligence', RENDERUSDT: 'Render', SHIBUSDT: 'Shiba Inu', PEPEUSDT: 'Pepe',
    FILUSDT: 'Filecoin', LTCUSDT: 'Litecoin', TRXUSDT: 'TRON', XLMUSDT: 'Stellar',
    TAOUSDT: 'Bittensor', WLDUSDT: 'Worldcoin', PENDLEUSDT: 'Pendle', TIAUSDT: 'Celestia',
  };

  const categories: Record<string, string> = {
    BTCUSDT: 'Layer 1', ETHUSDT: 'Layer 1', BNBUSDT: 'Exchange', SOLUSDT: 'Layer 1',
    XRPUSDT: 'Exchange', ADAUSDT: 'Layer 1', DOGEUSDT: 'Meme', AVAXUSDT: 'Layer 1',
    DOTUSDT: 'Layer 1', LINKUSDT: 'Infraestrutura', ATOMUSDT: 'Layer 1', NEARUSDT: 'Layer 1',
    SUIUSDT: 'Layer 1', APTUSDT: 'Layer 1', SEIUSDT: 'Layer 1', INJUSDT: 'Layer 1',
    ARBUSDT: 'Layer 2', OPUSDT: 'Layer 2', UNIUSDT: 'DeFi', AAVEUSDT: 'DeFi',
    FETUSDT: 'IA', RENDERUSDT: 'IA', SHIBUSDT: 'Meme', PEPEUSDT: 'Meme',
    FILUSDT: 'Infraestrutura', LTCUSDT: 'Layer 1', TRXUSDT: 'Exchange', XLMUSDT: 'Exchange',
    TAOUSDT: 'IA', WLDUSDT: 'IA', PENDLEUSDT: 'DeFi', TIAUSDT: 'Layer 1',
  };

  const sortedCandidates = Object.entries(marketData)
    .filter(([symbol, data]) => isTradableBinanceSpotSymbol(symbol, data, spotRegistry))
    .map(([symbol, data]: [string, any]) => {
      const p = Number(data.price || 0);
      const chg = Number(data.priceChangePercent || 0);
      const vol = Number(data.quoteVolume || 0);
      const volLog = Math.log10(Math.max(1000, vol));
      const score = (chg > 0 ? chg * 2.2 : chg * 0.4) + volLog * 1.8 + (Math.random() * 2.0);
      return { symbol: symbol.toUpperCase(), price: p, priceChangePercent: chg, quoteVolume: vol, score };
    })
    .filter((e) => e.price > 0 && e.quoteVolume >= 2_000_000)
    .sort((a, b) => b.score - a.score);

  const entries: typeof sortedCandidates = [];
  const categoryCounts: Record<string, number> = {};

  for (const cand of sortedCandidates) {
    if (entries.length >= 5) break;
    const cat = categories[cand.symbol] || 'Altcoin';
    if ((categoryCounts[cat] || 0) < 2) {
      entries.push(cand);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  if (entries.length < 5) {
    for (const cand of sortedCandidates) {
      if (entries.length >= 5) break;
      if (!entries.some((e) => e.symbol === cand.symbol)) {
        entries.push(cand);
      }
    }
  }

  return entries.map((entry, idx) => {
    const isPositive = entry.priceChangePercent > 0;
    const rawData = marketData[entry.symbol] || {};
    const high = Number(rawData.high || rawData.highPrice) || entry.price * 1.02;
    const low = Number(rawData.low || rawData.lowPrice) || entry.price * 0.98;
    const pivots = calculatePivotPoints(high, low, entry.price);
    const resCheck = checkResistanceProximity(entry.price, pivots, 0.8);
    const tickSize = spotRegistry?.get(entry.symbol)?.tickSize;

    // Assimetria Matemática Estrita: SL <= 2.0% e R:R >= 2.2:1
    const slPct = isPositive ? Math.min(2.0, Math.max(1.5, Math.abs(entry.priceChangePercent) * 0.32)) : 1.8;
    const tpPct = Number((slPct * 2.35).toFixed(2));

    const targetMultiplier = 1 + (tpPct / 100);
    const stopMultiplier = 1 - (slPct / 100);

    const isNearResistance = !resCheck.safeToBuy;
    const isOverextended = entry.priceChangePercent > 12.0 || isNearResistance;

    return {
      rank: idx + 1,
      symbol: entry.symbol,
      name: names[entry.symbol] || entry.symbol.replace('USDT', ''),
      currentPrice: quantizeToBinanceTick(entry.price, tickSize),
      priceChange24h: entry.priceChangePercent,
      recommendation: isOverextended
        ? 'AGUARDAR PULLBACK'
        : entry.priceChangePercent > 3
        ? 'COMPRA FORTE'
        : entry.priceChangePercent > 0
        ? 'COMPRA'
        : 'ACUMULAR',
      reason: isNearResistance
        ? `Preço colado na resistência diária ${resCheck.nearestLevel} ($${resCheck.levelPrice} a ${resCheck.distancePercent}%). Aguarde correção para suporte para entrada com R:R seguro.`
        : isOverextended
        ? `Ativo com forte estirada (+${entry.priceChangePercent.toFixed(1)}% nas 24h). Aguarde recuo técnico em direção às médias para entrada sem risco de topo.`
        : `Momentum altista confirmado e espaço livre até ${resCheck.nearestLevel} ($${resCheck.levelPrice} · +${resCheck.distancePercent}%). R:R assimétrico de 2.35:1 (Alvo +${tpPct.toFixed(1)}% / Stop -${slPct.toFixed(1)}%).`,
      targetPrice: quantizeToBinanceTick(entry.price * targetMultiplier, tickSize),
      stopLoss: quantizeToBinanceTick(entry.price * stopMultiplier, tickSize, 'floor'),
      riskLevel: isOverextended ? 'Alto' : Math.abs(entry.priceChangePercent) > 5 ? 'Médio' : 'Baixo',
      category: categories[entry.symbol] || 'Outro',
      score: isNearResistance ? 55 : isOverextended ? 65 : Math.min(99, Math.max(60, 75 + (isPositive ? entry.priceChangePercent : 0) * 1.5)),
    };
  });
}
