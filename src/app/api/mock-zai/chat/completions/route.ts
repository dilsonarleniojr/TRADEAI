import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages || [];
    
    // Find the last user message or the overall prompt to understand the context
    const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';
    
    // 1. Top Picks Prompt
    if (userMessage.includes('Selecione as 5 melhor') || userMessage.includes('oportunidades de investimento') || userMessage.includes('DADOS DE MERCADO ATUAIS:')) {
      let tickerData: any[] = [];
      try {
        // Fetch real market tickers from local server to make top picks dynamic and real
        const res = await fetch('http://localhost:3001/api/market/ticker');
        if (res.ok) {
          const json = await res.json();
          tickerData = json.data || [];
        }
      } catch (e) {
        console.warn("Could not fetch tickers for mock-zai top picks, using fallback", e);
      }

      if (tickerData.length === 0) {
        tickerData = [
          { symbol: 'BTCUSDT', lastPrice: '62500', priceChangePercent: '2.5' },
          { symbol: 'ETHUSDT', lastPrice: '3450', priceChangePercent: '1.8' },
          { symbol: 'SOLUSDT', lastPrice: '145.20', priceChangePercent: '5.6' },
          { symbol: 'BNBUSDT', lastPrice: '585.50', priceChangePercent: '0.4' },
          { symbol: 'FETUSDT', lastPrice: '1.45', priceChangePercent: '12.3' },
        ];
      }

      const sorted = [...tickerData]
        .sort((a: any, b: any) => parseFloat(b.priceChangePercent || '0') - parseFloat(a.priceChangePercent || '0'))
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

      const picks = sorted.map((item: any, idx: number) => {
        const price = parseFloat(item.lastPrice || item.price || '0');
        const pct = parseFloat(item.priceChangePercent || '0');
        const isPositive = pct > 0;
        const targetPrice = isPositive ? price * 1.08 : price * 1.05;
        const stopLoss = isPositive ? price * 0.95 : price * 0.97;

        return {
          rank: idx + 1,
          symbol: item.symbol,
          name: names[item.symbol] || item.symbol.replace('USDT', ''),
          currentPrice: price,
          priceChange24h: pct,
          recommendation: pct > 5 ? 'COMPRA FORTE' : pct > 0 ? 'COMPRA' : 'ACUMULAR',
          reason: `Excelente momentum para ${names[item.symbol] || item.symbol} com variação de ${pct.toFixed(2)}% nas últimas 24h. Análise técnica sinaliza padrão de força compradora no intraday com volume expressivo de negociação.`,
          targetPrice: parseFloat(targetPrice.toFixed(4)),
          stopLoss: parseFloat(stopLoss.toFixed(4)),
          riskLevel: pct > 8 ? 'Alto' : pct > 3 ? 'Médio' : 'Baixo',
          category: categories[item.symbol] || 'Outro',
          score: Math.min(99, Math.max(65, 75 + Math.floor(pct * 1.5))),
        };
      });

      return NextResponse.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify(picks),
            },
          },
        ],
      });
    }

    // 2. Signal Generation Prompt
    if (userMessage.includes('forneça um sinal de trading') || (userMessage.includes('Símbolo:') && userMessage.includes('Preço Atual:'))) {
      const symbolMatch = userMessage.match(/Símbolo:\s*([A-Z0-9]+)/i);
      const priceMatch = userMessage.match(/Preço Atual:\s*\$?([0-9.]+)/i);
      const changeMatch = userMessage.match(/Variação 24h:\s*([0-9.-]+)%?/i);
      
      const symbol = symbolMatch ? symbolMatch[1] : 'BTCUSDT';
      const price = priceMatch ? parseFloat(priceMatch[1]) : 60000;
      const pct = changeMatch ? parseFloat(changeMatch[1]) : 0;
      
      const action = pct > 2 ? 'BUY' : pct < -2 ? 'SELL' : 'HOLD';
      const confidence = Math.min(0.95, Math.max(0.5, 0.7 + Math.abs(pct) * 0.05));
      const stopLoss = action === 'BUY' ? price * 0.97 : action === 'SELL' ? price * 1.03 : price;
      const takeProfit = action === 'BUY' ? price * 1.06 : action === 'SELL' ? price * 0.94 : price;
      
      const reasoning = action === 'BUY'
        ? `Sinal de COMPRA acionado para ${symbol} com alta de ${pct.toFixed(2)}% nas últimas 24h. O momentum técnico indica continuação do movimento ascendente.`
        : action === 'SELL'
        ? `Sinal de VENDA detectado para ${symbol} devido à pressão vendedora recente de ${pct.toFixed(2)}%. Recomenda-se cautela ou proteção de capital.`
        : `Aguardando confirmação de tendência em ${symbol}. O preço consolida em faixas estreitas com volume moderado.`;
      
      const signal = {
        action,
        confidence: parseFloat(confidence.toFixed(2)),
        reasoning,
        stopLoss: parseFloat(stopLoss.toFixed(4)),
        takeProfit: parseFloat(takeProfit.toFixed(4)),
      };

      return NextResponse.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify(signal),
            },
          },
        ],
      });
    }

    // 3. SL/TP reasoning prompt
    if (userMessage.includes('Explique em 1-2 frases') && userMessage.includes('calculated')) {
      const recMatch = userMessage.match(/Recomendação:\s*([A-Z]+)/i);
      const rec = recMatch ? recMatch[1] : 'COMPRA';
      const explanation = rec === 'COMPRA'
        ? `Os níveis de Stop Loss foram definidos logo abaixo do suporte principal identificado e da banda inferior de Bollinger, minimizando perdas potenciais. O Take Profit visa a zona de resistência mais próxima respeitando uma ótima relação de Risco/Recompensa.`
        : `Os níveis de Stop Loss encontram-se acima da resistência recente com proteção baseada em ATR. O Take Profit está posicionado nas proximidades do suporte imediato para otimizar a saída da posição curta.`;
      
      return NextResponse.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: explanation,
            },
          },
        ],
      });
    }

    // 4. Default AI Chatbot response
    let reply = `Olá! Sou o assistente Crypto IA Pro.
Com base nos dados atuais do mercado cripto, a tendência geral é de alta moderada para os principais criptoativos (BTC, ETH, SOL).
Aconselho prudência e utilização de ordens de Stop Loss.
🎯 Entrada Recomendada: Preço atual de mercado
🛑 Stop Loss Sugerido: -2.5% abaixo da entrada
✅ Take Profit Sugerido: +6.5% acima da entrada`;

    if (userMessage.toLowerCase().includes('btc') || userMessage.toLowerCase().includes('bitcoin')) {
      reply = `Bitcoin (BTC) apresenta consolidação em torno do patamar atual com suporte forte de compradores. O sentimento macro é positivo com fluxo contínuo para ETFs spot.
🎯 Entrada: Mercado | 🛑 Stop Loss: -2.0% | ✅ Take Profit: +5.0%`;
    } else if (userMessage.toLowerCase().includes('eth') || userMessage.toLowerCase().includes('ethereum')) {
      reply = `Ethereum (ETH) mostra força relativa impulsionado pela atividade de DeFi e taxas de rede moderadas.
🎯 Entrada: Mercado | 🛑 Stop Loss: -2.3% | ✅ Take Profit: +6.0%`;
    } else if (userMessage.toLowerCase().includes('sol') || userMessage.toLowerCase().includes('solana')) {
      reply = `Solana (SOL) demonstra alta volatilidade e forte momentum de volume impulsionado pela especulação de memecoins e alta throughput da rede.
🎯 Entrada: Mercado | 🛑 Stop Loss: -3.5% | ✅ Take Profit: +10.0%`;
    }

    return NextResponse.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: reply,
          },
        },
      ],
    });

  } catch (error: any) {
    console.error("Mock ZAI Completions Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
