import { NextRequest, NextResponse } from 'next/server';
import { DirectOperationManager } from '@/lib/bot/pilot/direct-operation-manager';

function sanitizeSession(session: any) {
  if (!session) return session;
  const { credentials, ...safe } = session;
  return safe;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'O id da sessão é obrigatório para forçar a entrada.' },
        { status: 400 }
      );
    }

    const session = await DirectOperationManager.forceEntry(id);

    return NextResponse.json({
      success: true,
      data: sanitizeSession(session),
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation/force-entry] Erro:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao forçar entrada imediata a mercado.' },
      { status: 500 }
    );
  }
}
