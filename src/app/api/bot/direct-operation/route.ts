import { NextRequest, NextResponse } from 'next/server';
import { DirectOperationManager } from '@/lib/bot/pilot/direct-operation-manager';
import { getBinanceCredentials } from '@/lib/binance-session';

function sanitizeSession(session: any) {
  if (!session) return session;
  const { credentials, ...safe } = session;
  return safe;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { amount, durationMinutes, strategy, mode } = body;

    const parsedAmount = parseFloat(amount);
    const parsedDuration = parseInt(durationMinutes, 10);

    if (isNaN(parsedAmount) || parsedAmount < 11) {
      return NextResponse.json(
        { success: false, error: 'O valor mínimo para operação direta é $11.00 USD.' },
        { status: 400 }
      );
    }

    if (isNaN(parsedDuration) || parsedDuration <= 0) {
      return NextResponse.json(
        { success: false, error: 'Informe uma duração válida em minutos.' },
        { status: 400 }
      );
    }

    const credentials = getBinanceCredentials(req);

    const { session, validation } = await DirectOperationManager.startOperation({
      amount: parsedAmount,
      durationMinutes: parsedDuration,
      strategy: strategy || 'AUTO',
      mode: mode === 'live' ? 'live' : 'paper',
      binanceCredentials: credentials,
    });

    return NextResponse.json({
      success: true,
      data: {
        session: sanitizeSession(session),
        validation,
      },
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation] Erro ao iniciar operação direta:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao processar operação direta com IA.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Parâmetro id da sessão é obrigatório.' },
        { status: 400 }
      );
    }

    const session = await DirectOperationManager.pollSession(id);
    return NextResponse.json({
      success: true,
      data: sanitizeSession(session),
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation] Erro ao consultar sessão:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao consultar status da operação.' },
      { status: 404 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Parâmetro id da sessão é obrigatório.' },
        { status: 400 }
      );
    }

    const session = DirectOperationManager.cancelRadar(id);
    return NextResponse.json({
      success: true,
      data: sanitizeSession(session),
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation] Erro ao cancelar radar:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao cancelar espera no radar.' },
      { status: 500 }
    );
  }
}
