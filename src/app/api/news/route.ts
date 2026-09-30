import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_USER = "user_demo_123";

export async function GET() {
  try {
    // 1. Fetch user preferences for personalized recommendation
    let prefs = await prisma.userPreference.findUnique({
      where: { id: DEFAULT_USER },
    });

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
    const events = await prisma.newsEvent.findMany({
      include: {
        articles: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 3. Score and rank events based on user preferences (Personalization & Explainability)
    const rankedEvents = events.map((ev) => {
      const isPreferred = preferredThemes.includes(ev.category);
      
      // Relevance Explanation
      let relevanceExplain = "Recomendado com base na relevância factual geral";
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

    // Sort: preferred categories first, then by confidenceScore desc, then by createdAt desc
    rankedEvents.sort((a, b) => {
      if (a.isPreferred && !b.isPreferred) return -1;
      if (!a.isPreferred && b.isPreferred) return 1;
      
      // Secondary sort: confidenceScore desc
      if (b.confidenceScore !== a.confidenceScore) {
        return b.confidenceScore - a.confidenceScore;
      }
      
      // Tertiary sort: createdAt
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
