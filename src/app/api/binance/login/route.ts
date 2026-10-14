import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  clearBinanceSession,
  isSameOrigin,
  readBinanceSession,
  setBinanceSession,
} from '@/lib/binance-session';

// Estado da conexão para o cliente restaurar a UI após recarregar: nunca devolve as chaves.
export async function GET(request: Request) {
  const session = readBinanceSession(request);
  const hasEnvCredentials = !!(process.env.BINANCE_API_KEY?.trim() && process.env.BINANCE_API_SECRET?.trim());
  return NextResponse.json({
    success: true,
    connected: !!session || hasEnvCredentials,
    testnet: session?.testnet ?? (process.env.APP_ENV !== 'production'),
  });
}

// Remove a sessão (desconectar).
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Origem não permitida.' }, { status: 403 });
  }
  const res = NextResponse.json({ success: true });
  clearBinanceSession(res);
  return res;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Origem não permitida.' }, { status: 403 });
  }

  try {
    const { apiKey, apiSecret, testnet } = await request.json();

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, error: 'Chave API e Segredo são obrigatórios.' },
        { status: 400 }
      );
    }

    // Usar o endpoint correto da Binance (Testnet Sandbox vs Produção Spot)
    const baseUrl = testnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';

    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}&recvWindow=60000`;
    
    // Criar a assinatura HMAC-SHA256
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const url = `${baseUrl}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const res = NextResponse.json({
        success: true,
        message: 'Login na Binance realizado com sucesso!',
        accountType: data.accountType,
        canTrade: data.canTrade,
        permissions: data.permissions || [],
        testnet: !!testnet,
      });
      // As chaves são guardadas apenas no servidor, em cookie httpOnly criptografado
      setBinanceSession(res, { apiKey: String(apiKey), apiSecret: String(apiSecret), testnet: !!testnet });
      return res;
    } else {
      const errData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          success: false, 
          error: errData.msg || 'Chaves inválidas ou sem permissão para ler dados da conta.' 
        },
        { status: response.status }
      );
    }
  } catch (error: any) {
    console.error('[Binance Login API] Erro:', error.message);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno ao tentar autenticar com a Binance.', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}
