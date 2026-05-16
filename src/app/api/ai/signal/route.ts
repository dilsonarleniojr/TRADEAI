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

    const prompt = `Analyze the following cryptocurrency data and provide a trading signal:

Symbol: ${symbol}
Current Price: $${price}
24h Change: ${priceChange24h}%
24h Volume: $${volume}
24h High: $${high24h}
24h Low: $${low24h}

Respond with a JSON object containing:
- action: "BUY", "SELL", or "HOLD"
- confidence: a number between 0 and 1
- reasoning: a brief explanation (1-2 sentences)

Only respond with the JSON object, no additional text.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are a cryptocurrency trading analyst. Respond only with valid JSON.' },
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
          reasoning: 'Unable to generate analysis at this time.'
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Signal error:', error);
    return NextResponse.json(
      { error: 'Failed to generate signal', details: message },
      { status: 500 }
    );
  }
}
