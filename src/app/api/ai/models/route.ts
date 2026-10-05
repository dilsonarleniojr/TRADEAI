import { NextRequest, NextResponse } from "next/server";
import { AIUnavailableError, listModels } from "@/lib/ai-client";
import { isProviderId } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

/** GET ?provider=claude|openai|gemini|qwen → modelos disponíveis na conta. */
export async function GET(request: NextRequest) {
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "provider inválido" }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, models: await listModels(provider) });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: e instanceof AIUnavailableError ? 200 : 500 }
    );
  }
}
