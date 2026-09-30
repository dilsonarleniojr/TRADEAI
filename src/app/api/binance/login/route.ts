import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
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
      return NextResponse.json({
        success: true,
        message: 'Login na Binance realizado com sucesso!',
        accountType: data.accountType,
        canTrade: data.canTrade,
        permissions: data.permissions || [],
      });
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
