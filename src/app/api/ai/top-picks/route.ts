import { NextResponse } from 'next/server';
import { askAIOnce, parseJsonLoose } from '@/lib/ai-client';
import { calculatePivotPoints, checkResistanceProximity } from '@/lib/bot/indicators';

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
  try {
    const body = await request.json().catch(() => ({}));
    marketData = body.marketData || {};
    const forceRefresh = Boolean(body.forceRefresh);

    // Check cache first (respeita forceRefresh para entregar novas seleções)
    if (!forceRefresh && cachedPicks && Date.now() - cachedPicks.timestamp < CACHE_DURATION) {
      return NextResponse.json({ success: true, picks: cachedPicks.data, cached: true });
    }

    if (!marketData || Object.keys(marketData).length === 0) {
      return NextResponse.json(
        { error: 'Dados de mercado não disponíveis' },
        { status: 400 }
      );
    }

    // Sem busca de notícias: a busca antiga dependia do SDK da Z.AI.
    const newsContext = '';

    // Amostragem diversificada: selecionar pares de alta liquidez, maiores altas, maiores quedas e altcoins variadas
    const allMarketEntries = Object.entries(marketData).filter(([_, d]: [string, any]) => d && d.price > 0);
    const sortedByChange = [...allMarketEntries].sort((a, b) => (b[1].priceChangePercent || 0) - (a[1].priceChangePercent || 0));
    const topGainersSlice = sortedByChange.slice(0, 10);
    const topLosersSlice = sortedByChange.slice(-6);
    const randomLiquidSlice = [...allMarketEntries].sort(() => Math.random() - 0.5).slice(0, 14);

    const diverseEntries = Array.from(new Map([...topGainersSlice, ...topLosersSlice, ...randomLiquidSlice]).entries()).map(([k, v]) => [k, v] as [string, any]);

    // Prepare market summary for AI analysis com níveis e contexto técnico
    const marketSummary = diverseEntries
      .map(([symbol, data]: [string, any]) => {
        const p = data.price || 0;
        const h = data.high || data.highPrice || p * 1.02;
        const l = data.low || data.lowPrice || p * 0.98;
        const piv = calculatePivotPoints(h, l, p);
        const nearRes = p > 0 && piv.r1 > 0 ? (((piv.r1 - p) / p) * 100).toFixed(1) : 'N/A';
        return `${symbol}: $${p.toFixed(2)}, 24h: ${data.priceChangePercent?.toFixed(2) || 'N/A'}%, Vol: $${((data.quoteVolume || 0) / 1e6).toFixed(1)}M, R1 Dist: ${nearRes}%`;
      })
      .join('\n');

    const newsSection = newsContext
      ? `\nNOTÍCIAS RECENTES DO MUNDO CRYPTO:\n${newsContext}\n`
      : '';

    const prompt = `Você é um analista quantitativo sênior de criptomoedas seguindo a metodologia technical-scanner. Analise os dados de mercado atuais e selecione as 5 melhores oportunidades de investimento para CURTO PRAZO (1-7 dias).

DADOS DE MERCADO ATUAIS:
${marketSummary}
${newsSection}
REGRAS TÉCNICAS ESTRITAS (SKILL TECHNICAL-SCANNER):
1. NUNCA recomende COMPRA se o ativo estiver a menos de 0.8% da resistência R1 ou se já subiu mais de 10% nas 24h (para evitar comprar topo institucional). Nesses casos, classifique como "AGUARDAR PULLBACK".
2. Priorize ativos em tendência de alta saudável com volume robusto e espaço livre até as próximas resistências.
3. Relação Risco/Retorno obrigatória: R:R >= 2.3:1 (Target pelo menos 2.3x a distância do Stop Loss).
4. Para cada seleção, forneça análise técnica estrutural em português (2-3 frases).
5. Atribua um score (0-100) baseado na força do setup.

Responda APENAS com um array JSON contendo objetos com:
- rank: posição (1-5)
- symbol: símbolo (ex: BTCUSDT)
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
      'Você é um analista de criptomoedas profissional. Responda apenas com JSON válido. Foque em oportunidades reais baseadas nos dados fornecidos.',
      prompt,
      { maxTokens: 6000 }
    );

    const picks = parseJsonLoose<TopPick[]>(response);
    if (Array.isArray(picks) && picks.length > 0) {
      // Cache the result
      cachedPicks = { data: picks, timestamp: Date.now() };

      return NextResponse.json({ success: true, picks, cached: false });
    } else {
      // If parsing fails, generate picks from market data algorithmically
      const fallbackPicks = generateFallbackPicks(marketData);
      cachedPicks = { data: fallbackPicks, timestamp: Date.now() };
      return NextResponse.json({ success: true, picks: fallbackPicks, cached: false, fallback: true });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Top Picks error:', error);

    // Return fallback picks using already parsed marketData
    const fallbackPicks = generateFallbackPicks(marketData);
    cachedPicks = { data: fallbackPicks, timestamp: Date.now() };
    return NextResponse.json({ success: true, picks: fallbackPicks, cached: false, fallback: true });
  }
}

function generateFallbackPicks(marketData: Record<string, any>): TopPick[] {
  if (!marketData || Object.keys(marketData).length === 0) return [];

  const names: Record<string, string> = {
    BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', BNBUSDT: 'BNB', SOLUSDT: 'Solana',
    XRPUSDT: 'Ripple', ADAUSDT: 'Cardano', DOGEUSDT: 'Dogecoin', AVAXUSDT: 'Avalanche',
    DOTUSDT: 'Polkadot', LINKUSDT: 'Chainlink', ATOMUSDT: 'Cosmos', NEARUSDT: 'NEAR Protocol',
    SUIUSDT: 'Sui', APTUSDT: 'Aptos', SEIUSDT: 'Sei', INJUSDT: 'Injective',
    ARBUSDT: 'Arbitrum', OPUSDT: 'Optimism', UNIUSDT: 'Uniswap', AAVEUSDT: 'Aave',
    FETUSDT: 'Fetch.ai', RENDERUSDT: 'Render', SHIBUSDT: 'Shiba Inu', PEPEUSDT: 'Pepe',
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
    .map(([symbol, data]: [string, any]) => {
      const p = Number(data.price || 0);
      const chg = Number(data.priceChangePercent || 0);
      const vol = Number(data.quoteVolume || 0);
      const volLog = Math.log10(Math.max(1000, vol));
      // Pontuação equilibrada: valoriza momentum e consistência sem deixar o volume de trilhões de BTC sufocar outras oportunidades
      const score = (chg > 0 ? chg * 2.2 : chg * 0.4) + volLog * 1.8 + (Math.random() * 2.0);
      return { symbol, price: p, priceChangePercent: chg, quoteVolume: vol, score };
    })
    .filter((e) => e.price > 0 && e.quoteVolume >= 2_000_000)
    .sort((a, b) => b.score - a.score);

  // Selecionar 5 ativos com diversificação estrita de categorias
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

  // Fallback caso a restrição de categoria seja muito estreita
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
    const high = rawData.high || rawData.highPrice || entry.price * 1.02;
    const low = rawData.low || rawData.lowPrice || entry.price * 0.98;
    const pivots = calculatePivotPoints(high, low, entry.price);
    const resCheck = checkResistanceProximity(entry.price, pivots, 0.8);

    // Assimetria Matemática Estrita: R:R >= 2.2:1
    // Stop Loss controlado entre 2.0% e 2.8% abaixo da entrada
    const slPct = isPositive ? Math.min(2.8, Math.max(1.8, Math.abs(entry.priceChangePercent) * 0.35)) : 2.2;
    // Take Profit estritamente calibrado para pelo menos 2.35x o risco
    const tpPct = Number((slPct * 2.35).toFixed(2));

    const targetMultiplier = 1 + (tpPct / 100);
    const stopMultiplier = 1 - (slPct / 100);

    const isNearResistance = !resCheck.safeToBuy;
    const isOverextended = entry.priceChangePercent > 12.0 || isNearResistance;

    return {
      rank: idx + 1,
      symbol: entry.symbol,
      name: names[entry.symbol] || entry.symbol.replace('USDT', ''),
      currentPrice: entry.price,
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
      targetPrice: parseFloat((entry.price * targetMultiplier).toFixed(4)),
      stopLoss: parseFloat((entry.price * stopMultiplier).toFixed(4)),
      riskLevel: isOverextended ? 'Alto' : Math.abs(entry.priceChangePercent) > 5 ? 'Médio' : 'Baixo',
      category: categories[entry.symbol] || 'Outro',
      score: isNearResistance ? 55 : isOverextended ? 65 : Math.min(99, Math.max(60, 75 + (isPositive ? entry.priceChangePercent : 0) * 1.5)),
    };
  });
}
