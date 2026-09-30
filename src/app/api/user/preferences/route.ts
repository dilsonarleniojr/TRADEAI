import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_USER = "user_demo_123";

export async function GET() {
  try {
    let prefs = await prisma.userPreference.findUnique({
      where: { id: DEFAULT_USER },
    });

    if (!prefs) {
      prefs = await prisma.userPreference.create({
        data: {
          id: DEFAULT_USER,
          lang: "pt-BR",
          themes: "Market,Regulation",
          preferredHour: "09:00",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: prefs,
    });
  } catch (error: any) {
    console.error("Failed to fetch preferences:", error.message);
    return NextResponse.json(
      { success: false, error: "Database query failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lang, themes, preferredHour } = body;

    const prefs = await prisma.userPreference.upsert({
      where: { id: DEFAULT_USER },
      update: {
        lang: lang ?? "pt-BR",
        themes: themes ?? "Market,Regulation",
        preferredHour: preferredHour ?? "09:00",
      },
      create: {
        id: DEFAULT_USER,
        lang: lang ?? "pt-BR",
        themes: themes ?? "Market,Regulation",
        preferredHour: preferredHour ?? "09:00",
      },
    });

    return NextResponse.json({
      success: true,
      data: prefs,
    });
  } catch (error: any) {
    console.error("Failed to update preferences:", error.message);
    return NextResponse.json(
      { success: false, error: "Failed to update database" },
      { status: 500 }
    );
  }
}
