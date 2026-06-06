import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    let account = await db.account.findFirst();
    if (!account) {
      try {
        account = await db.account.create({
          data: {
            id: "user-account",
            userId: "binance_live_user",
            cashBalance: 10000.0,
            assetQuantity: 0.0,
            symbol: "BTCUSDT",
          },
        });
      } catch (createError: any) {
        console.warn('[Account API] Concurrency conflict during account creation, refetching:', createError.message);
        account = await db.account.findFirst();
        if (!account) {
          throw createError;
        }
      }
    }
    return NextResponse.json({
      success: true,
      data: {
        ...account,
        positions: [{ symbol: account.symbol, quantity: account.assetQuantity }],
      },
    });
  } catch (error: any) {
    console.error('[Account API] GET error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cashBalance, assetQuantity, symbol } = body;

    const account = await db.account.upsert({
      where: { id: "user-account" },
      update: {
        cashBalance: cashBalance !== undefined ? parseFloat(cashBalance) : undefined,
        assetQuantity: assetQuantity !== undefined ? parseFloat(assetQuantity) : undefined,
        symbol: symbol !== undefined ? symbol : undefined,
      },
      create: {
        id: "user-account",
        userId: "binance_live_user",
        cashBalance: cashBalance !== undefined ? parseFloat(cashBalance) : 10000.0,
        assetQuantity: assetQuantity !== undefined ? parseFloat(assetQuantity) : 0.0,
        symbol: symbol !== undefined ? symbol : "BTCUSDT",
      },
    });

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error: any) {
    console.error('[Account API] POST error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const account = await db.account.upsert({
      where: { id: "user-account" },
      update: {
        cashBalance: 10000.0,
        assetQuantity: 0.0,
        symbol: "BTCUSDT",
      },
      create: {
        id: "user-account",
        userId: "binance_live_user",
        cashBalance: 10000.0,
        assetQuantity: 0.0,
        symbol: "BTCUSDT",
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Account reset successfully',
      data: account,
    });
  } catch (error: any) {
    console.error('[Account API] DELETE error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
