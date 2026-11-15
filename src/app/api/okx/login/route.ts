import { NextResponse } from "next/server";
import {
  clearOkxSession,
  readOkxSession,
  setOkxSession,
} from "@/lib/okx/okx-session";
import { fetchOkxAccount } from "@/lib/okx/okx-client";
import { isSameOrigin } from "@/lib/binance-session";
import { guardApiRequest } from "@/lib/auth/request-guard";

// Estado da conexão para o cliente restaurar a UI após recarregar: nunca devolve as chaves.
export async function GET(request: Request) {
  const session = readOkxSession(request);
  const hasEnvCredentials = !!(
    process.env.OKX_API_KEY?.trim() &&
    process.env.OKX_API_SECRET?.trim() &&
    process.env.OKX_PASSPHRASE?.trim()
  );
  return NextResponse.json({
    success: true,
    connected: !!session || hasEnvCredentials,
    simulated: session?.simulated ?? (process.env.OKX_SIMULATED === "true" || process.env.APP_ENV !== "production"),
  });
}

// Remove a sessão (desconectar).
export async function DELETE(request: Request) {
  const blocked = guardApiRequest(request);
  if (blocked) return blocked;

  const res = NextResponse.json({ success: true, message: "OKX desconectada com sucesso." });
  clearOkxSession(res, request);
  return res;
}

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, {
    rateLimit: { limit: 10, windowMs: 60_000, scope: "okx-login" },
  });
  if (blocked) return blocked;

  try {
    const { apiKey, apiSecret, passphrase, simulated } = await request.json();

    if (!apiKey || !apiSecret || !passphrase) {
      return NextResponse.json(
        { success: false, error: "Chave API, Segredo e Passphrase são obrigatórios na OKX." },
        { status: 400 }
      );
    }

    const creds = {
      apiKey: String(apiKey).trim(),
      apiSecret: String(apiSecret).trim(),
      passphrase: String(passphrase).trim(),
      simulated: !!simulated,
    };

    // Testa a autenticação conectando ao endpoint de balance da OKX
    await fetchOkxAccount(creds);

    const res = NextResponse.json({
      success: true,
      message: "Conexão com a OKX estabelecida com sucesso!",
      simulated: creds.simulated,
    });

    // As chaves são guardadas apenas no servidor em cookie httpOnly criptografado
    setOkxSession(res, creds, request);
    return res;
  } catch (error: any) {
    console.error("[OKX Login API] Erro:", error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Falha ao autenticar com a OKX. Verifique suas credenciais.",
      },
      { status: 400 }
    );
  }
}

