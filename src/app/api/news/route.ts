import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchWithSWR } from "@/lib/cache/swr-cache";

const DEFAULT_USER = "user_demo_123";

async function fetchLiveRssNews() {
  try {
    const { data } = await fetchWithSWR(
      "cointelegraph_rss",
      async () => {
        const res = await fetch("https://cointelegraph.com/rss", {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return [];
        const xml = await res.text();

    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const content = match[1];
      const titleMatch = content.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkMatch = content.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
      const descMatch = content.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
      const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

      const title = titleMatch ? titleMatch[1].trim() : "Notícia Cripto";
      const link = linkMatch ? linkMatch[1].trim() : "#";
      const rawDesc = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";
      const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString();

      let category = "Market";
      if (title.toLowerCase().includes("defi") || title.toLowerCase().includes("aave")) category = "DeFi";
      else if (title.toLowerCase().includes("sec") || title.toLowerCase().includes("law") || title.toLowerCase().includes("fed")) category = "Regulation";
      else if (title.toLowerCase().includes("tech") || title.toLowerCase().includes("layer")) category = "Tech";

      items.push({
        id: `rss-${items.length}-${Date.now()}`,
        title,
        summary: rawDesc.slice(0, 200) + (rawDesc.length > 200 ? "..." : ""),
        category,
        confidenceScore: 0.95,
        status: "PUBLISHED",
        createdAt: pubDate,
        articles: [
          {
            id: `art-${items.length}`,
            sourceName: "Cointelegraph",
            sourceUrl: link,
            url: link,
          },
        ],
        relevanceExplain: "Feed jornalístico real em tempo real via CoinTelegraph RSS",
      });
    }

        return items;
      },
      60 * 1000 // 60 segundos TTL
    );
    return data;
  } catch (err: any) {
    console.warn("[NewsAPI] Erro ao buscar RSS ao vivo:", err.message);
    return [];
  }
}

export async function GET() {
  try {
    // 1. Fetch user preferences
    let prefs = await db.userPreference.findUnique({
      where: { id: DEFAULT_USER },
    }).catch(() => null);

    if (!prefs) {
      prefs = {
        id: DEFAULT_USER,
        lang: "pt-BR",
        themes: "Market,Regulation",
        preferredHour: "09:00",
        createdAt: new Date(),
      };
    }

    const preferredThemes = prefs.themes ? prefs.themes.split(",") : [];

    // 2. Fetch events from database
    let events = await db.newsEvent.findMany({
      include: {
        articles: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    }).catch(() => []);

    // 3. Se o banco estiver vazio, recorre diretamente ao feed RSS real ao vivo da CoinTelegraph
    if (!events || events.length === 0) {
      events = await fetchLiveRssNews();
    }

    // 4. Score and rank events based on user preferences
    const rankedEvents = events.map((ev: any) => {
      const isPreferred = preferredThemes.includes(ev.category);
      let relevanceExplain = ev.relevanceExplain || "Recomendado com base na relevância factual geral";
      if (isPreferred) {
        relevanceExplain = `Recomendado pelo seu interesse no tema: ${ev.category}`;
      } else if (ev.confidenceScore >= 0.85) {
        relevanceExplain = "Notícia com alto consenso e confiabilidade factual";
      }

      return {
        ...ev,
        isPreferred,
        relevanceExplain,
      };
    });

    return NextResponse.json({
      success: true,
      data: rankedEvents,
    });
  } catch (error: any) {
    console.error("Failed to fetch news events:", error.message);
    return NextResponse.json(
      { success: false, error: "Database query failed" },
      { status: 500 }
    );
  }
}
