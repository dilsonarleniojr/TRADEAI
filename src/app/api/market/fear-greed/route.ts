import { NextResponse } from "next/server";
import { fetchWithSWR } from "@/lib/cache/swr-cache";

export async function GET() {
  try {
    const { data } = await fetchWithSWR(
      "fear_greed_official",
      async () => {
        const res = await fetch("https://api.alternative.me/fng/?limit=7", {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data || [];
      },
      15 * 60 * 1000 // 15 minutos de TTL
    );

    return NextResponse.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.warn("[FearGreedAPI] Erro ao buscar índice oficial:", err.message);
    return NextResponse.json({ success: false, data: [] }, { status: 502 });
  }
}
