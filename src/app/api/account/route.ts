import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const BINANCE_SERVICE = 'http://localhost:3001';

interface PositionCalc {
  symbol: string;
  quantity: number;
  avgPrice: number;
  totalCost: number;
  realizedPnl: number;
}

import crypto from 'crypto';

async function fetchBinanceAccount(apiKey: string, apiSecret: string, testnet: boolean) {
  if (!apiKey || !apiSecret) {
    throw new Error("API Key or Secret missing.");
  }

  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=60000`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');

  const baseUrl = testnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';

  const url = `${baseUrl}/api/v3/account?${queryString}&signature=${signature}`;
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('mode') || 'paper';
    
    // Extract headers for Binance API
    const binanceApiKey = request.headers.get('x-binance-api-key') || process.env.BINANCE_API_KEY?.replace(/['"]/g, '');
    const binanceApiSecret = request.headers.get('x-binance-api-secret') || process.env.BINANCE_API_SECRET?.replace(/['"]/g, '');
    const binanceTestnetStr = request.headers.get('x-binance-testnet');
    const isTestnet = binanceTestnetStr ? binanceTestnetStr === 'true' : (process.env.APP_ENV !== 'production');

    // 1. Fetch or create default account in a transaction
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

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // If live mode, fetch real balance from Binance and override
    if (mode === 'live') {
      try {
        const binanceAcc = await fetchBinanceAccount(binanceApiKey || '', binanceApiSecret || '', isTestnet);
        const usdtBalance = binanceAcc.balances.find((b: any) => b.asset === 'USDT');
        const cashBalance = usdtBalance ? parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked) : 0.0;
        
        const activeSymbol = account?.symbol || 'BTCUSDT';
        const baseAsset = activeSymbol.replace('USDT', '');
        const assetObj = binanceAcc.balances.find((b: any) => b.asset === baseAsset);
        const assetQuantity = assetObj ? parseFloat(assetObj.free) + parseFloat(assetObj.locked) : 0.0;
        
        // In-memory only — DO NOT persist to DB (would overwrite paper account)
        account = {
          id: "user-account",
          userId: "binance_live_user",
          cashBalance,
          assetQuantity,
          symbol: activeSymbol,
        } as any;
      } catch (err: any) {
        console.error('[Account API] Failed to fetch real Binance account balance:', err.message);
        throw new Error(`Conexão Binance falhou: ${err.message}`);
      }
    }

    // 2. Fetch all trades to calculate average price, positions, and realized PnL
    const trades = await db.trade.findMany({
      orderBy: { timestamp: 'asc' },
    });

    const positionsMap: Record<string, PositionCalc> = {};

    for (const trade of trades) {
      const sym = trade.symbol;
      if (!positionsMap[sym]) {
        positionsMap[sym] = {
          symbol: sym,
          quantity: 0,
          avgPrice: 0,
          totalCost: 0,
          realizedPnl: 0,
        };
      }
      const pos = positionsMap[sym];
      if (trade.side === "BUY") {
        pos.quantity += trade.quantity;
        pos.totalCost += trade.quantity * trade.price;
        pos.avgPrice = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
      } else if (trade.side === "SELL") {
        const tradePnl = trade.quantity * (trade.price - pos.avgPrice);
        pos.realizedPnl += tradePnl;
        pos.quantity -= trade.quantity;
        pos.totalCost = pos.quantity * pos.avgPrice;
        if (pos.quantity <= 0) {
          pos.quantity = 0;
          pos.totalCost = 0;
          pos.avgPrice = 0;
        }
      }
    }

    // 3. Fetch ticker prices from Binance microservice
    const tickerPrices: Record<string, number> = {};
    try {
      const tickerRes = await fetch(`${BINANCE_SERVICE}/api/market/ticker`, {
        signal: AbortSignal.timeout(2000),
      });
      if (tickerRes.ok) {
        const result = await tickerRes.json();
        if (Array.isArray(result.data)) {
          for (const item of result.data) {
            tickerPrices[item.symbol] = parseFloat(item.lastPrice);
          }
        }
      }
    } catch (err: any) {
      console.warn('[Account API] Ticker fetch failed, using fallback:', err.message);
    }

    // Ensure active symbol has price
    let activePrice = tickerPrices[account.symbol];
    if (activePrice === undefined) {
      try {
        const priceRes = await fetch(`${BINANCE_SERVICE}/api/market/price?symbol=${account.symbol}`, {
          signal: AbortSignal.timeout(1000),
        });
        if (priceRes.ok) {
          const result = await priceRes.json();
          activePrice = parseFloat(result.data.price);
        }
      } catch (err: any) {
        console.warn(`[Account API] Price fetch failed for ${account.symbol}:`, err.message);
      }
    }
    if (activePrice === undefined) {
      const lastTrade = trades.filter(t => t.symbol === account!.symbol).pop();
      activePrice = lastTrade ? lastTrade.price : 0;
    }
    tickerPrices[account.symbol] = activePrice;

    // 4. Calculate realized, unrealized PnL, and positions list
    let totalRealizedPnl = 0;
    let totalUnrealizedPnl = 0;
    
    // Ensure the main account symbol is included even if no trades exist yet
    if (account.assetQuantity > 0 && !positionsMap[account.symbol]) {
      positionsMap[account.symbol] = {
        symbol: account.symbol,
        quantity: account.assetQuantity,
        avgPrice: activePrice, // assume current price if no history
        totalCost: account.assetQuantity * activePrice,
        realizedPnl: 0,
      };
    }

    // Sync quantities in positionsMap with the Account table for the active symbol
    if (positionsMap[account.symbol]) {
      positionsMap[account.symbol].quantity = account.assetQuantity;
      positionsMap[account.symbol].totalCost = account.assetQuantity * positionsMap[account.symbol].avgPrice;
    }

    const positionsList = Object.values(positionsMap)
      .filter(p => p.quantity > 0)
      .map(p => {
        const mPrice = tickerPrices[p.symbol] || p.avgPrice;
        const mValue = p.quantity * mPrice;
        const uPnl = p.quantity * (mPrice - p.avgPrice);
        
        totalRealizedPnl += p.realizedPnl;
        totalUnrealizedPnl += uPnl;

        return {
          symbol: p.symbol,
          quantity: p.quantity,
          avgPrice: p.avgPrice,
          marketPrice: mPrice,
          marketValue: mValue,
          unrealizedPnl: uPnl,
          realizedPnl: p.realizedPnl,
        };
      });

    // Compute portfolio valuations
    const totalAssetValue = positionsList.reduce((sum, p) => sum + p.marketValue, 0);
    const totalValue = account.cashBalance + totalAssetValue;
    // In live mode, PnL is relative to actual balance (no simulated initial)
    const initialBalance = mode === 'live' ? totalValue : 10000.0;
    const pnl = totalValue - initialBalance;
    const pnlPercent = initialBalance > 0 ? (pnl / initialBalance) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        ...account,
        positions: positionsList,
        totalValue,
        realizedPnl: totalRealizedPnl,
        unrealizedPnl: totalUnrealizedPnl,
        pnl,
        pnlPercent,
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

    const account = await db.$transaction(async (tx) => {
      return await tx.account.upsert({
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
    const account = await db.$transaction(async (tx) => {
      return await tx.account.upsert({
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

