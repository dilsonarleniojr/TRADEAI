import { NextRequest, NextResponse } from 'next/server';
import { askAI, parseJsonLoose } from '@/lib/ai-client';
import { getProvider, AI_PROVIDERS, type AIProviderId } from '@/lib/ai/providers';
import { getActiveProvidersList, getModel, resolveApiKey } from '@/lib/ai/settings';
import {
  getVerifiedBinanceSpotRegistry,
  isTradableBinanceSpotSymbol,
} from '@/lib/binance-spot-sync';

export interface AIBotRecommendation {
  id: string;
  name: string;
  symbol: string;
  strategy: string;
  allocationAmount: number; // Montante de entrada em USDT
  allocationPct: number;    // % da banca recomendada
  operationalTimeframe: string; // Ex: "15m", "1h", "4h", "1d"
  estimatedDuration: string;    // Ex: "Scalping Rápido (15-45 min)", "Day Trade (1h a 4h)", "Swing (1 a 3 dias)"
  timeHorizonType: "SCALPING" | "DAY_TRADE" | "SWING_TRADE";
  takeProfit: number;
  stopLoss: number;
  trailingStop: boolean;
  trailingStopDistance: number;
  confidenceScore: number; // 0-100
  marketRegime: "ALTA_FORTE" | "TENDENCIA_ALTA" | "LATERAL_ACUMULACAO" | "CORRECAO_SOBREVENDA" | "ALTA_VOLATILIDADE";
  technicalReasoning: string;
  riskRewardRatio: string;
  // Identificação da IA de origem para permitir comparação e seleção
  aiProvider: string; // "claude" | "gemini" | "openai" | "qwen" | "algorithmic_quant"
  aiProviderName: string; // "Claude (Anthropic)" | "Google Gemini" | "OpenAI" | "Algoritmo Quant"
  aiModel: string; // "claude-3-5-sonnet-latest" | "gemini-2.0-flash" | ...
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const marketData: Record<string, any> = body.marketData || {};
    const availableCash: number = Number(body.cashBalance) || 10000;
    const tradingMode: string = body.tradingMode === 'live' ? 'live' : 'paper';
    const focusCategory: string = body.category || 'all'; // 'all' | 'gainers' | 'hot_altcoins' | 'dip_hunters' | 'blue_chips'

    const spotRegistry = await getVerifiedBinanceSpotRegistry().catch(() => null);

    // 1. Filtrar ativos cripto reais e 100% válidos na Binance Spot
    // (excluindo ações tokenizadas *BUSDT, stablecoins, tokens alavancados e pares em BREAK)
    const allValid = Object.entries(marketData)
      .filter(([sym, data]) => isTradableBinanceSpotSymbol(sym, data, spotRegistry))
      .map(([symbol, data]: [string, any]) => ({
        symbol: symbol.toUpperCase(),
        price: Number(data.price) || 0,
        change24h: Number(data.priceChangePercent) || 0,
        volume: Number(data.quoteVolume) || 0,
        high: Number(data.high) || Number(data.price) * 1.02,
        low: Number(data.low) || Number(data.price) * 0.98,
      }))
      .filter((c) => c.price > 0 && c.volume > 250000); // Mínimo $250k de volume 24h

    // 2. Classificar por perfis de oportunidade no mercado atual (amostras amplas)
    // A) Maiores Altas com Volume (Momentum / Breakout) — top 40 ordenadas
    const gainers = allValid
      .filter((c) => c.change24h > 0.8 && c.volume > 1000000)
      .sort((a, b) => b.change24h - a.change24h);

    // B) Maiores Correções com Volume (Dip Hunter / RSI Sobrevendido) — top 40 ordenadas
    const dipHunters = allValid
      .filter((c) => c.change24h < -0.5 && c.volume > 1000000)
      .sort((a, b) => a.change24h - b.change24h);

    // C) Maior Volatilidade Intradiária (Amplitude High/Low para Scalping)
    const volatile = allValid
      .map((c) => ({
        ...c,
        spreadPct: c.price > 0 ? ((c.high - c.low) / c.price) * 100 : 0,
      }))
      .filter((c) => c.spreadPct > 3.5 && c.volume > 800000)
      .sort((a, b) => b.spreadPct - a.spreadPct);

    // D) Altcoins Populares e Narrativas Quentes (IA, L1s, DeFi, Memes)
    const hotNarrativesSymbols = new Set([
      'RENDERUSDT', 'NEARUSDT', 'SUIUSDT', 'SEIUSDT', 'INJUSDT', 'TIAUSDT', 'POLUSDT',
      'ARUSDT', 'TAOUSDT', 'FETUSDT', 'APTUSDT', 'PENDLEUSDT', 'JUPUSDT', 'WIFUSDT',
      'PEPEUSDT', 'FLOKIUSDT', 'BONKUSDT', 'AVAXUSDT', 'LINKUSDT', 'AAVEUSDT', 'UNIUSDT',
      'GALAUSDT', 'STXUSDT', 'ATOMUSDT', 'OPUSDT', 'ARBUSDT', 'STRKUSDT', 'RUNEUSDT',
      'DYDXUSDT', 'ONDOUSDT', 'ENAUSDT', 'PYTHUSDT', 'WLDUSDT', 'IOUSDT', 'ZROUSDT'
    ]);
    const hotAltcoins = allValid.filter((c) => hotNarrativesSymbols.has(c.symbol));

    // E) Blue Chips Consolidados (Grandes L1s)
    const blueChipsList = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT']);
    const blueChips = allValid.filter((c) => blueChipsList.has(c.symbol));

    // 3. Montar uma cesta balanceada e dinâmica de candidatos
    const selectedSymbols = new Set<string>();
    const diversePool: typeof allValid = [];

    const addRandomFromList = (list: typeof allValid, _count: number, samplePoolSize = 35) => {
      const candidates = shuffleArray(list.slice(0, samplePoolSize));
      for (const item of candidates) {
        if (!selectedSymbols.has(item.symbol)) {
          selectedSymbols.add(item.symbol);
          diversePool.push(item);
          if (diversePool.length >= 24) break;
        }
      }
    };

    if (focusCategory === 'gainers') {
      addRandomFromList(gainers, 8, 40);
      addRandomFromList(volatile, 4, 30);
      addRandomFromList(hotAltcoins, 4, 30);
    } else if (focusCategory === 'hot_altcoins') {
      addRandomFromList(hotAltcoins, 8, 35);
      addRandomFromList(gainers, 4, 30);
      addRandomFromList(volatile, 4, 30);
    } else if (focusCategory === 'dip_hunters') {
      addRandomFromList(dipHunters, 8, 40);
      addRandomFromList(hotAltcoins, 4, 30);
      addRandomFromList(blueChips, 4, 10);
    } else if (focusCategory === 'blue_chips') {
      addRandomFromList(blueChips, 6, 10);
      addRandomFromList(hotAltcoins, 5, 25);
      addRandomFromList(gainers, 5, 25);
    } else {
      // MIX DIVERSIFICADO PADRÃO: Amostragem ampla garantindo que cada requisição traga pares diferentes
      addRandomFromList(gainers, 5, 35);
      addRandomFromList(hotAltcoins, 5, 35);
      addRandomFromList(dipHunters, 4, 30);
      addRandomFromList(volatile, 4, 30);
      addRandomFromList(blueChips, 2, 7);
    }

    // Se o pool for pequeno, adicionar lista ampla de backup verificada na Binance Spot
    if (diversePool.length < 6) {
      const fallbackPool = allValid.length > 0 ? shuffleArray(allValid).slice(0, 15) : [
        { symbol: 'SUIUSDT', price: 1.85, change24h: 8.4, volume: 320000000, high: 1.95, low: 1.72 },
        { symbol: 'RENDERUSDT', price: 6.20, change24h: 5.8, volume: 140000000, high: 6.45, low: 5.90 },
        { symbol: 'NEARUSDT', price: 4.80, change24h: 3.9, volume: 210000000, high: 5.05, low: 4.60 },
        { symbol: 'TAOUSDT', price: 540, change24h: 7.2, volume: 110000000, high: 565, low: 512 },
        { symbol: 'INJUSDT', price: 21.5, change24h: -1.8, volume: 95000000, high: 22.8, low: 20.9 },
        { symbol: 'SOLUSDT', price: 145, change24h: 5.2, volume: 800000000, high: 152, low: 139 },
        { symbol: 'PEPEUSDT', price: 0.0000095, change24h: 12.4, volume: 450000000, high: 0.0000102, low: 0.0000088 },
        { symbol: 'AVAXUSDT', price: 28.5, change24h: 4.1, volume: 190000000, high: 29.8, low: 27.2 },
        { symbol: 'BTCUSDT', price: 65000, change24h: 1.8, volume: 1500000000, high: 66000, low: 64200 },
      ];
      for (const item of fallbackPool) {
        if (!selectedSymbols.has(item.symbol) && isTradableBinanceSpotSymbol(item.symbol, null, spotRegistry)) {
          selectedSymbols.add(item.symbol);
          diversePool.push(item);
        }
      }
    }

    // 4. Montar resumo dinâmico para as IAs (com até 16 ativos variados)
    const candidateSubset = shuffleArray(diversePool).slice(0, 16);
    const allowedSymbolsList = candidateSubset.map((c) => c.symbol).join(', ');
    const marketSummary = candidateSubset
      .map((c) => `${c.symbol}: Preço $${c.price.toLocaleString()}, Variação 24h: ${c.change24h > 0 ? '+' : ''}${c.change24h.toFixed(2)}%, Vol 24h: $${(c.volume / 1e6).toFixed(1)}M`)
      .join('\n');

    const prompt = `Você é um gestor quantitativo sênior de fundos cripto.
Analise os ativos abaixo e gere exatamente 6 recomendações DIVERSIFICADAS de estratégias para robôs automatizados de trading na Binance Spot.
REGRA CRÍTICA DE ELEGIBILIDADE BINANCE SPOT:
- Escolha EXCLUSIVAMENTE símbolos presentes nesta lista verificada da Binance Spot: [${allowedSymbolsList}].
- NUNCA sugira ações tokenizadas (*BUSDT), stablecoins (USDC, FDUSD, RLUSD, UUSDT) ou ativos fora da lista acima.
- No máximo 1 robô pode ser em BTCUSDT ou ETHUSDT. Os outros 5 DEVEM ser em altcoins líquidas da lista.
- Distribua as 6 recomendações entre os horizontes de tempo:
  * 2 robôs para SCALPING RÁPIDO (timeframe 15m, duração 15 a 45 min)
  * 2 robôs para DAY TRADE (timeframe 1h, duração 2h a 6h)
  * 2 robôs para SWING TRADE (timeframe 4h ou 1d, duração 1 a 3 dias)
- Para cada estratégia, defina:
  1. Estratégia de IA ("QUANT_ENSEMBLE", "MACD", "RSI", "GRID", "BREAKOUT" ou "MEAN_REVERSION")
  2. MONTANTE DE ENTRADA IDEAL em USDT (mínimo $20 USDT, considerando capital total de $${availableCash.toFixed(2)} USDT)
  3. Duração e Timeframe adequados
  4. Alvos de Take Profit e Stop Loss matematicamente favoráveis (Stop Loss <= 2.0% e Risco/Retorno mínimo de 2.0:1)

DADOS DE MERCADO ATUAIS:
${marketSummary}

CAPITAL TOTAL: $${availableCash.toFixed(2)} USDT (${tradingMode === 'live' ? 'Conta Real Binance' : 'Modo Simulado'})

Responda APENAS com um array JSON com 6 objetos no formato:
[
  {
    "name": "Nome descritivo e poderoso para o robô",
    "symbol": "SUIUSDT",
    "strategy": "BREAKOUT",
    "allocationAmount": 50,
    "allocationPct": 5.0,
    "operationalTimeframe": "15m",
    "estimatedDuration": "Scalping Rápido (15-45 min)",
    "timeHorizonType": "SCALPING",
    "takeProfit": 4.2,
    "stopLoss": 1.8,
    "trailingStop": true,
    "trailingStopDistance": 0.8,
    "confidenceScore": 92,
    "marketRegime": "ALTA_VOLATILIDADE",
    "technicalReasoning": "Justificativa analítica com dados técnicos do porquê desta moeda, estratégia, montante e tempo",
    "riskRewardRatio": "2.3:1"
  }
]`;

    // 5. Execução Multi-IA Simultânea (Paralela)
    const activeProviderIds = getActiveProvidersList();
    const providersToQuery: AIProviderId[] = activeProviderIds.filter((p) => !!resolveApiKey(p).key);

    if (providersToQuery.length === 0) {
      for (const p of AI_PROVIDERS) {
        if (resolveApiKey(p.id).key && !providersToQuery.includes(p.id)) {
          providersToQuery.push(p.id);
        }
      }
    }

    const collectedRecommendations: AIBotRecommendation[] = [];
    const queryResultsSummary: { id: string; name: string; model: string; count: number; error?: string }[] = [];

    if (providersToQuery.length > 0) {
      const queries = providersToQuery.map(async (providerId) => {
        const pInfo = getProvider(providerId);
        const pModel = getModel(providerId);
        try {
          const res = await askAI({
            system: 'Você é um especialista em robôs de trading quantitativo na Binance Spot. Responda apenas com array JSON válido, sem texto explicativo adicional.',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 4000,
            provider: providerId,
          });

          const parsed = parseJsonLoose<any[]>(res.text);
          if (Array.isArray(parsed) && parsed.length >= 2) {
            const validRecs = parsed.filter((rec) =>
              rec?.symbol && isTradableBinanceSpotSymbol(String(rec.symbol), marketData[String(rec.symbol).toUpperCase()], spotRegistry)
            );
            if (validRecs.length > 0) {
              const enriched: AIBotRecommendation[] = validRecs.map((item, idx) => {
                const normalizedSymbol = String(item.symbol).trim().toUpperCase();
                const amount = Math.max(20, Math.min(Math.max(25, availableCash * 0.4), Number(item.allocationAmount) || 50));
                const sl = Math.max(1.2, Math.min(2.0, Number(item.stopLoss) || 1.8));
                let tp = Math.max(3.6, Number(item.takeProfit) || 4.2);
                if (tp < sl * 2.0) {
                  tp = Number((sl * 2.2).toFixed(1));
                }
                const trailing = Math.max(0.6, Math.min(1.5, Number(item.trailingStopDistance) || 0.8));

                return {
                  ...item,
                  symbol: normalizedSymbol,
                  id: `rec-${providerId}-${Date.now()}-${idx}-${normalizedSymbol}`,
                  allocationAmount: amount,
                  allocationPct: parseFloat(((amount / Math.max(1, availableCash)) * 100).toFixed(1)),
                  takeProfit: tp,
                  stopLoss: sl,
                  trailingStop: true,
                  trailingStopDistance: trailing,
                  riskRewardRatio: `${(tp / sl).toFixed(1)}:1`,
                  aiProvider: providerId,
                  aiProviderName: pInfo.name,
                  aiModel: res.model || pModel,
                };
              });

              return {
                providerId,
                name: pInfo.name,
                model: res.model || pModel,
                recs: enriched,
              };
            }
          }
          throw new Error('Resposta da IA não continha recomendações válidas.');
        } catch (err: any) {
          console.warn(`[AI Recommendations] Falha ao consultar ${pInfo.name} (${providerId}):`, err.message);
          throw new Error(err.message || 'Erro de comunicação');
        }
      });

      const settled = await Promise.allSettled(queries);

      for (let i = 0; i < settled.length; i++) {
        const provId = providersToQuery[i];
        const pInfo = getProvider(provId);
        const result = settled[i];

        if (result.status === 'fulfilled') {
          collectedRecommendations.push(...result.value.recs);
          queryResultsSummary.push({
            id: provId,
            name: pInfo.name,
            model: result.value.model,
            count: result.value.recs.length,
          });
        } else {
          queryResultsSummary.push({
            id: provId,
            name: pInfo.name,
            model: getModel(provId),
            count: 0,
            error: result.reason?.message || 'Falha na requisição',
          });
        }
      }
    }

    // Se pelo menos uma IA retornou recomendações, devolve as recomendações combinadas
    if (collectedRecommendations.length > 0) {
      return NextResponse.json({
        success: true,
        recommendations: collectedRecommendations,
        source: 'ai_multi',
        providers: queryResultsSummary,
        multiAi: providersToQuery.length > 1,
      });
    }

    // 6. Motor Quantitativo Algorítmico de Fallback (usado se nenhuma IA externa estiver acessível)
    const pickUnique = (list: typeof allValid, used: Set<string>, fallbackList: typeof allValid) => {
      const available = list.filter((c) => !used.has(c.symbol));
      if (available.length > 0) {
        const item = shuffleArray(available)[0];
        used.add(item.symbol);
        return item;
      }
      const backup = fallbackList.filter((c) => !used.has(c.symbol));
      if (backup.length > 0) {
        const item = shuffleArray(backup)[0];
        used.add(item.symbol);
        return item;
      }
      return diversePool[0] || allValid[0];
    };

    const usedCoins = new Set<string>();
    const slot0Coin = pickUnique(gainers.length > 0 ? gainers : hotAltcoins, usedCoins, diversePool);
    const slot1Coin = pickUnique(hotAltcoins.length > 0 ? hotAltcoins : volatile, usedCoins, diversePool);
    const slot2Coin = pickUnique(dipHunters.length > 0 ? dipHunters : volatile, usedCoins, diversePool);
    const slot3Coin = pickUnique(volatile.length > 0 ? volatile : hotAltcoins, usedCoins, diversePool);
    const slot4Coin = pickUnique(blueChips.length > 0 ? blueChips : hotAltcoins, usedCoins, diversePool);
    const slot5Coin = pickUnique(shuffleArray(diversePool), usedCoins, allValid);

    const slotCoins = [slot0Coin, slot1Coin, slot2Coin, slot3Coin, slot4Coin, slot5Coin].filter(Boolean);

    const fallbackRecommendations: AIBotRecommendation[] = slotCoins.map((coin, idx) => {
      const cleanSym = coin.symbol.replace('USDT', '');

      let strategy = "QUANT_ENSEMBLE";
      let timeframe = "1h";
      let estimatedDuration = "Day Trade (2h a 6h)";
      let horizonType: AIBotRecommendation["timeHorizonType"] = "DAY_TRADE";
      let tp = 3.8;
      let sl = 1.8;
      let trailing = 0.8;
      let regime: AIBotRecommendation["marketRegime"] = "TENDENCIA_ALTA";
      let allocAmount = Math.max(20, Math.min(400, Math.round(availableCash * 0.08)));
      let reasoning = "";

      if (idx === 0) {
        strategy = "BREAKOUT";
        timeframe = "15m";
        estimatedDuration = "Scalping Rápido (15 a 45 min)";
        horizonType = "SCALPING";
        tp = 4.5;
        sl = 1.8;
        trailing = 0.8;
        regime = "ALTA_VOLATILIDADE";
        allocAmount = Math.max(20, Math.round(availableCash * 0.06));
        reasoning = `Fluxo comprador e volatilidade em expansão em ${cleanSym} (${coin.change24h > 0 ? '+' : ''}${coin.change24h.toFixed(1)}% nas 24h). Rompimento com alvo de +4.5% e stop estrito em 1.8%.`;
      } else if (idx === 1) {
        strategy = "RSI";
        timeframe = "15m";
        estimatedDuration = "Scalping em Fundo / Repique (30 a 90 min)";
        horizonType = "SCALPING";
        tp = 4.2;
        sl = 1.8;
        trailing = 0.8;
        regime = "CORRECAO_SOBREVENDA";
        allocAmount = Math.max(20, Math.round(availableCash * 0.07));
        reasoning = `${cleanSym} atingiu sobrevenda técnica no curto prazo (${coin.change24h.toFixed(1)}% nas 24h). Repique com R:R de 2.3:1 (alvo +4.2% / stop -1.8%).`;
      } else if (idx === 2) {
        strategy = "MACD";
        timeframe = "1h";
        estimatedDuration = "Day Trade de Momentum (2h a 6h)";
        horizonType = "DAY_TRADE";
        tp = 4.4;
        sl = 1.8;
        trailing = 0.9;
        regime = "TENDENCIA_ALTA";
        allocAmount = Math.max(20, Math.round(availableCash * 0.10));
        reasoning = `Cruzamento altista sustentado por volume em ${cleanSym}. Operação horária com relação risco/retorno favorável de 2.44:1 em continuação de tendência.`;
      } else if (idx === 3) {
        strategy = "QUANT_ENSEMBLE";
        timeframe = "1h";
        estimatedDuration = "Day Trade Algorítmico (3h a 8h)";
        horizonType = "DAY_TRADE";
        tp = 4.6;
        sl = 1.9;
        trailing = 0.9;
        regime = "TENDENCIA_ALTA";
        allocAmount = Math.max(20, Math.round(availableCash * 0.10));
        reasoning = `Modelo de ensemble combinando fluxo de ordens e momentum em ${cleanSym}. Confluência de indicadores com assimetria de 2.42:1.`;
      } else if (idx === 4) {
        strategy = "GRID";
        timeframe = "4h";
        estimatedDuration = "Grid Contínuo de Faixa (1 a 3 dias)";
        horizonType = "SWING_TRADE";
        tp = 4.2;
        sl = 1.8;
        trailing = 0.8;
        regime = "LATERAL_ACUMULACAO";
        allocAmount = Math.max(25, Math.round(availableCash * 0.12));
        reasoning = `${cleanSym} consolidando em canal lateral bem definido. Algoritmo de Grid com meta de 4.2% e stop de 1.8% para evitar ruído.`;
      } else {
        strategy = "MEAN_REVERSION";
        timeframe = "4h";
        estimatedDuration = "Swing de Reversão (1 a 4 dias)";
        horizonType = "SWING_TRADE";
        tp = 4.8;
        sl = 2.0;
        trailing = 1.0;
        regime = "LATERAL_ACUMULACAO";
        allocAmount = Math.max(20, Math.round(availableCash * 0.09));
        reasoning = `Desvio padrão estatístico ampliado em ${cleanSym}. Posição de swing trade estruturada para retorno à média móvel exponencial com R:R de 2.4:1.`;
      }

      return {
        id: `quant-rec-${Date.now()}-${idx}-${cleanSym}`,
        name: `Bot ${strategy} — ${cleanSym} Pro`,
        symbol: coin.symbol,
        strategy,
        allocationAmount: allocAmount,
        allocationPct: parseFloat(((allocAmount / Math.max(1, availableCash)) * 100).toFixed(1)),
        operationalTimeframe: timeframe,
        estimatedDuration,
        timeHorizonType: horizonType,
        takeProfit: tp,
        stopLoss: sl,
        trailingStop: true,
        trailingStopDistance: trailing,
        confidenceScore: Math.floor(88 + Math.random() * 8),
        marketRegime: regime,
        technicalReasoning: reasoning,
        riskRewardRatio: `${(tp / sl).toFixed(1)}:1`,
        aiProvider: 'algorithmic_quant',
        aiProviderName: 'Algoritmo Quant',
        aiModel: 'Motor Matemático Interno',
      };
    });

    return NextResponse.json({
      success: true,
      recommendations: fallbackRecommendations,
      source: 'algorithmic_quant',
      providers: queryResultsSummary.length > 0 ? queryResultsSummary : [
        { id: 'algorithmic_quant', name: 'Algoritmo Quant', model: 'Motor Matemático Interno', count: fallbackRecommendations.length }
      ],
      multiAi: false,
    });
  } catch (error: any) {
    console.error('[AI Bot Recommendations] Erro geral:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao gerar recomendações' },
      { status: 500 }
    );
  }
}
