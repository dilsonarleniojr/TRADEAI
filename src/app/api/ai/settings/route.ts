import { NextRequest, NextResponse } from "next/server";
import { getPublicSettings, updateSettings, type SettingsUpdate } from "@/lib/ai/settings";
import { isProviderId } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

/** Motor ativo e situação de cada provedor. Nunca devolve chaves. */
export async function GET() {
  return NextResponse.json({ success: true, data: getPublicSettings() });
}

/** Body: { provider?, target?, model?, apiKey?, clearKey? } */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const update: SettingsUpdate = {};
  if (body.provider !== undefined) {
    if (!isProviderId(body.provider)) return NextResponse.json({ error: "provider inválido" }, { status: 400 });
    update.provider = body.provider;
  }
  if (body.target !== undefined) {
    if (!isProviderId(body.target)) return NextResponse.json({ error: "target inválido" }, { status: 400 });
    update.target = body.target;
  }
  if (body.model !== undefined) {
    if (typeof body.model !== "string" || body.model.length > 120 || /\s/.test(body.model.trim())) {
      return NextResponse.json({ error: "Nome de modelo inválido" }, { status: 400 });
    }
    update.model = body.model;
  }
  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== "string" || body.apiKey.length > 500) {
      return NextResponse.json({ error: "Chave inválida" }, { status: 400 });
    }
    update.apiKey = body.apiKey;
  }
  if (body.clearKey === true) update.clearKey = true;

  try {
    updateSettings(update);
  } catch (e: any) {
    // Ex.: produção sem SESSION_SECRET não consegue cifrar a chave.
    return NextResponse.json({ error: "Não foi possível salvar", details: e?.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: getPublicSettings() });
}
