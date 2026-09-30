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
  testnet: boolean,
  totalVal?: number
) {
  if (!apiKey || !apiSecret) {
    throw new Error("Chave de API ou segredo da Binance não configurados para Live Trading.");
  }

  const baseUrl = testnet
    ? 'https://testnet.binance.vision'
    : 'https://api.binance.com';

  // 1. Fetch symbol exchange filters (LOT_SIZE, NOTIONAL)
  let stepSize = 0.00001;
  let minQty = 0.00001;
  let minNotional = 5.0;
  let quoteOrderQtyAllowed = true;

  try {
    const infoRes = await fetch(`${baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`);
    if (infoRes.ok) {
      const info = await infoRes.json();
      const symbolInfo = info.symbols?.[0];
      if (symbolInfo) {
        quoteOrderQtyAllowed = !!symbolInfo.quoteOrderQtyMarketAllowed;
        const lotFilter = symbolInfo.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
        if (lotFilter) {
          stepSize = parseFloat(lotFilter.stepSize) || stepSize;
          minQty = parseFloat(lotFilter.minQty) || minQty;
        }
        const notionalFilter = symbolInfo.filters?.find(
          (f: any) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL'
        );
        if (notionalFilter) {
          minNotional = parseFloat(notionalFilter.minNotional) || 5.0;
        }
      }
    }
  } catch (err: any) {
    console.warn('[Trades API] Failed to fetch symbol filters:', err.message);
  }

  // 2. Fetch current market price
  let currentPrice = 0;
  try {
    const priceRes = await fetch(`${baseUrl}/api/v3/ticker/price?symbol=${symbol}`);
    if (priceRes.ok) {
      const priceData = await priceRes.json();
      currentPrice = parseFloat(priceData.price) || 0;
    }
  } catch (err: any) {
    console.warn('[Trades API] Failed to fetch ticker price:', err.message);
  }

  let queryString = "";
  const timestamp = Date.now();

  if (side === "BUY") {
    // For MARKET BUY, prefer quoteOrderQty (USDT amount) to naturally satisfy NOTIONAL & LOT_SIZE
    const desiredTotal = totalVal || (currentPrice > 0 ? quantity * currentPrice : 10.0);
    const finalSpend = Math.max(minNotional * 1.05, desiredTotal);

    if (quoteOrderQtyAllowed) {
      const quoteClean = finalSpend.toFixed(2);
      queryString = `symbol=${symbol}&side=BUY&type=MARKET&quoteOrderQty=${quoteClean}&timestamp=${timestamp}&recvWindow=60000`;
    } else {
      // If quoteOrderQty not supported, calculate clean base quantity
      const refPrice = currentPrice > 0 ? currentPrice : (desiredTotal / quantity);
      const safeQty = Math.max(quantity, (minNotional * 1.05) / refPrice);
      const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
      const qtyClean = Math.max(minQty, parseFloat((Math.ceil(safeQty / stepSize) * stepSize).toFixed(precision)));
      queryString = `symbol=${symbol}&side=BUY&type=MARKET&quantity=${qtyClean}&timestamp=${timestamp}&recvWindow=60000`;
    }
  } else {
    // For MARKET SELL: Verify available base asset balance on Binance
    const baseAsset = symbol.replace(/USDT$|BUSD$|USDC$/, "");
    try {
      const accQuery = `timestamp=${Date.now()}&recvWindow=60000`;
      const accSig = crypto.createHmac('sha256', apiSecret).update(accQuery).digest('hex');
      const accRes = await fetch(`${baseUrl}/api/v3/account?${accQuery}&signature=${accSig}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });
      if (accRes.ok) {
        const accData = await accRes.json();
        const assetBal = accData.balances?.find((b: any) => b.asset === baseAsset);
        const freeQty = assetBal ? parseFloat(assetBal.free) : 0;
        
        if (freeQty <= 0) {
          throw new Error(`Você não possui saldo de ${baseAsset} na sua conta da Binance para vender no mercado Spot.`);
        }

        const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
        const maxSellable = Math.floor(freeQty / stepSize) * stepSize;
        const qtyTarget = Math.min(quantity, maxSellable);
        const qtyClean = parseFloat(qtyTarget.toFixed(precision));

        if (currentPrice > 0 && qtyClean * currentPrice < minNotional) {
          throw new Error(
            `O valor da sua posição de ${baseAsset} ($${(qtyClean * currentPrice).toFixed(2)} USDT) é inferior ao mínimo exigido pela Binance ($${minNotional} USDT).`
          );
        }

        queryString = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${qtyClean}&timestamp=${timestamp}&recvWindow=60000`;
      }
    } catch (accErr: any) {
      if (accErr.message.includes("Você não possui saldo") || accErr.message.includes("inferior ao mínimo")) {
        throw accErr;
      }
      console.warn('[Trades API] Account balance check bypassed:', accErr.message);
    }

    if (!queryString) {
      const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
      const qtyClean = parseFloat(quantity.toFixed(precision));
      queryString = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${qtyClean}&timestamp=${timestamp}&recvWindow=60000`;
    }
  }

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
      if (errJson.code === -2010) {
        errorMsg = "Saldo insuficiente na sua conta da Binance para executar a ordem.";
      } else if (errJson.code === -1013) {
        errorMsg = `Ordem rejeitada pela Binance: ${errJson.msg || 'Filtro NOTIONAL ou LOT_SIZE violado'}. O valor mínimo por ordem é $${minNotional} USDT.`;
      } else if (errJson.code === -2015) {
        errorMsg = "Chave API da Binance inválida, IP não autorizado ou permissão 'Enable Spot Trading' desativada na Binance.";
      } else {
        errorMsg = errJson.msg || errorText;
      }
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
      const isTestnet = binanceTestnetStr ? binanceTestnetStr === 'true' : (process.env.APP_ENV !== 'production');

      try {
        const binanceOrderResult = await executeBinanceOrder(
          symbolClean,
          sideClean,
          qtyVal,
          binanceApiKey || '',
          binanceApiSecret || '',
          isTestnet,
          totalVal
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
