import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRateLimited } from '@/lib/rate-limit';

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

// POST /api/trades - Create a new trade and update balance in a transaction
export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting Check
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    if (isRateLimited(ip, 30)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait before executing more trades.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { symbol, side, price, quantity, total, strategy, mode, pnl } = body;

    if (!symbol || !side || !price || !quantity) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 2. Input Sanitization and Validation
    const priceVal = parseFloat(price);
    const qtyVal = parseFloat(quantity);
    const totalVal = parseFloat(total) || priceVal * qtyVal;
    const pnlVal = parseFloat(pnl) || 0;

    if (isNaN(priceVal) || priceVal <= 0 || isNaN(qtyVal) || qtyVal <= 0 || isNaN(totalVal) || totalVal <= 0 || isNaN(pnlVal)) {
      return NextResponse.json(
        { success: false, error: 'Invalid numeric input values for price, quantity, total or pnl' },
        { status: 400 }
      );
    }

    const sideClean = side === "BUY" ? "BUY" : "SELL";
    const symbolClean = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const strategyClean = (strategy || "Manual").replace(/[<>]/g, "");
    const modeClean = mode === "live" ? "live" : "paper";

    // Use Prisma transaction to ensure atomic updates
    const result = await db.$transaction(async (tx) => {
      // 1. Create the trade
      const trade = await tx.trade.create({
        data: {
          symbol: symbolClean,
          side: sideClean,
          price: priceVal,
          quantity: qtyVal,
          total: totalVal,
          strategy: strategyClean,
          mode: modeClean,
          pnl: pnlVal,
        },
      });

      // 2. Fetch current account balance
      let account = await tx.account.findFirst();
      if (!account) {
        account = await tx.account.create({
          data: {
            id: "user-account",
            userId: "binance_live_user",
            cashBalance: 10000.0,
            assetQuantity: 0.0,
            symbol: symbol,
          },
        });
      }

      // 3. Compute new balances
      let newCash = account.cashBalance;
      let newAssetQty = account.assetQuantity;

      if (side === "BUY") {
        newCash -= totalVal;
        newAssetQty += qtyVal;
      } else if (side === "SELL") {
        newCash += totalVal;
        newAssetQty -= qtyVal;
      }

      // Ensure no negative values
      newCash = Math.max(0, newCash);
      newAssetQty = Math.max(0, newAssetQty);

      // 4. Save updated balance
      const updatedAccount = await tx.account.update({
        where: { id: account.id },
        data: {
          cashBalance: newCash,
          assetQuantity: newAssetQty,
          symbol: symbolClean,
        },
      });

      return { trade, account: updatedAccount };
    });

    // Send notifications to Socket.IO in the background
    try {
      const { io } = await import('socket.io-client');
      const socket = io('http://localhost:3002', {
        transports: ['websocket'],
        reconnection: false,
        timeout: 2000,
      });

      socket.on('connect', () => {
        socket.emit('trade-executed', result.trade);
        socket.emit('balance-update', {
          cashBalance: result.account.cashBalance,
          assetQuantity: result.account.assetQuantity,
          symbol: result.account.symbol,
        });
        
        // Emit telemetry event
        socket.emit('telemetry:event', {
          type: 'trade',
          timestamp: new Date().toISOString(),
          payload: {
            tradeId: result.trade.id,
            symbol: result.trade.symbol,
            side: result.trade.side,
            price: result.trade.price,
            quantity: result.trade.quantity,
            total: result.trade.total,
            cashBalance: result.account.cashBalance,
            assetQuantity: result.account.assetQuantity,
          },
        });
        
        socket.disconnect();
      });

      socket.on('connect_error', () => {
        socket.close();
      });
    } catch (ioErr: any) {
      console.warn('[Trades API] Failed to emit Socket.IO notification:', ioErr.message);
    }

    return NextResponse.json({
      success: true,
      data: result.trade,
      account: {
        cashBalance: result.account.cashBalance,
        assetQuantity: result.account.assetQuantity,
        symbol: result.account.symbol,
        positions: [{
          symbol: result.account.symbol,
          quantity: result.account.assetQuantity,
          marketValue: result.account.assetQuantity * priceVal,
        }],
        totalValue: result.account.cashBalance + (result.account.assetQuantity * priceVal),
      },
    });
  } catch (error: any) {
    console.error('[Trades API] POST error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/trades - Clear all trades and reset balance
export async function DELETE() {
  try {
    const updatedAccount = await db.$transaction(async (tx) => {
      await tx.trade.deleteMany({});
      return await tx.account.upsert({
        where: { id: "user-account" },
        update: {
          cashBalance: 10000.0,
          assetQuantity: 0.0,
        },
        create: {
          id: "user-account",
          userId: "binance_live_user",
          cashBalance: 10000.0,
          assetQuantity: 0.0,
        },
      });
    });

    try {
      const { io } = await import('socket.io-client');
      const socket = io('http://localhost:3002', {
        transports: ['websocket'],
        reconnection: false,
        timeout: 2000,
      });
      socket.on('connect', () => {
        socket.emit('balance-update', {
          cashBalance: updatedAccount.cashBalance,
          assetQuantity: updatedAccount.assetQuantity,
          symbol: updatedAccount.symbol,
        });
        socket.disconnect();
      });
      socket.on('connect_error', () => {
        socket.close();
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'All trades cleared and balance reset',
      data: updatedAccount,
    });
  } catch (error: any) {
    console.error('[Trades API] DELETE error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
