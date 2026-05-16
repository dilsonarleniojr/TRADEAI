import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// Store conversations in memory
const conversations = new Map<string, { role: string; content: string }[]>();

const SYSTEM_PROMPT = `You are Crypto IA Pro, an advanced AI assistant specialized in cryptocurrency trading and analysis. You have deep knowledge of:

1. Technical Analysis: RSI, MACD, Moving Averages, Bollinger Bands, Fibonacci retracements, support/resistance levels
2. Fundamental Analysis: On-chain metrics, market sentiment, regulatory developments, adoption trends
3. Trading Strategies: Day trading, swing trading, position trading, risk management
4. Cryptocurrency Markets: Major coins (BTC, ETH, SOL, etc.), DeFi, NFTs, Layer 2 solutions
5. Risk Management: Position sizing, stop-loss strategies, portfolio diversification

When answering questions:
- Be concise but informative
- Provide specific numbers and data when relevant
- Include risk warnings when discussing trading strategies
- Use proper crypto terminology
- If asked about specific coins, provide balanced analysis (bull and bear cases)
- Always remind users that this is not financial advice

Respond in the same language the user uses (Portuguese, English, Spanish, etc.).`;

let zaiInstance: InstanceType<typeof ZAI> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const zai = await getZAI();

    // Get or create conversation history
    let history = conversations.get(sessionId) || [
      { role: 'assistant', content: SYSTEM_PROMPT }
    ];

    // Add user message
    history.push({ role: 'user', content: message });

    // Keep only last 20 messages for context management
    if (history.length > 22) {
      history = [history[0], ...history.slice(-21)];
    }

    const completion = await zai.chat.completions.create({
      messages: history,
      thinking: { type: 'disabled' }
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Add AI response to history
    history.push({ role: 'assistant', content: aiResponse });
    conversations.set(sessionId, history);

    return NextResponse.json({
      success: true,
      response: aiResponse,
      messageCount: history.length - 1,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response', details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (sessionId) {
    conversations.delete(sessionId);
  }
  return NextResponse.json({ success: true });
}
