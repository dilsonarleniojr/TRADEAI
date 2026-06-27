import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const totalEvents = await prisma.newsEvent.count();
    const totalArticles = await prisma.newsArticle.count();
    
    const events = await prisma.newsEvent.findMany({
      select: {
        confidenceScore: true,
        status: true,
      }
    });

    const avgConfidence = events.length > 0
      ? events.reduce((sum, e) => sum + e.confidenceScore, 0) / events.length
      : 0.0;

    const statusCounts = events.reduce((acc: Record<string, number>, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        totalEvents,
        totalArticles,
        avgConfidence: parseFloat(avgConfidence.toFixed(4)),
        statusCounts,
      }
    });
  } catch (error: any) {
    console.error("Failed to fetch news metrics:", error.message);
    return NextResponse.json(
      { success: false, error: "Database query failed" },
      { status: 500 }
    );
  }
}
