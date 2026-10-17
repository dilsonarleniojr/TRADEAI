import { NextRequest, NextResponse } from 'next/server';
import { DirectOperationManager } from '@/lib/bot/pilot/direct-operation-manager';
import { getBinanceCredentials } from '@/lib/binance-session';
import { db } from '@/lib/db';

function sanitizeSession(session: any) {
  if (!session) return session;
  const { credentials, ...safe } = session;
  return safe;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, reason, exitPrice } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID da sessão é obrigatório.' },
        { status: 400 }
      );
    }

    const credentials = getBinanceCredentials(req);

    const session = await DirectOperationManager.closeOperation(
      id,
      reason || 'MANUAL_CLOSE',
      exitPrice ? parseFloat(exitPrice) : undefined,
      credentials
    );

    // Registro no banco Prisma com transação resiliente
    try {
      await db.$transaction(async (tx) => {
        // Criar registro de trade
        await tx.trade.create({
          data: {
            id: session.id,
            symbol: session.symbol,
            side: 'BUY',
            price: session.entryPrice,
            quantity: session.quantity,
            total: session.notionalUsd,
            strategy: 'DIRECT_AI_OPERATION',
            mode: session.mode,
            pnl: session.realizedPnlUsd ?? 0,
          },
        });

        // Atualizar saldo da conta
        let account = await tx.account.findFirst();
        if (account) {
          const newBalance = Math.max(0, account.cashBalance + (session.realizedPnlUsd ?? 0));
          await tx.account.update({
            where: { id: account.id },
            data: { cashBalance: newBalance },
          });
        }
      });
    } catch (dbErr) {
      console.warn('[DirectOperation] Aviso ao persistir no DB Prisma:', dbErr);
    }

    return NextResponse.json({
      success: true,
      data: sanitizeSession(session),
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation/close] Erro ao encerrar sessão:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao encerrar a operação direta.' },
      { status: 500 }
    );
  }
}
