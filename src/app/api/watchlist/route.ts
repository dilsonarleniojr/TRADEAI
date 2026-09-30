import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/watchlist - Get watchlist
export async function GET() {
  try {
    const items = await db.watchlistItem.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: items.map(item => item.symbol),
    });
  } catch (error: any) {
    console.error('[Watchlist API] GET error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/watchlist - Add symbol to watchlist
export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    const item = await db.watchlistItem.upsert({
      where: { symbol },
      create: { symbol },
      update: {},
    });

    return NextResponse.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    console.error('[Watchlist API] POST error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/watchlist - Remove symbol from watchlist
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    await db.watchlistItem.delete({
      where: { symbol },
    });

    return NextResponse.json({
      success: true,
      message: `${symbol} removed from watchlist`,
    });
  } catch (error: any) {
    console.error('[Watchlist API] DELETE error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
