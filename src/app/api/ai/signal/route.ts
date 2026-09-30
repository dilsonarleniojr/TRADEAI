import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: InstanceType<typeof ZAI> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export async function POST(request: NextRequest) {
  try {
    const { symbol, price, priceChange24h, volume, high24h, low24h } = await request.json();

    const zai = await getZAI();

    const prompt = `Analise os seguintes dados de criptomoeda e forneça um sinal de trading:

Símbolo: ${symbol}
Preço Atual: $${price}
Variação 24h: ${priceChange24h}%
Volume 24h: $${volume}
Máxima 24h: $${high24h}
Mínima 24h: $${low24h}

Responda com um objeto JSON contendo:
- action: "BUY", "SELL", ou "HOLD"
- confidence: um número entre 0 e 1
- reasoning: uma breve explicação (1-2 frases em português)
- stopLoss: preço sugerido para stop loss (número) - deve ser abaixo do preço atual para BUY, acima para SELL
- takeProfit: preço sugerido para take profit (número) - deve ser acima do preço atual para BUY, abaixo para SELL

IMPORTANTE: Sempre sugira valores de stopLoss e takeProfit realistas baseados em suportes/resistências e volatilidade. Para BUY: stopLoss abaixo do preço, takeProfit acima. Para SELL: stopLoss acima do preço, takeProfit abaixo. Para HOLD: use o preço atual para ambos.

Responda APENAS com o objeto JSON, sem texto adicional.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'Você é um analista de trading de criptomoedas. Responda apenas com JSON válido. Sempre inclua stopLoss e takeProfit realistas.' },
        { role: 'user', content: prompt }
      ],
      thinking: { type: 'disabled' }
    });

    const response = completion.choices[0]?.message?.content || '';

    try {
      // Try to parse the JSON response
      const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const signal = JSON.parse(cleanedResponse);
      return NextResponse.json({ success: true, signal });
    } catch {
      // If parsing fails, return a HOLD signal
      return NextResponse.json({
        success: true,
        signal: {
          action: 'HOLD',
          confidence: 0.5,
          reasoning: 'Não foi possível gerar análise no momento.',
          stopLoss: price || 0,
          takeProfit: price || 0,
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Signal error:', error);
    return NextResponse.json(
      { error: 'Falha ao gerar sinal', details: message },
      { status: 500 }
    );
  }
}
