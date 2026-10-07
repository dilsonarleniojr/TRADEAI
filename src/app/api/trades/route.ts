import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBinanceCredentials } from '@/lib/binance-session';
import { isRateLimited } from '@/lib/rate-limit';
import crypto from 'crypto';

// Limites de segurança para ordens em dinheiro real (em USDT). Configuráveis por variável de ambiente.
const MAX_ORDER_USD = Number(process.env.MAX_LIVE_ORDER_USD) || 500;
const MAX_DAILY_BUY_USD = Number(process.env.MAX_LIVE_DAILY_USD) || 2000;

// Preço de referência buscado pelo servidor na Binance: o preço enviado pelo navegador não é confiável.
async function fetchReferencePrice(symbol: string, testnet: boolean): Promise<number | null> {
  const baseUrl = testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
  try {
    const res = await fetch(`${baseUrl}/api/v3/ticker/price?symbol=${symbol}`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = parseFloat(data.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Executa requisição HTTP com backoff exponencial para lidar com HTTP 429 e 5xx da Binance
 */
async function fetchBinanceWithBackoff(url: string, init?: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  let delayMs = 300;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        attempt++;
        if (attempt >= maxRetries) return response;
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delayMs;
        console.warn(`[Binance API] HTTP ${response.status} detectado. Aguardando ${waitMs}ms para retry (${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, waitMs));
        delayMs *= 2;
        continue;
      }
      return response;
    } catch (err: any) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }
  return fetch(url, init);
}

async function executeBinanceOrder(
  symbol: string,
  side: string,
  quantity: number,
  apiKey: string,
  apiSecret: string,
  testnet: boolean,
  totalVal?: number,
  sellAll?: boolean
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
    const infoRes = await fetchBinanceWithBackoff(`${baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`);
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
    const priceRes = await fetchBinanceWithBackoff(`${baseUrl}/api/v3/ticker/price?symbol=${symbol}`);
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
    // 1. Verificar saldo Spot livre da moeda de cotação (ex: USDT) na Binance
    const quoteAsset = symbol.endsWith("USDT") ? "USDT" : symbol.endsWith("USDC") ? "USDC" : "USDT";
    let freeQuote = -1;
    let lockedQuote = 0;
    try {
      const accQuery = `omitZeroBalances=true&timestamp=${Date.now()}&recvWindow=60000`;
      const accSig = crypto.createHmac('sha256', apiSecret).update(accQuery).digest('hex');
      const accRes = await fetchBinanceWithBackoff(`${baseUrl}/api/v3/account?${accQuery}&signature=${accSig}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });
      if (accRes.ok) {
        const accData = await accRes.json();
        const qBal = accData.balances?.find((b: any) => b.asset === quoteAsset);
        if (qBal) {
          freeQuote = parseFloat(qBal.free) || 0;
          lockedQuote = parseFloat(qBal.locked) || 0;
        } else {
          // Quando omitZeroBalances=true omite a moeda, o saldo é 0
          freeQuote = 0;
          lockedQuote = 0;
        }
      } else {
        const errText = await accRes.text().catch(() => '');
        console.warn('[Trades API] Pre-buy account check failed:', accRes.status, errText);
      }
    } catch (e: any) {
      console.warn('[Trades API] Pre-buy account check warning:', e.message);
    }

    const desiredTotal = totalVal || (currentPrice > 0 ? quantity * currentPrice : 10.0);
    let finalSpend = Math.max(minNotional * 1.05, desiredTotal);

    // Se conseguimos ler o saldo Spot da Binance:
    if (freeQuote >= 0) {
      if (freeQuote < minNotional) {
        if (lockedQuote > 0 && freeQuote + lockedQuote >= minNotional) {
          throw new Error(
            `Saldo livre de ${quoteAsset} na Carteira Spot da Binance é de $${freeQuote.toFixed(2)} ($${lockedQuote.toFixed(2)} está travado em ordens abertas). Cancele ordens em aberto na Binance para liberar margem.`
          );
        }
        throw new Error(
          `Saldo livre na Carteira Spot da Binance é de apenas $${freeQuote.toFixed(2)} ${quoteAsset}, inferior ao mínimo para compra ($${minNotional.toFixed(2)} ${quoteAsset}). Se você possui USDT na Binance, certifique-se de transferi-los da Carteira de 'Fundos' (Funding) ou 'Earn/Ganhos' para a Carteira 'Spot'.`
        );
      }

      // IMPORTANTE: Deixar sempre margem de segurança (mínimo 2%) para taxas e buffer de oscilação a mercado da Binance
      const maxSpendable = parseFloat((freeQuote * 0.98).toFixed(2));
      if (finalSpend > maxSpendable) {
        finalSpend = Math.min(finalSpend, maxSpendable);
      }

      if (finalSpend > freeQuote) {
        throw new Error(
          `Saldo insuficiente na Binance: a ordem requer $${finalSpend.toFixed(2)} ${quoteAsset}, mas seu saldo livre na Carteira Spot é de $${freeQuote.toFixed(2)} ${quoteAsset}.`
        );
      }
      if (finalSpend < minNotional) {
        throw new Error(
          `O valor disponível para esta ordem ($${finalSpend.toFixed(2)} ${quoteAsset}) é inferior ao lote mínimo exigido pela Binance ($${minNotional.toFixed(2)} ${quoteAsset}).`
        );
      }
    }

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
      const accQuery = `omitZeroBalances=true&timestamp=${Date.now()}&recvWindow=60000`;
      const accSig = crypto.createHmac('sha256', apiSecret).update(accQuery).digest('hex');
      const accRes = await fetchBinanceWithBackoff(`${baseUrl}/api/v3/account?${accQuery}&signature=${accSig}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });
      if (accRes.ok) {
        const accData = await accRes.json();
        const assetBal = accData.balances?.find((b: any) => b.asset === baseAsset);
        const freeQty = assetBal ? parseFloat(assetBal.free) : 0;
        
        if (freeQty <= 0) {
          const err: any = new Error(`Você não possui saldo de ${baseAsset} na sua conta da Binance para vender no mercado Spot.`);
          err.code = "NO_BALANCE";
          throw err;
        }

        const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
        const maxSellable = Math.floor(freeQty / stepSize) * stepSize;

        // Se sellAll for solicitado ou se a quantidade for >= 80% do saldo, vende TODO o montante livre na Binance
        const isFullClose = Boolean(sellAll) || quantity >= maxSellable * 0.8;
        const qtyTarget = isFullClose ? maxSellable : Math.min(quantity, maxSellable);
        const qtyClean = parseFloat(qtyTarget.toFixed(precision));

        if (currentPrice > 0 && qtyClean * currentPrice < minNotional) {
          const err: any = new Error(
            `O valor da sua posição de ${baseAsset} ($${(qtyClean * currentPrice).toFixed(2)} USDT) é inferior ao mínimo exigido pela Binance ($${minNotional} USDT).`
          );
          err.code = "MIN_NOTIONAL_DUST";
          err.residualUsdt = qtyClean * currentPrice;
          err.baseAsset = baseAsset;
          throw err;
        }

        queryString = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${qtyClean}&timestamp=${timestamp}&recvWindow=60000`;
      }
    } catch (accErr: any) {
      if (accErr.code === "NO_BALANCE" || accErr.code === "MIN_NOTIONAL_DUST" || accErr.message.includes("inferior ao mínimo")) {
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

  const response = await fetchBinanceWithBackoff(url, {
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
        errorMsg = "Saldo insuficiente na Carteira Spot da Binance. Na Binance, o saldo para robôs precisa estar na Carteira 'Spot' (Fiat e Spot). Se seus USDT estiverem na Carteira de 'Fundos' (Funding) ou no 'Simple Earn' (Ganhos), faça uma transferência interna gratuita para a Carteira 'Spot' na Binance.";
      } else if (errJson.code === -1013) {
        errorMsg = `Ordem rejeitada pela Binance: ${errJson.msg || 'Filtro NOTIONAL ou LOT_SIZE violado'}. O valor mínimo por ordem é $${minNotional} USDT.`;
      } else if (errJson.code === -2015) {
        errorMsg = "Chave API da Binance inválida, IP não autorizado ou permissão 'Enable Spot & Margin Trading' desativada na Binance. Verifique se o IP 168.121.98.202 está cadastrado na lista de IPs confiáveis da Binance.";
      } else {
        errorMsg = errJson.msg || errorText;
      }
    } catch {}
    throw new Error(`Erro na API da Binance: ${errorMsg}`);
  }

  return await response.json();
}

// GET /api/trades - Get all trades (com suporte a filtro por modo e símbolo)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const symbol = searchParams.get('symbol');
    const mode = searchParams.get('mode'); // 'paper' | 'live'

    const where: any = {};
    if (symbol) where.symbol = symbol;
    if (mode && (mode === 'paper' || mode === 'live')) where.mode = mode;

    const trades = await db.trade.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
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

    if (!symbolClean || symbolClean.length < 5 || (!symbolClean.endsWith("USDT") && !symbolClean.endsWith("FDUSD") && !symbolClean.endsWith("BTC") && !symbolClean.endsWith("BRL"))) {
      return NextResponse.json(
        {
          success: false,
          error: `Símbolo de negociação inválido: "${symbolClean}". Apenas pares oficiais (ex.: BTCUSDT, ETHUSDT) são aceitos.`,
          code: "INVALID_SYMBOL",
        },
        { status: 400 }
      );
    }

    const strategyClean = (strategy || "Manual").replace(/[<>]/g, "");
    const modeClean = mode === "live" ? "live" : "paper";

    // Verificação de Slippage Universal (Tanto Paper quanto Live com dados reais da Binance)
    const refPrice = await fetchReferencePrice(symbolClean, false);
    if (refPrice !== null) {
      const calculatedSlippage = Math.abs(priceVal - refPrice) / refPrice;
      const maxSlippageTolerance = typeof body.slippageTolerance === 'number'
        ? body.slippageTolerance / 100
        : typeof body.riskParams?.slippageTolerancePercent === 'number'
        ? body.riskParams.slippageTolerancePercent / 100
        : 0.0075; // 0.75% de tolerância máxima padrão

      if (calculatedSlippage > maxSlippageTolerance) {
        return NextResponse.json(
          {
            success: false,
            error: `Slippage excessivo detectado (${(calculatedSlippage * 100).toFixed(2)}%). Limite máximo de tolerância é ${(maxSlippageTolerance * 100).toFixed(2)}%. Preço da ordem: $${priceVal}, Preço atual da Binance: $${refPrice}. Ordem rejeitada por governança de risco.`,
            code: 'SLIPPAGE_EXCEEDED',
          },
          { status: 400 }
        );
      }
    }

    // If live mode, run trade order on Binance first
    if (modeClean === "live") {
      const { apiKey: binanceApiKey, apiSecret: binanceApiSecret, testnet: isTestnet } = getBinanceCredentials(request);

      // Trava de risco só vale para dinheiro real (testnet é fictícia).
      // Usa o maior entre o total informado, preço × quantidade e o preço atual do servidor × quantidade.
      if (!isTestnet) {
        // Falha fechada: sem preço de referência do servidor, a ordem não passa pela trava.
        if (refPrice === null) {
          return NextResponse.json(
            {
              success: false,
              error: 'Não foi possível obter o preço atual na Binance para validar os limites. Tente novamente.',
              code: 'PRICE_UNAVAILABLE',
            },
            { status: 503 }
          );
        }
        const notional = Math.max(totalVal, priceVal * qtyVal, refPrice * qtyVal);

        if (notional > MAX_ORDER_USD) {
          return NextResponse.json(
            {
              success: false,
              error: `Ordem de ${notional.toFixed(2)} USDT excede o limite por ordem de ${MAX_ORDER_USD} USDT.`,
              code: 'ORDER_LIMIT_EXCEEDED',
            },
            { status: 400 }
          );
        }

        if (sideClean === 'BUY') {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const spent = await db.trade.aggregate({
            _sum: { total: true },
            where: { mode: 'live', side: 'BUY', timestamp: { gte: startOfDay } },
          });
          const spentToday = spent._sum.total || 0;
          if (spentToday + notional > MAX_DAILY_BUY_USD) {
            return NextResponse.json(
              {
                success: false,
                error: `Limite diário de compras (${MAX_DAILY_BUY_USD} USDT) seria excedido. Já usado hoje: ${spentToday.toFixed(2)} USDT.`,
                code: 'DAILY_LIMIT_EXCEEDED',
              },
              { status: 400 }
            );
          }
        }
      }

      try {
        const binanceOrderResult = await executeBinanceOrder(
          symbolClean,
          sideClean,
          qtyVal,
          binanceApiKey || '',
          binanceApiSecret || '',
          isTestnet,
          totalVal,
          Boolean(body.sellAll)
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
          {
            success: false,
            error: err.message,
            code: err.code || 'BINANCE_EXEC_ERROR',
            residualUsdt: err.residualUsdt,
            baseAsset: err.baseAsset,
          },
          { status: 400 }
        );
      }
    }

    // Use Prisma transaction to ensure atomic updates
    const result = await db.$transaction(async (tx) => {
      // 1. Create the trade
      const trade = await tx.trade.create({
        data: {
          id: body.executionId || body.id || undefined,
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

    const auditTrade = {
      ...result.trade,
      executionId: body.executionId || result.trade.id,
      algorithmVersion: body.algorithmVersion || "v2.5.0-institutional",
      marketSnapshot: body.marketSnapshot,
      riskParams: body.riskParams,
      slippagePercent: body.slippagePercent,
    };

    return NextResponse.json({
      success: true,
      data: auditTrade,
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

// DELETE /api/trades - Clear trades and reset balance (supports ?mode=paper, ?mode=live or all)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'paper' | 'live' | undefined ('all')

    const whereClause: any = {};
    if (mode === 'paper' || mode === 'live') {
      whereClause.mode = mode;
    }

    const updatedAccount = await db.$transaction(async (tx) => {
      // 1. Deleta trades de acordo com o modo solicitado
      await tx.trade.deleteMany({
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      });

      // 2. Se a limpeza foi do modo simulado (paper) ou geral (all), reseta o saldo virtual da Account
      if (!mode || mode === 'paper' || mode === 'all') {
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
      }

      // Se foi apenas live, mantém o registro de Account
      return await tx.account.findFirst();
    });

    try {
      const { io } = await import('socket.io-client');
      const socket = io('http://localhost:3002', {
        transports: ['websocket'],
        reconnection: false,
        timeout: 2000,
      });
      socket.on('connect', () => {
        if (updatedAccount) {
          socket.emit('balance-update', {
            cashBalance: updatedAccount.cashBalance,
            assetQuantity: updatedAccount.assetQuantity,
            symbol: updatedAccount.symbol,
          });
        }
        socket.emit('telemetry:event', {
          type: 'trades-cleared',
          timestamp: new Date().toISOString(),
          payload: { mode: mode || 'all' },
        });
        socket.disconnect();
      });
      socket.on('connect_error', () => {
        socket.close();
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: mode === 'paper' 
        ? 'Dados do modo simulado limpos com sucesso'
        : mode === 'live'
        ? 'Histórico do modo real limpo com sucesso'
        : 'Todos os trades limpos e saldo redefinido',
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
