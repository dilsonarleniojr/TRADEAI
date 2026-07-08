import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRateLimited } from '@/lib/rate-limit';
import crypto from 'crypto';

async function executeBinanceOrder(
  symbol: string,
  side: string,
  quantity: number,
  apiKey: string,
  apiSecret: string,
  testnet: boolean
) {
  if (!apiKey || !apiSecret) {
    throw new Error("Chave de API ou segredo da Binance não configurados para Live Trading.");
  }

  // 1. Get step size precision for symbol to round quantity
  let stepSize = 0.00001; // default fallback
  const baseUrl = testnet
    ? 'https://testnet.binance.vision'
    : 'https://api.binance.com';

  try {
    const infoRes = await fetch(`${baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`);
    if (infoRes.ok) {
      const info = await infoRes.json();
      const symbolInfo = info.symbols?.[0];
      const lotFilter = symbolInfo?.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
      if (lotFilter) {
        stepSize = parseFloat(lotFilter.stepSize);
      }
    }
  } catch (err: any) {
    console.warn('[Trades API] Failed to fetch symbol precision:', err.message);
  }

  // Round quantity to stepSize precision
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const qtyClean = parseFloat(quantity.toFixed(precision));

  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${qtyClean}&timestamp=${timestamp}&recvWindow=60000`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');

  const url = `${baseUrl}/api/v3/order?${queryString}&signature=${signature}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = errorText;
    try {
      const errJson = JSON.parse(errorText);
      errorMsg = errJson.msg || errorText;
    } catch {}
    throw new Error(`Erro na API da Binance: ${errorMsg}`);
  }

  return await response.json();
}

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
    let priceVal = parseFloat(price);
    let qtyVal = parseFloat(quantity);
    let totalVal = parseFloat(total) || priceVal * qtyVal;
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

    // If live mode, run trade order on Binance first
    if (modeClean === "live") {
      const binanceApiKey = request.headers.get('x-binance-api-key') || process.env.BINANCE_API_KEY?.replace(/['"]/g, '');
      const binanceApiSecret = request.headers.get('x-binance-api-secret') || process.env.BINANCE_API_SECRET?.replace(/['"]/g, '');
      const binanceTestnetStr = request.headers.get('x-binance-testnet');
      const isTestnet = binanceTestnetStr ? binanceTestnetStr === 'true' : true;

      try {
        const binanceOrderResult = await executeBinanceOrder(
          symbolClean,
          sideClean,
          qtyVal,
          binanceApiKey || '',
          binanceApiSecret || '',
          isTestnet
        );
        // Extract real quantity and executed price if available
        if (binanceOrderResult) {
          const executedQty = parseFloat(binanceOrderResult.executedQty) || qtyVal;
          const cummulativeQuoteQty = parseFloat(binanceOrderResult.cummulativeQuoteQty) || totalVal;
          qtyVal = executedQty;
          totalVal = cummulativeQuoteQty;
          priceVal = qtyVal > 0 ? cummulativeQuoteQty / qtyVal : priceVal;
        }
      } catch (err: any) {
        console.error('[Trades API] Live trade execution failed:', err.message);
        return NextResponse.json(
          { success: false, error: err.message },
          { status: 400 }
        );
      }
    }

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
