import { NextRequest, NextResponse } from 'next/server';
import { DirectOperationManager } from '@/lib/bot/pilot/direct-operation-manager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || undefined;

    const events = DirectOperationManager.getSpoofingEvents(symbol);

    return NextResponse.json({
      success: true,
      data: {
        total: events.length,
        events,
      },
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation/spoofing-events] Erro:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao buscar eventos de spoofing.' },
      { status: 500 }
    );
  }
}
