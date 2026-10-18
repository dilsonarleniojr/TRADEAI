import { NextRequest, NextResponse } from 'next/server';
import { DirectOperationManager } from '@/lib/bot/pilot/direct-operation-manager';
import { getBinanceCredentials } from '@/lib/binance-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const credentials = getBinanceCredentials(req);
    if (!credentials || !credentials.apiKey || !credentials.apiSecret) {
      return NextResponse.json(
        { success: false, error: 'Credenciais da Binance necessárias para reconciliar ordens.' },
        { status: 401 }
      );
    }

    const result = await DirectOperationManager.reconcileOrphanOrders(credentials);
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation/reconcile] Erro na reconciliação:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao reconciliar ordens órfãs.' },
      { status: 500 }
    );
  }
}
