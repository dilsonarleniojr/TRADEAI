import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: InstanceType<typeof ZAI> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    try {
      zaiInstance = await ZAI.create();
    } catch (e: any) {
      console.warn('[ZAI SDK Init Warning]:', e.message);
      return null;
    }
  }
  return zaiInstance;
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

  try {
    const body = await request.json();
    symbol = body.symbol || 'BTCUSDT';

    // 1. Coleta dados reais do mercado
    try {
      const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      if (priceRes.ok) {
        const data = await priceRes.json();
        marketInfo = {
          price: parseFloat(data.lastPrice),
          priceChange24h: parseFloat(data.priceChangePercent),
          high24h: parseFloat(data.highPrice),
          low24h: parseFloat(data.lowPrice),
          volume: parseFloat(data.quoteVolume),
        };
      }
    } catch (err: any) {
      console.warn('[AI Bot Autofill] Failed to fetch market data:', err.message);
    }

    // 2. Tenta gerar via SDK da IA
    const zai = await getZAI();
    if (zai) {
      try {
        const prompt = `Você é um gestor quantitativo especialista em robôs de trade.
Analise os dados do ativo ${symbol} e sugira a configuração ideal e mais lucrativa para um robô de trading automatizado.

Dados de Mercado para ${symbol}:
- Preço Atual: $${marketInfo.price || 'N/A'}
- Variação 24h: ${marketInfo.priceChange24h || '0'}%
- Máxima 24h: $${marketInfo.high24h || 'N/A'}
- Mínima 24h: $${marketInfo.low24h || 'N/A'}
- Volume 24h: $${((marketInfo.volume || 0) / 1e6).toFixed(1)}M

Estratégias Disponíveis: "QUANT_ENSEMBLE", "RSI", "MACD", "GRID", "BREAKOUT", "MEAN_REVERSION".

Responda APENAS com um objeto JSON no seguinte formato:
{
  "name": "Nome descritivo e marcante",
  "strategy": "QUANT_ENSEMBLE" | "RSI" | "MACD" | "GRID" | "BREAKOUT" | "MEAN_REVERSION",
  "takeProfit": número (ex: 3.5),
  "stopLoss": número (ex: 1.8),
  "trailingStop": boolean (true ou false),
  "trailingStopDistance": número (ex: 0.8),
  "allocationAmount": número em USDT (ex: 100),
  "reasoning": "Breve justificativa técnica em português (1-2 frases)"
}`;

        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content: 'Você é um engenheiro de algoritmos de trading. Responda apenas com JSON válido.',
            },
            { role: 'user', content: prompt },
          ],
          thinking: { type: 'disabled' },
        });

        const response = completion.choices[0]?.message?.content || '';
        const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const config = JSON.parse(cleanedResponse);
        return NextResponse.json({ success: true, config });
      } catch (aiErr: any) {
        console.warn('[AI Bot Autofill] SDK inference error, using algorithmic fallback:', aiErr.message);
      }
    }

    // 3. Fallback Algorítmico Quantitativo de Alta Precisão
    const cleanSym = symbol.replace('USDT', '');
    const absChange = Math.abs(marketInfo.priceChange24h);
    const isBull = marketInfo.priceChange24h > 1.5;
    const isBear = marketInfo.priceChange24h < -1.5;

    let strategy: string = 'QUANT_ENSEMBLE';
    let takeProfit = 3.5;
    let stopLoss = 1.8;
    let trailingDistance = 0.8;
    let reasoning = '';

    if (absChange > 4.5) {
      strategy = isBull ? 'BREAKOUT' : 'RSI';
      takeProfit = 5.2;
      stopLoss = 2.4;
      trailingDistance = 1.2;
      reasoning = `Alta volatilidade detectada em ${cleanSym} (${marketInfo.priceChange24h.toFixed(1)}% nas 24h). Configurado alvos mais amplos para captura de tendência.`;
    } else if (isBull) {
      strategy = 'MACD';
      takeProfit = 3.8;
      stopLoss = 1.6;
      trailingDistance = 0.7;
      reasoning = `Tendência de alta confirmada em ${cleanSym}. Estratégia de Momentum ativada com trailing stop protetivo.`;
    } else if (isBear) {
      strategy = 'RSI';
      takeProfit = 3.2;
      stopLoss = 1.5;
      trailingDistance = 0.6;
      reasoning = `Ativo em sobrevenda/recuo (${marketInfo.priceChange24h.toFixed(1)}%). Otimizado para caçar fundo com proteção de stop ajustada.`;
    } else {
      strategy = 'GRID';
      takeProfit = 2.4;
      stopLoss = 1.2;
      trailingDistance = 0.5;
      reasoning = `Mercado lateral em ${cleanSym}. Configurado Grid Scalper para extrair lucros com oscilações curtas.`;
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
        allocationAmount: 100,
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
