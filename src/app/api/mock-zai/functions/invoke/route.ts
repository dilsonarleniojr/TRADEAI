import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { function_name, arguments: args } = body;

    if (function_name === 'web_search') {
      let results: any[] = [];
      try {
        const events = await prisma.newsEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10
        });

        results = events.map(ev => ({
          title: ev.title,
          name: ev.title,
          snippet: ev.summary || `Relevância factual geral no setor de ${ev.category}. Pontuação de confiança: ${ev.confidenceScore}`,
          url: 'https://tradeai.net/news/' + ev.id
        }));
      } catch (err) {
        console.warn("Mock ZAI invoke web_search DB query failed, using fallback values", err);
      }

      if (results.length === 0) {
        results = [
          {
            title: "Bitcoin Consolidated Above $62K with Strong ETF Inflows",
            name: "Bitcoin Consolidated Above $62K with Strong ETF Inflows",
            snippet: "Bitcoin maintains its base above $62,000 as spot ETFs record net inflows for five consecutive trading days. Analysts expect bullish continuation.",
            url: "https://cryptonews.com/btc"
          },
          {
            title: "Ethereum Gas Fees Drop to Multi-Year Lows Amid Layer 2 Migration",
            name: "Ethereum Gas Fees Drop to Multi-Year Lows Amid Layer 2 Migration",
            snippet: "Average gas fees on Ethereum Mainnet dropped below 5 gwei. L2 networks are capturing 90%+ of transactions, bolstering scalability narratives.",
            url: "https://cryptonews.com/eth"
          },
          {
            title: "Solana DeFi Volume Surpasses Ethereum DEX Activity",
            name: "Solana DeFi Volume Surpasses Ethereum DEX Activity",
            snippet: "Solana decentralized exchange volume hit record highs this week, briefly outpacing Ethereum due to high memecoin trading and low transaction fees.",
            url: "https://cryptonews.com/sol"
          },
          {
            title: "US SEC Set to Approve Options Trading for Spot Bitcoin ETFs",
            name: "US SEC Set to Approve Options Trading for Spot Bitcoin ETFs",
            snippet: "The SEC is expected to greenlight options trading on BTC ETFs, bringing massive institutional liquidity and derivatives hedging to spot holders.",
            url: "https://cryptonews.com/regulation"
          },
          {
            title: "AI Crypto Tokens Rally Led by Fetch.ai and Render Network",
            name: "AI Crypto Tokens Rally Led by Fetch.ai and Render Network",
            snippet: "Artificial intelligence cryptocurrency tokens spiked 15% following hardware announcements and NVIDIA's solid earnings report.",
            url: "https://cryptonews.com/ai"
          }
        ];
      }

      return NextResponse.json({
        result: results
      });
    }

    return NextResponse.json({
      result: []
    });

  } catch (error: any) {
    console.error("Mock ZAI Invoke Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
