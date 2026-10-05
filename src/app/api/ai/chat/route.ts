import { NextRequest, NextResponse } from 'next/server';
import { AIUnavailableError, askAI, type AIMessage } from '@/lib/ai-client';
import { getActiveProvider, getModel } from '@/lib/ai/settings';

// Conversas em memória. As respostas são guardadas inteiras (no Claude, com os blocos de
// raciocínio) e o histórico só cresce no fim, como a API exige para reaproveitar o raciocínio.
// Trocar de motor ou de modelo recomeça a conversa.
const conversations = new Map<string, { engine: string; turns: AIMessage[] }>();
const MAX_TURNS = 20; // ao passar disso, recomeça a conversa em vez de editar o meio do histórico

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

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    const engine = `${getActiveProvider()}:${getModel(getActiveProvider())}`;
    const saved = conversations.get(sessionId);
    let history = saved && saved.engine === engine ? saved.turns : [];
    if (history.length >= MAX_TURNS * 2) history = [];

    const pending: AIMessage[] = [...history, { role: 'user', content: message }];
    const reply = await askAI({
      system: SYSTEM_PROMPT,
      messages: pending,
      maxTokens: 8000,
      effort: 'medium',
    });

    const aiResponse = reply.text || 'Desculpe, não foi possível gerar uma resposta.';
    // Guarda só depois do sucesso, para uma falha não deixar uma pergunta sem resposta no histórico.
    history = [...pending, { role: 'assistant', content: reply.assistantContent }];
    conversations.set(sessionId, { engine, turns: history });

    return NextResponse.json({
      success: true,
      response: aiResponse,
      messageCount: history.length,
      engine: { provider: reply.provider, model: reply.model },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Chat error:', error);
    const status = error instanceof AIUnavailableError ? 503 : 500;
    return NextResponse.json(
      { error: 'Falha ao gerar resposta', details: message },
      { status }
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
