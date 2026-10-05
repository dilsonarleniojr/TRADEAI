import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBinanceCredentials } from '@/lib/binance-session';
import crypto from 'crypto';

const BINANCE_SERVICE = 'http://localhost:3001';

interface PositionCalc {
  symbol: string;
  quantity: number;
  avgPrice: number;
  totalCost: number;
  realizedPnl: number;
}

interface PositionOut {
  symbol: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  /** false quando não há histórico de compra no app (preço médio desconhecido). */
  costKnown: boolean;
}

// Posições abaixo deste valor (poeira de taxas/arredondamento) não aparecem na lista, mas entram no total.
const DUST_USD = 0.5;

async function fetchBinanceAccount(apiKey: string, apiSecret: string, testnet: boolean) {
  if (!apiKey || !apiSecret) {
    throw new Error("API Key or Secret missing.");
  }

  const timestamp = Date.now();
  // omitZeroBalances: devolve só os ativos com saldo
  const queryString = `omitZeroBalances=true&timestamp=${timestamp}&recvWindow=60000`;
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
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/** Preço de todos os pares: microserviço local; se falhar, direto da Binance. */
async function fetchAllPrices(testnet: boolean): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  try {
    const res = await fetch(`${BINANCE_SERVICE}/api/market/ticker`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const result = await res.json();
      if (Array.isArray(result.data)) {
        for (const item of result.data) prices[item.symbol] = parseFloat(item.lastPrice);
      }
    }
  } catch (err: any) {
    console.warn('[Account API] Ticker do microserviço falhou:', err.message);
  }
  if (Object.keys(prices).length === 0) {
    try {
      const base = testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
      const res = await fetch(`${base}/api/v3/ticker/price`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (res.ok) {
        const list: { symbol: string; price: string }[] = await res.json();
        for (const item of list) prices[item.symbol] = parseFloat(item.price);
      }
    } catch (err: any) {
      console.warn('[Account API] Ticker direto da Binance falhou:', err.message);
    }
  }
  return prices;
}

/** Preço médio e PnL realizado por par a partir dos trades salvos de um modo (live ou paper). */
function buildCostBasis(trades: { symbol: string; side: string; quantity: number; price: number }[]) {
  const map: Record<string, PositionCalc> = {};
  for (const trade of trades) {
    const pos = (map[trade.symbol] ??= { symbol: trade.symbol, quantity: 0, avgPrice: 0, totalCost: 0, realizedPnl: 0 });
    if (trade.side === "BUY") {
      pos.quantity += trade.quantity;
      pos.totalCost += trade.quantity * trade.price;
      pos.avgPrice = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
    } else if (trade.side === "SELL") {
      pos.realizedPnl += trade.quantity * (trade.price - pos.avgPrice);
      pos.quantity -= trade.quantity;
      pos.totalCost = pos.quantity * pos.avgPrice;
      if (pos.quantity <= 0) {
        pos.quantity = 0;
        pos.totalCost = 0;
        pos.avgPrice = 0;
      }
    }
  }
  return map;
}

/** Valor em USDT de um ativo da carteira. Trata Simple Earn ("LDxxx") como o ativo de origem. */
function priceAsset(asset: string, prices: Record<string, number>): { symbol: string; price: number } | null {
  if (asset === 'USDT') return { symbol: 'USDT', price: 1 };
  const direct = prices[`${asset}USDT`];
  if (direct) return { symbol: `${asset}USDT`, price: direct };
  if (asset.startsWith('LD') && asset.length > 2) {
    const base = asset.slice(2);
    if (base === 'USDT') return { symbol: 'USDT', price: 1 };
    const p = prices[`${base}USDT`];
    if (p) return { symbol: `${base}USDT`, price: p };
  }
  const inverse = prices[`USDT${asset}`]; // ex.: USDTBRL
  if (inverse) return { symbol: `USDT${asset}`, price: 1 / inverse };
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('mode') === 'live' ? 'live' : 'paper';

    // Credenciais vêm da sessão criptografada no servidor (nunca de headers do cliente)
    const { apiKey: binanceApiKey, apiSecret: binanceApiSecret, testnet: isTestnet } = getBinanceCredentials(request);

    if (mode === 'live') {
      return NextResponse.json({
        success: true,
        data: await buildLiveAccount(binanceApiKey || '', binanceApiSecret || '', isTestnet),
      });
    }

    return NextResponse.json({ success: true, data: await buildPaperAccount() });
  } catch (error: any) {
    console.error('[Account API] GET error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Modo real: a carteira da Binance é a fonte da verdade (todas as moedas com saldo).
 * Os trades salvos no app servem só para o preço médio e o PnL realizado.
 */
async function buildLiveAccount(apiKey: string, apiSecret: string, testnet: boolean) {
  let binanceAcc: any;
  try {
    binanceAcc = await fetchBinanceAccount(apiKey, apiSecret, testnet);
  } catch (err: any) {
    console.error('[Account API] Failed to fetch real Binance account balance:', err.message);
    throw new Error(`Conexão Binance falhou: ${err.message}`);
  }

  const [prices, liveTrades, stored] = await Promise.all([
    fetchAllPrices(testnet),
    db.trade.findMany({ where: { mode: 'live' }, orderBy: { timestamp: 'asc' } }),
    db.account.findFirst(),
  ]);
  const basis = buildCostBasis(liveTrades);

  let cashBalance = 0;
  let cashFree = 0;
  const positions: PositionOut[] = [];
  const unpriced: string[] = [];
  let dustValue = 0;

  for (const b of binanceAcc.balances as { asset: string; free: string; locked: string }[]) {
    const quantity = parseFloat(b.free) + parseFloat(b.locked);
    if (!(quantity > 0)) continue;

    if (b.asset === 'USDT') {
      cashBalance = quantity;
      cashFree = parseFloat(b.free);
      continue;
    }

    const priced = priceAsset(b.asset, prices);
    if (!priced) {
      unpriced.push(b.asset);
      continue;
    }

    const marketValue = quantity * priced.price;
    const cost = basis[priced.symbol];
    const costKnown = !!cost && cost.avgPrice > 0;
    const avgPrice = costKnown ? cost.avgPrice : priced.price;
    const pos: PositionOut = {
      symbol: priced.symbol === 'USDT' ? `${b.asset}` : priced.symbol,
      quantity,
      avgPrice,
      marketPrice: priced.price,
      marketValue,
      unrealizedPnl: costKnown ? quantity * (priced.price - avgPrice) : 0,
      realizedPnl: cost?.realizedPnl ?? 0,
      costKnown,
    };
    if (marketValue < DUST_USD) dustValue += marketValue;
    else positions.push(pos);
  }

  positions.sort((x, y) => y.marketValue - x.marketValue);

  const assetBalance = positions.reduce((sum, p) => sum + p.marketValue, 0) + dustValue;
  const totalValue = cashBalance + assetBalance;
  // PnL realizado inclui pares já encerrados (que não aparecem mais na carteira).
  const realizedPnl = Object.values(basis).reduce((sum, p) => sum + p.realizedPnl, 0);
  const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const pnl = realizedPnl + unrealizedPnl;
  const invested = totalValue - pnl;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

  // Compatibilidade com telas antigas que mostram "a moeda principal".
  const symbol = stored?.symbol || 'BTCUSDT';
  const assetQuantity = positions.find((p) => p.symbol === symbol)?.quantity ?? 0;

  return {
    id: 'user-account',
    userId: 'binance_live_user',
    symbol,
    cashBalance,
    cashFree,
    assetQuantity,
    assetBalance,
    positions,
    totalValue,
    realizedPnl,
    unrealizedPnl,
    pnl,
    pnlPercent,
    dustValue,
    unpricedAssets: unpriced,
    source: testnet ? 'binance-testnet' : 'binance',
    syncedAt: Date.now(),
  };
}

/** Modo simulado: saldo da tabela Account e posições dos trades simulados. */
async function buildPaperAccount() {
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
      if (!account) throw createError;
    }
  }

  const [paperTrades, prices] = await Promise.all([
    db.trade.findMany({ where: { mode: 'paper' }, orderBy: { timestamp: 'asc' } }),
    fetchAllPrices(false),
  ]);
  const positionsMap = buildCostBasis(paperTrades);

  const activePrice = prices[account.symbol] ?? paperTrades.filter((t) => t.symbol === account!.symbol).pop()?.price ?? 0;

  // A quantidade da moeda principal vem da tabela Account.
  if (account.assetQuantity > 0 && !positionsMap[account.symbol]) {
    positionsMap[account.symbol] = {
      symbol: account.symbol,
      quantity: account.assetQuantity,
      avgPrice: activePrice,
      totalCost: account.assetQuantity * activePrice,
      realizedPnl: 0,
    };
  }
  if (positionsMap[account.symbol]) {
    positionsMap[account.symbol].quantity = account.assetQuantity;
    positionsMap[account.symbol].totalCost = account.assetQuantity * positionsMap[account.symbol].avgPrice;
  }

  let realizedPnl = 0;
  let unrealizedPnl = 0;
  const positions = Object.values(positionsMap)
    .map((p) => {
      realizedPnl += p.realizedPnl;
      if (p.quantity <= 0) return null;
      const marketPrice = prices[p.symbol] || p.avgPrice;
      const uPnl = p.quantity * (marketPrice - p.avgPrice);
      unrealizedPnl += uPnl;
      return {
        symbol: p.symbol,
        quantity: p.quantity,
        avgPrice: p.avgPrice,
        marketPrice,
        marketValue: p.quantity * marketPrice,
        unrealizedPnl: uPnl,
        realizedPnl: p.realizedPnl,
        costKnown: true,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const assetBalance = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalValue = account.cashBalance + assetBalance;
  const initialBalance = 10000.0;
  const pnl = totalValue - initialBalance;

  return {
    ...account,
    assetBalance,
    positions,
    totalValue,
    realizedPnl,
    unrealizedPnl,
    pnl,
    pnlPercent: (pnl / initialBalance) * 100,
    source: 'paper',
    syncedAt: Date.now(),
  };
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

