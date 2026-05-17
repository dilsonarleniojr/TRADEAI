import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/trades - Get all trades
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const symbol = searchParams.get('symbol');

    const trades = await db.trade.findMany({
      where: symbol ? { symbol } : undefined,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: trades,
    });
  } catch (error: any) {
    console.error('[Trades API] GET error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/trades - Create a new trade
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, side, price, quantity, total, strategy, mode, pnl } = body;

    if (!symbol || !side || !price || !quantity) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const trade = await db.trade.create({
      data: {
        symbol,
        side,
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        total: parseFloat(total) || parseFloat(price) * parseFloat(quantity),
        strategy: strategy || 'Manual',
        mode: mode || 'paper',
        pnl: parseFloat(pnl) || 0,
      },
    });

    return NextResponse.json({
      success: true,
      data: trade,
    });
  } catch (error: any) {
    console.error('[Trades API] POST error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/trades - Clear all trades
export async function DELETE() {
  try {
    await db.trade.deleteMany({});

    return NextResponse.json({
      success: true,
      message: 'All trades cleared',
    });
  } catch (error: any) {
    console.error('[Trades API] DELETE error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
