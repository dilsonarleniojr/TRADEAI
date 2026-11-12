import { NextRequest, NextResponse } from "next/server";
import { AIUnavailableError, testAIProvider } from "@/lib/ai-client";
import { getActiveProvider, getModel } from "@/lib/ai/settings";
import { isProviderId } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

/** POST { provider? } → testa conectividade real e latência do motor de IA selecionado. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const requested = body && typeof body === "object" ? body.provider : undefined;
  const provider = requested ?? getActiveProvider();

  if (!isProviderId(provider)) {
    return NextResponse.json(
      { success: false, error: "Provedor de IA inválido." },
      { status: 400 }
    );
  }

  try {
    const result = await testAIProvider(provider);
    return NextResponse.json({
      success: true,
      provider,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Falha desconhecida ao testar provedor de IA.";
    return NextResponse.json(
      {
        success: false,
        provider,
        model: getModel(provider),
        error: message,
      },
      { status: err instanceof AIUnavailableError ? 200 : 500 }
    );
  }
}

