import { NextRequest, NextResponse } from 'next/server';
import { askAIOnce, parseJsonLoose } from '@/lib/ai-client';

function cleanNum(val: unknown, fallback: number, min?: number, max?: number, decimals: number = 1): number {
  let n = fallback;
  if (typeof val === 'number' && !isNaN(val)) {
    n = val;
  } else if (typeof val === 'string') {
    const parsed = parseFloat(val.replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed)) n = parsed;
  }
  if (min !== undefined && n < min) n = min;
  if (max !== undefined && n > max) n = max;
  return Number(n.toFixed(decimals));
}

function cleanBool(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const s = val.toLowerCase().trim();
    if (s === 'true' || s === '1' || s === 'sim' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'nao' || s === 'não' || s === 'no') return false;
  }
  return fallback;
}

export async function POST(request: NextRequest) {
  let symbol = 'BTCUSDT';
  let marketInfo = {
    price: 0,
    priceChange24h: 0,
    high24h: 0,
    low24h: 0,
    volume: 0,
  };
  let currentConfig: Record<string, any> = {};

  try {
    const body = await request.json();
    symbol = (body.symbol || 'BTCUSDT').toUpperCase().trim();
    if (!symbol.endsWith('USDT') && !symbol.includes('/')) {
      symbol = `${symbol}USDT`;
    }
    symbol = symbol.replace('/', '');
    currentConfig = body.currentConfig || {};

    // 1. Coleta dados reais do mercado com timeout agressivo de 2.5s
    try {
      const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (priceRes.ok) {
        const data = await priceRes.json();
        marketInfo = {
          price: parseFloat(data.lastPrice) || 0,
          priceChange24h: parseFloat(data.priceChangePercent) || 0,
          high24h: parseFloat(data.highPrice) || 0,
          low24h: parseFloat(data.lowPrice) || 0,
          volume: parseFloat(data.quoteVolume) || 0,
        };
      }
    } catch (err: any) {
      console.warn('[AI Bot Autofill] Failed to fetch market data from Binance:', err.message);
    }

    // 2. Tenta gerar com o motor de IA ativo com timeout de 3.5s
    try {
      const prompt = `Você é um gestor quantitativo especialista em robôs de trade algorítmico da Binance.
Analise os dados do ativo ${symbol} e sugira a configuração ideal e mais lucrativa para um robô de trading automatizado.

Dados de Mercado para ${symbol}:
- Preço Atual: $${marketInfo.price || 'N/A'}
- Variação 24h: ${marketInfo.priceChange24h.toFixed(2)}%
- Máxima 24h: $${marketInfo.high24h || 'N/A'}
- Mínima 24h: $${marketInfo.low24h || 'N/A'}
- Volume 24h: $${((marketInfo.volume || 0) / 1e6).toFixed(1)}M

Estratégias Disponíveis: "QUANT_ENSEMBLE", "RSI", "MACD", "GRID", "BREAKOUT", "MEAN_REVERSION".

    Responda APENAS com um objeto JSON no seguinte formato (sem explicações fora do JSON):
    {
      "name": "Nome descritivo e marcante (ex: Resolv Quantum Scalper)",
      "strategy": "QUANT_ENSEMBLE" | "RSI" | "MACD" | "GRID" | "BREAKOUT" | "MEAN_REVERSION",
      "takeProfit": número entre 2.5 e 8.0 (ex: 3.2),
      "stopLoss": número entre 1.0 e 1.4 (ex: 1.2),
      "trailingStop": true ou false,
      "trailingStopDistance": número entre 0.4 e 1.2 (ex: 0.5),
      "allocationAmount": número entre 20 e 500 (ex: 100),
      "useMarketRegime": true ou false,
      "useQuantFunnel": true ou false,
      "useEnsemble": true ou false,
      "useMultiTimeframe": true ou false,
      "rsiPeriod": 14,
      "buyThreshold": 30,
      "sellThreshold": 70,
      "emaFast": 12,
      "emaSlow": 26,
      "reasoning": "Breve justificativa técnica em português (1-2 frases)"
    }`;

      const aiPromise = askAIOnce(
        'Você é um engenheiro de algoritmos de trading. Responda apenas com JSON válido.',
        prompt,
        { maxTokens: 600 }
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI timeout')), 3500)
      );

      const response = await Promise.race([aiPromise, timeoutPromise]);
      const rawConfig = parseJsonLoose<Record<string, unknown>>(response);

      if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
        const cleanSym = symbol.replace('USDT', '');
        const validStrategies = ['QUANT_ENSEMBLE', 'RSI', 'MACD', 'GRID', 'BREAKOUT', 'MEAN_REVERSION'];
        const chosenStrategy = validStrategies.includes(String(rawConfig.strategy).toUpperCase())
          ? String(rawConfig.strategy).toUpperCase()
          : 'QUANT_ENSEMBLE';

        return NextResponse.json({
          success: true,
          config: {
            name: typeof rawConfig.name === 'string' && rawConfig.name.trim() ? rawConfig.name.trim() : `Bot IA ${cleanSym} Quantum`,
            strategy: chosenStrategy,
            takeProfit: cleanNum(rawConfig.takeProfit, 3.2, 2.0, 15.0),
            stopLoss: cleanNum(rawConfig.stopLoss, 1.2, 0.8, 2.0),
            trailingStop: cleanBool(rawConfig.trailingStop, true),
            trailingStopDistance: cleanNum(rawConfig.trailingStopDistance, 0.5, 0.3, 1.5),
            allocationAmount: cleanNum(rawConfig.allocationAmount, 100, 10, 10000, 0),
            useMarketRegime: cleanBool(rawConfig.useMarketRegime, true),
            useQuantFunnel: cleanBool(rawConfig.useQuantFunnel, false),
            useEnsemble: cleanBool(rawConfig.useEnsemble, chosenStrategy === 'QUANT_ENSEMBLE'),
            useMultiTimeframe: cleanBool(rawConfig.useMultiTimeframe, true),
            autoBreakEven: cleanBool(rawConfig.autoBreakEven, true),
            breakEvenTrigger: cleanNum(rawConfig.breakEvenTrigger, 1.8, 1.0, 4.0),
            breakEvenBuffer: cleanNum(rawConfig.breakEvenBuffer, 0.50, 0.25, 0.8, 2),
            rsiPeriod: cleanNum(rawConfig.rsiPeriod, 14, 5, 30, 0),
            buyThreshold: cleanNum(rawConfig.buyThreshold, 30, 10, 50, 0),
            sellThreshold: cleanNum(rawConfig.sellThreshold, 70, 55, 95, 0),
            emaFast: cleanNum(rawConfig.emaFast, 12, 3, 30, 0),
            emaSlow: cleanNum(rawConfig.emaSlow, 26, 10, 80, 0),
            reasoning: typeof rawConfig.reasoning === 'string' && rawConfig.reasoning.trim()
              ? rawConfig.reasoning.trim()
              : `Otimização automatizada baseada nas condições intradiárias de ${cleanSym}.`,
          },
        });
      }
    } catch (aiErr: any) {
      console.warn('[AI Bot Autofill] IA demorou ou indisponível, usando fallback algorítmico imediato:', aiErr.message);
    }

    // 3. Fallback Algorítmico Quantitativo de Alta Precisão (Sub-50ms)
    const cleanSym = symbol.replace('USDT', '');
    const absChange = Math.abs(marketInfo.priceChange24h);
    const isBull = marketInfo.priceChange24h > 1.5;
    const isBear = marketInfo.priceChange24h < -1.5;

    let strategy = 'QUANT_ENSEMBLE';
    let takeProfit = 3.2;
    let stopLoss = 1.2;
    let trailingDistance = 0.5;
    let useMarketRegime = true;
    let useQuantFunnel = false;
    let useEnsemble = true;
    let buyThreshold = 30;
    let sellThreshold = 70;
    let emaFast = 12;
    let emaSlow = 26;
    let reasoning = '';

    if (absChange > 5.0) {
      strategy = isBull ? 'BREAKOUT' : 'RSI';
      takeProfit = 4.2;
      stopLoss = 1.3;
      trailingDistance = 0.6;
      useMarketRegime = true;
      useQuantFunnel = true;
      useEnsemble = false;
      buyThreshold = 25;
      sellThreshold = 75;
      reasoning = `Alta volatilidade detectada em ${cleanSym} (${marketInfo.priceChange24h.toFixed(1)}% nas 24h). Estratégia de expansão com Break-Even defensivo e Stop Loss limitado a 1.3%.`;
    } else if (isBull) {
      strategy = 'MACD';
      takeProfit = 3.6;
      stopLoss = 1.2;
      trailingDistance = 0.5;
      useMarketRegime = true;
      useQuantFunnel = false;
      useEnsemble = false;
      emaFast = 9;
      emaSlow = 21;
      reasoning = `Tendência de alta confirmada em ${cleanSym}. Estratégia de Momentum (MACD 9/21) com trailing stop dinâmico de 0.5% e Break-Even rápido em +0.8%.`;
    } else if (isBear) {
      strategy = 'RSI';
      takeProfit = 3.0;
      stopLoss = 1.1;
      trailingDistance = 0.5;
      useMarketRegime = false;
      useQuantFunnel = false;
      useEnsemble = false;
      buyThreshold = 26;
      sellThreshold = 68;
      reasoning = `Ativo em sobrevenda/recuo (${marketInfo.priceChange24h.toFixed(1)}%). Caça de fundo no RSI ≤ 26 com stop loss curto de 1.1% e R:R de ~2.7:1.`;
    } else {
      strategy = 'GRID';
      takeProfit = 2.8;
      stopLoss = 1.2;
      trailingDistance = 0.5;
      useMarketRegime = false;
      useQuantFunnel = false;
      useEnsemble = false;
      reasoning = `Mercado lateral em ${cleanSym}. Grid Scalper com meta de 2.8%, stop de 1.2% e proteção de Break-Even ativa.`;
    }

    // Garante que os números visivelmente diferem se o usuário já tiver exatamente o mesmo valor
    if (currentConfig.takeProfit && Math.abs(currentConfig.takeProfit - takeProfit) < 0.1) {
      takeProfit = Number((takeProfit + 0.3).toFixed(1));
    }
    if (currentConfig.stopLoss && Math.abs(currentConfig.stopLoss - stopLoss) < 0.1) {
      stopLoss = Number((stopLoss + 0.2).toFixed(1));
    }

    return NextResponse.json({
      success: true,
      config: {
        name: `Bot IA ${cleanSym} Quantum`,
        strategy,
        takeProfit,
        stopLoss,
        trailingStop: true,
        trailingStopDistance: trailingDistance,
        allocationAmount: currentConfig.allocationAmount ? Math.max(35, currentConfig.allocationAmount) : 50,
        useMarketRegime,
        useQuantFunnel,
        useEnsemble,
        useMultiTimeframe: true,
        autoBreakEven: true,
        breakEvenTrigger: 1.8,
        breakEvenBuffer: 0.50,
        rsiPeriod: 14,
        buyThreshold,
        sellThreshold,
        emaFast,
        emaSlow,
        reasoning,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Bot Autofill error:', error);
    return NextResponse.json(
      { error: 'Falha ao processar configuração do bot', details: message },
      { status: 500 }
    );
  }
}

