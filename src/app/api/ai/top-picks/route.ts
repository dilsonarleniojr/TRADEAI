import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: InstanceType<typeof ZAI> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

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
    // Check cache first
    if (cachedPicks && Date.now() - cachedPicks.timestamp < CACHE_DURATION) {
      return NextResponse.json({ success: true, picks: cachedPicks.data, cached: true });
    }

    const body = await request.json();
    marketData = body.marketData || {};

    if (!marketData || Object.keys(marketData).length === 0) {
      return NextResponse.json(
        { error: 'Dados de mercado não disponíveis' },
        { status: 400 }
      );
    }

    const zai = await getZAI();

    // Fetch latest crypto news to inform the AI analysis
    let newsContext = '';
    try {
      const newsResults = await zai.functions.invoke('web_search', {
        query: 'cryptocurrency bitcoin ethereum market news today 2025',
        num: 5,
        recency_days: 2,
      });
      if (Array.isArray(newsResults) && newsResults.length > 0) {
        newsContext = newsResults
          .slice(0, 5)
          .map((r: any) => `- ${r.name || r.title || 'Notícia'}: ${r.snippet || ''}`)
          .join('\n');
      }
    } catch {
      // News search failed, continue without it
    }

    // Prepare market summary for AI analysis
    const marketSummary = Object.entries(marketData)
      .slice(0, 30)
      .map(([symbol, data]: [string, any]) => (
        `${symbol}: $${data.price?.toFixed(2) || 'N/A'}, 24h: ${data.priceChangePercent?.toFixed(2) || 'N/A'}%, Vol: $${((data.quoteVolume || 0) / 1e6).toFixed(1)}M`
      ))
      .join('\n');

    const newsSection = newsContext
      ? `\nNOTÍCIAS RECENTES DO MUNDO CRYPTO:\n${newsContext}\n`
      : '';

    const prompt = `Você é um analista de criptomoedas experiente. Analise os dados de mercado atuais e as notícias recentes para selecionar as 5 melhores oportunidades de investimento para CURTO PRAZO (1-7 dias).

DADOS DE MERCADO ATUAIS:
${marketSummary}
${newsSection}
INSTRUÇÕES:
1. Selecione as 5 criptomoedas com melhor potencial de alta baseado em: momento, volume, tendência de preço e notícias recentes
2. Considere fatores como: momentum positivo, volume crescente, rompimento de resistências, notícias positivas, tendências macro
3. Para cada seleção, forneça análise detalhada incluindo impacto das notícias
4. Atribua um score (0-100) baseado na força do setup
5. Priorize ativos com tendências de alta confirmadas por dados e notícias

Responda APENAS com um array JSON contendo objetos com:
- rank: posição (1-5)
- symbol: símbolo (ex: BTCUSDT)
- name: nome da criptomoeda
- currentPrice: preço atual
- priceChange24h: variação 24h em porcentagem
- recommendation: "COMPRA FORTE", "COMPRA", ou "ACUMULAR"
- reason: motivo detalhado em português (2-3 frases, mencione notícias quando relevante)
- targetPrice: preço alvo sugerido
- stopLoss: preço de stop loss sugerido
- riskLevel: "Baixo", "Médio" ou "Alto"
- category: categoria (Layer 1, DeFi, IA, etc.)
- score: score de 0-100

IMPORTANTE: Responda APENAS com o array JSON, sem texto adicional.`;

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'Você é um analista de criptomoedas profissional. Responda apenas com JSON válido. Foque em oportunidades reais baseadas nos dados e notícias fornecidas.'
        },
        { role: 'user', content: prompt }
      ],
      thinking: { type: 'disabled' }
    });

    const response = completion.choices[0]?.message?.content || '';

    try {
      const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const picks: TopPick[] = JSON.parse(cleanedResponse);

      // Cache the result
      cachedPicks = { data: picks, timestamp: Date.now() };

      return NextResponse.json({ success: true, picks, cached: false });
    } catch {
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

  const entries = Object.entries(marketData)
    .map(([symbol, data]: [string, any]) => ({
      symbol,
      price: data.price || 0,
      priceChangePercent: data.priceChangePercent || 0,
      quoteVolume: data.quoteVolume || 0,
    }))
    .filter(e => e.price > 0)
    .sort((a, b) => {
      // Score: combination of positive momentum + volume
      const scoreA = (a.priceChangePercent > 0 ? a.priceChangePercent : 0) * 2 + (a.quoteVolume / 1e9);
      const scoreB = (b.priceChangePercent > 0 ? b.priceChangePercent : 0) * 2 + (b.quoteVolume / 1e9);
      return scoreB - scoreA;
    })
    .slice(0, 5);

  const names: Record<string, string> = {
    BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', BNBUSDT: 'BNB', SOLUSDT: 'Solana',
    XRPUSDT: 'Ripple', ADAUSDT: 'Cardano', DOGEUSDT: 'Dogecoin', AVAXUSDT: 'Avalanche',
    DOTUSDT: 'Polkadot', LINKUSDT: 'Chainlink', ATOMUSDT: 'Cosmos', NEARUSDT: 'NEAR Protocol',
    SUIUSDT: 'Sui', APTUSDT: 'Aptos', SEIUSDT: 'Sei', INJUSDT: 'Injective',
    ARBUSDT: 'Arbitrum', OPUSDT: 'Optimism', UNIUSDT: 'Uniswap', AAVEUSDT: 'Aave',
    FETUSDT: 'Fetch.ai', RENDERUSDT: 'Render', SHIBUSDT: 'Shiba Inu', PEPEUSDT: 'Pepe',
    FILUSDT: 'Filecoin', LTCUSDT: 'Litecoin', TRXUSDT: 'TRON', XLMUSDT: 'Stellar',
  };

  const categories: Record<string, string> = {
    BTCUSDT: 'Layer 1', ETHUSDT: 'Layer 1', BNBUSDT: 'Exchange', SOLUSDT: 'Layer 1',
    XRPUSDT: 'Exchange', ADAUSDT: 'Layer 1', DOGEUSDT: 'Meme', AVAXUSDT: 'Layer 1',
    DOTUSDT: 'Layer 1', LINKUSDT: 'Infraestrutura', ATOMUSDT: 'Layer 1', NEARUSDT: 'Layer 1',
    SUIUSDT: 'Layer 1', APTUSDT: 'Layer 1', SEIUSDT: 'Layer 1', INJUSDT: 'Layer 1',
    ARBUSDT: 'Layer 2', OPUSDT: 'Layer 2', UNIUSDT: 'DeFi', AAVEUSDT: 'DeFi',
    FETUSDT: 'IA', RENDERUSDT: 'IA', SHIBUSDT: 'Meme', PEPEUSDT: 'Meme',
    FILUSDT: 'Infraestrutura', LTCUSDT: 'Layer 1', TRXUSDT: 'Exchange', XLMUSDT: 'Exchange',
  };

  return entries.map((entry, idx) => {
    const isPositive = entry.priceChangePercent > 0;
    const targetMultiplier = isPositive ? 1 + (Math.abs(entry.priceChangePercent) / 100) * 0.5 : 1.02;
    const stopMultiplier = isPositive ? 1 - (Math.abs(entry.priceChangePercent) / 100) * 0.8 : 0.97;

    return {
      rank: idx + 1,
      symbol: entry.symbol,
      name: names[entry.symbol] || entry.symbol.replace('USDT', ''),
      currentPrice: entry.price,
      priceChange24h: entry.priceChangePercent,
      recommendation: entry.priceChangePercent > 3 ? 'COMPRA FORTE' : entry.priceChangePercent > 0 ? 'COMPRA' : 'ACUMULAR',
      reason: `Momentum ${isPositive ? 'positivo' : 'em recuperação'} com ${isPositive ? 'alta' : 'movimento'} de ${Math.abs(entry.priceChangePercent).toFixed(1)}% nas últimas 24h. Volume de mercado significativo sustenta a tendência.`,
      targetPrice: parseFloat((entry.price * targetMultiplier).toFixed(4)),
      stopLoss: parseFloat((entry.price * stopMultiplier).toFixed(4)),
      riskLevel: Math.abs(entry.priceChangePercent) > 5 ? 'Alto' : Math.abs(entry.priceChangePercent) > 2 ? 'Médio' : 'Baixo',
      category: categories[entry.symbol] || 'Outro',
      score: Math.min(99, Math.max(60, 70 + (isPositive ? entry.priceChangePercent : 0) * 2)),
    };
  });
}
