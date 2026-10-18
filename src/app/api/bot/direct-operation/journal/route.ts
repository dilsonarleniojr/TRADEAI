import { NextRequest, NextResponse } from 'next/server';
import { DirectOperationManager } from '@/lib/bot/pilot/direct-operation-manager';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const journal = DirectOperationManager.getTradeJournal();

    return NextResponse.json({
      success: true,
      data: {
        totalEntries: journal.length,
        journal,
      },
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation/journal] Erro ao buscar diário de trades:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao buscar diário de operações.' },
      { status: 500 }
    );
  }
}
