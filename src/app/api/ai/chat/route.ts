import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// Store conversations in memory
const conversations = new Map<string, { role: string; content: string }[]>();

const SYSTEM_PROMPT = `Você é o Crypto IA Pro, um assistente de IA avançado especializado em trading e análise de criptomoedas. Você tem conhecimento profundo de:

1. Análise Técnica: RSI, MACD, Médias Móveis, Bandas de Bollinger, retrações de Fibonacci, níveis de suporte/resistência
2. Análise Fundamental: Métricas on-chain, sentimento de mercado, desenvolvimentos regulatórios, tendências de adoção
3. Estratégias de Trading: Day trading, swing trading, position trading, gerenciamento de risco
4. Mercados de Criptomoedas: Principais moedas (BTC, ETH, SOL, etc.), DeFi, NFTs, soluções Layer 2
5. Gerenciamento de Risco: Dimensionamento de posição, estratégias de stop loss, diversificação de portfólio

REGRAS IMPORTANTES:
- Sempre sugira valores de STOP LOSS e TAKE PROFIT quando recomendar uma operação de compra ou venda
- Os valores de SL/TP devem ser realistas, baseados em suportes/resistência e volatilidade do ativo
- Para BUY: Stop Loss abaixo do preço de entrada, Take Profit acima
- Para SELL: Stop Loss acima do preço de entrada, Take Profit abaixo
- Formate os valores de SL/TP claramente, ex: "🎯 Entrada: $78.000 | 🛑 Stop Loss: $76.500 (-1.9%) | ✅ Take Profit: $82.000 (+5.1%)"
- Seja conciso mas informativo
- Forneça números e dados específicos quando relevante
- Inclua avisos de risco ao discutir estratégias de trading
- Use terminologia crypto adequada
- Se perguntarem sobre moedas específicas, forneça análise equilibrada (cenários de alta e baixa)
- Sempre lembre os usuários que isso não é recomendação financeira
- RESPONDA SEMPRE EM PORTUGUÊS BRASILEIRO`;

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
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
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

    const aiResponse = completion.choices[0]?.message?.content || 'Desculpe, não foi possível gerar uma resposta.';

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
      { error: 'Falha ao gerar resposta', details: message },
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
