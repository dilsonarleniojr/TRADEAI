import { NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

export interface BinanceProfitableBotRecommendation {
  id: string;
  rank: number;
  symbol: string;
  baseAsset: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  spreadPct: number;
  rangePct: number;
  profitScore: number;
  estimatedWinRate: number;
  estimatedProfitCycle: number;
  strategy: string;
  strategyLabel: string;
  timeHorizon: "SCALPING" | "DAY_TRADE" | "SWING_TRADE";
  estimatedDuration: string;
  takeProfit: number;
  stopLoss: number;
  trailingStop: boolean;
  trailingStopDistance: number;
  autoBreakEven: boolean;
  breakEvenTrigger: number;
  breakEvenBuffer: number;
  category: "MOMENTUM" | "BLUE_CHIP" | "VOLATILITY" | "PULLBACK" | "HIGH_VOLUME";
  categoryLabel: string;
  technicalReasoning: string;
  riskRewardRatio: string;
  suggestedAllocation: number;
}

// Moedas estáveis ou atreladas a fiat que não têm volatilidade direcional
const STABLE_AND_PEGGED = new Set([
  'USDC', 'FDUSD', 'TUSD', 'USDD', 'DAI', 'BUSD', 'EUR', 'AEUR', 'USDP',
  'WBTC', 'WBETH', 'TBTC', 'PAXG', 'UST', 'USDE', 'USDJ', 'CUSD', 'EURI', 'USDS'
]);

// Tokens deslistados, suspensos ou com problemas de liquidez
const KNOWN_DELISTED_OR_HALTED = new Set([
  'ACA', 'VIC', 'MATIC', 'MKR', 'AKT', 'STG', 'IDEX', 'WTC', 'WABI', 'TORN', 'VGX',
  'NULS', 'DREP', 'MOB', 'PNT', 'BTG', 'HIFI', 'EPX', 'FOR', 'LOOM', 'REEF', 'BOND',
  'DOCK', 'POLS', 'MDX', 'VOXEL', 'WRX', 'UNFI', 'BLZ', 'KEY', 'AMB', 'KP3R', 'AKRO',
  'MULTIA', 'OMG', 'WAVES', 'WNXM', 'XEM', 'DGB'
]);

const BLUE_CHIPS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'NEAR', 'SUI'
]);

interface CachedScannerResult {
  timestamp: number;
  totalBinancePairs: number;
  qualifiedCount: number;
  recommendations: BinanceProfitableBotRecommendation[];
}

let cachedResult: CachedScannerResult | null = null;
const CACHE_TTL_MS = 15000; // 15 segundos de cache para ultra-performance e proteção de rate limits

async function fetchBinance24hTickers(): Promise<any[]> {
  // 1. Tenta microserviço local com timeout
  const localRes = await fetchFromBinanceService('/api/market/ticker/24hr', 2500);
  if (localRes && localRes.ok) {
    try {
      const data = await localRes.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.data)) return data.data;
    } catch {
      // fallback abaixo
    }
  }

  // 2. Consulta direta à API oficial da Binance Spot
  const res = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
    headers: { 'User-Agent': 'TradeAI/2.5.0' },
    next: { revalidate: 15 },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Binance HTTP error: ${res.status}`);
  }

  return await res.json();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const categoryParam = url.searchParams.get('category') || 'ALL';
    const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '50', 10)));
    const search = (url.searchParams.get('search') || '').trim().toUpperCase();

    const now = Date.now();
    if (!cachedResult || now - cachedResult.timestamp > CACHE_TTL_MS) {
      const rawTickers = await fetchBinance24hTickers();

      // 1. Filtra apenas pares em USDT válidos
      const usdtPairs = rawTickers.filter((t) => {
        if (!t.symbol || !t.symbol.endsWith('USDT')) return false;
        if (t.symbol.includes('UP') || t.symbol.includes('DOWN') || t.symbol.includes('BEAR') || t.symbol.includes('BULL')) return false;
        const base = t.symbol.replace('USDT', '');
        if (STABLE_AND_PEGGED.has(base) || KNOWN_DELISTED_OR_HALTED.has(base)) return false;

        const price = parseFloat(t.lastPrice || '0');
        const vol = parseFloat(t.quoteVolume || '0');
        const bid = parseFloat(t.bidPrice || '0');
        const ask = parseFloat(t.askPrice || '0');

        // Mínimo de $500k de volume 24h para garantir execução sem derrapagem (slippage)
        return price > 0 && vol >= 500000 && bid > 0 && ask > 0;
      });

      // 2. Pontuação Quantitativa de Lucratividade para cada par da Binance
      const scored: BinanceProfitableBotRecommendation[] = usdtPairs.map((t) => {
        const symbol = t.symbol;
        const base = symbol.replace('USDT', '');
        const price = parseFloat(t.lastPrice || '0');
        const change24h = parseFloat(t.priceChangePercent || '0');
        const volume24h = parseFloat(t.quoteVolume || '0');
        const high24h = parseFloat(t.highPrice || '0') || price * 1.02;
        const low24h = parseFloat(t.lowPrice || '0') || price * 0.98;
        const bid = parseFloat(t.bidPrice || '0');
        const ask = parseFloat(t.askPrice || '0');

        const spreadPct = price > 0 ? ((ask - bid) / price) * 100 : 0.05;
        const rangePct = price > 0 ? ((high24h - low24h) / price) * 100 : 3.0;

        // Pilar A: Momentum & Tendência (0-35)
        let momentumScore = 15;
        if (change24h >= 2.0 && change24h <= 18.0) {
          momentumScore = 35; // Sweet-spot de alta sustentada
        } else if (change24h > 18.0 && change24h <= 35.0) {
          momentumScore = 30; // Breakout forte
        } else if (change24h > 0.5 && change24h < 2.0) {
          momentumScore = 22; // Tendência inicial
        } else if (change24h >= -6.0 && change24h <= -1.0 && volume24h > 5000000) {
          momentumScore = 26; // Pullback saudável com alto volume (Dip Hunter)
        } else if (change24h > 35.0) {
          momentumScore = 14; // Sobrecomprado com risco de correção
        } else if (change24h < -8.0) {
          momentumScore = 8; // Risco de faca caindo
        }

        // Pilar B: Volume & Profundidade do Livro (0-30)
        let volumeScore = 10;
        if (volume24h >= 50000000) volumeScore = 30;
        else if (volume24h >= 15000000) volumeScore = 25;
        else if (volume24h >= 5000000) volumeScore = 20;
        else if (volume24h >= 1500000) volumeScore = 15;

        // Pilar C: Volatilidade Útil / Amplitude ATR (0-20)
        let rangeScore = 8;
        if (rangePct >= 5.5) rangeScore = 20;
        else if (rangePct >= 4.0) rangeScore = 17;
        else if (rangePct >= 2.5) rangeScore = 14;
        else rangeScore = 5;

        // Pilar D: Liquidez e Spread Baixo (0-15)
        let spreadScore = 6;
        if (spreadPct <= 0.05) spreadScore = 15;
        else if (spreadPct <= 0.12) spreadScore = 12;
        else if (spreadPct <= 0.20) spreadScore = 8;

        const totalScore = Math.min(99, Math.max(30, momentumScore + volumeScore + rangeScore + spreadScore));

        // Taxa de Acerto e Projeção de Ganho por ciclo
        const estimatedWinRate = Math.min(88, Math.max(62, Math.round(62 + (totalScore - 40) * 0.44)));
        const estimatedProfitCycle = parseFloat(Math.max(2.6, Math.min(6.5, rangePct * 0.62)).toFixed(1));

        // Estratégia Recomendada
        let strategy = 'QUANT_ENSEMBLE';
        let strategyLabel = 'Quant Ensemble (Tendência + Fluxo)';
        let timeHorizon: "SCALPING" | "DAY_TRADE" | "SWING_TRADE" = "DAY_TRADE";
        let estimatedDuration = "Day Trade (1h a 4h)";
        let category: BinanceProfitableBotRecommendation["category"] = "MOMENTUM";
        let categoryLabel = "Momentum Breakout";

        if (BLUE_CHIPS.has(base)) {
          category = "BLUE_CHIP";
          categoryLabel = "Blue Chip / Alta Liquidez";
          strategy = "QUANT_ENSEMBLE";
          strategyLabel = "Trend Following Institucional";
          timeHorizon = "DAY_TRADE";
          estimatedDuration = "Day Trade / Swing Curto";
        } else if (change24h >= 5.0) {
          category = "MOMENTUM";
          categoryLabel = "Super Momentum & Volume";
          strategy = "BREAKOUT";
          strategyLabel = "Breakout de Alta com Volume";
          timeHorizon = "SCALPING";
          estimatedDuration = "Scalping Rápido (15m a 45m)";
        } else if (rangePct >= 6.5) {
          category = "VOLATILITY";
          categoryLabel = "Alta Volatilidade & Range";
          strategy = "MEAN_REVERSION";
          strategyLabel = "Scalper de Volatilidade ATR";
          timeHorizon = "SCALPING";
          estimatedDuration = "Scalping Dinâmico (15m)";
        } else if (change24h < 0) {
          category = "PULLBACK";
          categoryLabel = "Pullback Saudável (RSI)";
          strategy = "RSI";
          strategyLabel = "Pullback & Reversão RSI";
          timeHorizon = "SWING_TRADE";
          estimatedDuration = "Swing Trade (4h a 12h)";
        } else if (volume24h >= 30000000) {
          category = "HIGH_VOLUME";
          categoryLabel = "Volume Institucional Maciço";
          strategy = "QUANT_ENSEMBLE";
          strategyLabel = "Fluxo Comprador Institucional";
        }

        // Parâmetros Pré-Calculados (Respeitando Guardrails Institucionais: SL <= 2.0%)
        const takeProfit = parseFloat(Math.max(3.2, Math.min(5.5, rangePct * 0.58)).toFixed(1));
        const stopLoss = 1.8; // Estrito: 1.8% (dentro do teto mandatório de 2.0%)
        const trailingStopDistance = 0.6;
        const breakEvenTrigger = 1.6;
        const breakEvenBuffer = 0.45;

        const technicalReasoning = `Alta liquidez (${(volume24h / 1e6).toFixed(1)}M USDT), amplitude 24h de ${rangePct.toFixed(1)}% e variação de ${change24h >= 0 ? '+' : ''}${change24h.toFixed(1)}%. Alinhamento ideal para ${strategyLabel}.`;
        const riskRewardRatio = `${(takeProfit / stopLoss).toFixed(1)}:1`;

        return {
          id: `rec-binance-${symbol.toLowerCase()}`,
          rank: 0,
          symbol,
          baseAsset: base,
          name: `Bot ${base} — ${categoryLabel.split(' ')[0]}`,
          price,
          change24h,
          volume24h,
          high24h,
          low24h,
          spreadPct,
          rangePct,
          profitScore: totalScore,
          estimatedWinRate,
          estimatedProfitCycle,
          strategy,
          strategyLabel,
          timeHorizon,
          estimatedDuration,
          takeProfit,
          stopLoss,
          trailingStop: true,
          trailingStopDistance,
          autoBreakEven: true,
          breakEvenTrigger,
          breakEvenBuffer,
          category,
          categoryLabel,
          technicalReasoning,
          riskRewardRatio,
          suggestedAllocation: 25,
        };
      });

      // Ordenação rigorosa por Score de Lucratividade decrescente
      scored.sort((a, b) => b.profitScore - a.profitScore);
      scored.forEach((bot, index) => {
        bot.rank = index + 1;
      });

      cachedResult = {
        timestamp: now,
        totalBinancePairs: rawTickers.length,
        qualifiedCount: scored.length,
        recommendations: scored,
      };
    }

    let list = cachedResult.recommendations;

    // Filtros de busca e categoria
    if (search) {
      list = list.filter((r) => r.symbol.includes(search) || r.baseAsset.includes(search) || r.name.toUpperCase().includes(search));
    }

    if (categoryParam !== 'ALL') {
      list = list.filter((r) => r.category === categoryParam);
    }

    const paginated = list.slice(0, limit);

    return NextResponse.json({
      success: true,
      timestamp: cachedResult.timestamp,
      totalBinancePairs: cachedResult.totalBinancePairs,
      qualifiedCount: cachedResult.qualifiedCount,
      count: paginated.length,
      recommendations: paginated,
      categories: {
        ALL: cachedResult.recommendations.length,
        MOMENTUM: cachedResult.recommendations.filter((r) => r.category === 'MOMENTUM').length,
        BLUE_CHIP: cachedResult.recommendations.filter((r) => r.category === 'BLUE_CHIP').length,
        VOLATILITY: cachedResult.recommendations.filter((r) => r.category === 'VOLATILITY').length,
        PULLBACK: cachedResult.recommendations.filter((r) => r.category === 'PULLBACK').length,
        HIGH_VOLUME: cachedResult.recommendations.filter((r) => r.category === 'HIGH_VOLUME').length,
      },
    });
  } catch (error: any) {
    console.error('[binance-profitable-scanner] Falha ao processar scanner:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Falha ao escanear pares da Binance',
      },
      { status: 500 }
    );
  }
}
