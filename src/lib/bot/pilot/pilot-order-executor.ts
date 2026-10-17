import crypto from 'crypto';
import { EnvironmentCleanupService } from './environment-cleanup-service';
import { PreciseMath } from './precise-math';
import { ExchangeMetadataService, SymbolFilters } from './exchange-metadata-service';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface LiveOrderExecutionResult {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  status: string;
  executedQty: number;
  cummulativeQuoteQty: number;
  avgPrice: number;
  transactTime: number;
}

export class PilotOrderExecutor {
  private static instance: PilotOrderExecutor;
  private cleanupService = EnvironmentCleanupService.getInstance();
  private metadataService = ExchangeMetadataService.getInstance();

  private constructor() {}

  public static getInstance(): PilotOrderExecutor {
    if (!PilotOrderExecutor.instance) {
      PilotOrderExecutor.instance = new PilotOrderExecutor();
    }
    return PilotOrderExecutor.instance;
  }

  /**
   * Executa ordem de COMPRA imediata no mercado Spot da Binance
   */
  public async executeLiveBuy(params: {
    symbol: string;
    notionalUsd: number;
    suggestedQty?: number;
    filters: SymbolFilters;
    credentials: BinanceCredentials;
  }): Promise<LiveOrderExecutionResult> {
    const { symbol, notionalUsd, suggestedQty, filters, credentials } = params;
    const { apiKey, apiSecret, testnet = false } = credentials;

    if (!apiKey || !apiSecret) {
      throw new Error('Chaves da API da Binance não encontradas ou inválidas para execução real.');
    }

    const baseUrl = testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';

    // 1. Sincronizar relógio com a Binance
    await this.cleanupService.syncServerTime(baseUrl);
    const timestamp = this.cleanupService.getSynchronizedTimestamp();

    // 2. Verificar saldo livre da moeda de cotação (USDT)
    const quoteAsset = filters.quoteAsset || 'USDT';
    const freeQuote = await this.fetchFreeAssetBalance(quoteAsset, apiKey, apiSecret, baseUrl, timestamp);

    if (freeQuote < notionalUsd) {
      throw new Error(
        `Saldo livre insuficiente na Carteira Spot da Binance: você possui $${freeQuote.toFixed(2)} ${quoteAsset}, mas a operação direta requer $${notionalUsd.toFixed(2)} ${quoteAsset}. Verifique se seus fundos estão na Carteira Spot (Fiat & Spot) e não em 'Fundos' ou 'Earn'.`
      );
    }

    // 3. Montar payload de compra a mercado (MARKET quoteOrderQty)
    const cleanQuoteSpend = notionalUsd.toFixed(2);
    let queryString = `symbol=${symbol}&side=BUY&type=MARKET&quoteOrderQty=${cleanQuoteSpend}&timestamp=${timestamp}&recvWindow=10000`;

    const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
    const url = `${baseUrl}/api/v3/order?${queryString}&signature=${signature}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const j = JSON.parse(errText);
        if (j.code === -2010) {
          msg = `Saldo insuficiente na Carteira Spot da Binance (-2010).`;
        } else if (j.code === -1013) {
          msg = `Filtro de valor nocional violado (-1013): ${j.msg}.`;
        } else if (j.code === -1021) {
          msg = `Descompasso de relógio com a Binance (-1021). Tente novamente em instantes.`;
        } else if (j.code === -2015) {
          msg = `Chave de API inválida, IP não autorizado ou permissão 'Enable Spot & Margin Trading' desativada.`;
        } else {
          msg = j.msg || errText;
        }
      } catch {}
      throw new Error(`[Binance Live Buy Error] ${msg}`);
    }

    const orderData = await res.json();
    const executedQty = parseFloat(orderData.executedQty) || 0;
    const cummulativeQuoteQty = parseFloat(orderData.cummulativeQuoteQty) || notionalUsd;
    const avgPrice = executedQty > 0 ? cummulativeQuoteQty / executedQty : 0;

    return {
      orderId: orderData.orderId,
      clientOrderId: orderData.clientOrderId,
      symbol: orderData.symbol,
      side: 'BUY',
      status: orderData.status,
      executedQty,
      cummulativeQuoteQty,
      avgPrice,
      transactTime: orderData.transactTime || Date.now(),
    };
  }

  /**
   * Executa ordem de VENDA para liquidação da posição na Binance Spot
   */
  public async executeLiveSell(params: {
    symbol: string;
    baseAsset: string;
    quantity: number;
    filters: SymbolFilters;
    credentials: BinanceCredentials;
  }): Promise<LiveOrderExecutionResult> {
    const { symbol, baseAsset, quantity, filters, credentials } = params;
    const { apiKey, apiSecret, testnet = false } = credentials;

    if (!apiKey || !apiSecret) {
      throw new Error('Chaves da API da Binance não encontradas ou inválidas para execução real.');
    }

    const baseUrl = testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';

    // 1. Sincronizar relógio
    await this.cleanupService.syncServerTime(baseUrl);
    const timestamp = this.cleanupService.getSynchronizedTimestamp();

    // 2. Consultar o saldo livre real do ativo base (ZEC, BTC, SOL...) na carteira Spot
    const freeBase = await this.fetchFreeAssetBalance(baseAsset, apiKey, apiSecret, baseUrl, timestamp);
    
    // Vende no máximo o saldo livre disponível na Binance Spot
    const rawQtyToSell = Math.min(quantity, freeBase);
    const cleanQty = PreciseMath.quantizeLotDown(rawQtyToSell, filters.stepSize);

    if (cleanQty <= 0) {
      throw new Error(`Saldo livre de ${baseAsset} na Binance Spot é zero ou insuficiente para envio de ordem.`);
    }

    const precision = PreciseMath.countDecimals(filters.stepSize);
    const qtyString = cleanQty.toFixed(precision);

    const queryString = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${qtyString}&timestamp=${timestamp}&recvWindow=10000`;
    const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
    const url = `${baseUrl}/api/v3/order?${queryString}&signature=${signature}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const j = JSON.parse(errText);
        msg = j.msg || errText;
      } catch {}
      throw new Error(`[Binance Live Sell Error] ${msg}`);
    }

    const orderData = await res.json();
    const executedQty = parseFloat(orderData.executedQty) || cleanQty;
    const cummulativeQuoteQty = parseFloat(orderData.cummulativeQuoteQty) || 0;
    const avgPrice = executedQty > 0 ? cummulativeQuoteQty / executedQty : 0;

    return {
      orderId: orderData.orderId,
      clientOrderId: orderData.clientOrderId,
      symbol: orderData.symbol,
      side: 'SELL',
      status: orderData.status,
      executedQty,
      cummulativeQuoteQty,
      avgPrice,
      transactTime: orderData.transactTime || Date.now(),
    };
  }

  /**
   * Consulta o saldo livre de um ativo específico na carteira Spot
   */
  private async fetchFreeAssetBalance(
    asset: string,
    apiKey: string,
    apiSecret: string,
    baseUrl: string,
    timestamp: number
  ): Promise<number> {
    try {
      const query = `omitZeroBalances=true&timestamp=${timestamp}&recvWindow=10000`;
      const sig = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
      const res = await fetch(`${baseUrl}/api/v3/account?${query}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        const b = data.balances?.find((item: any) => item.asset === asset);
        return b ? parseFloat(b.free) : 0;
      }
    } catch (e: any) {
      console.warn(`[PilotOrderExecutor] Falha ao consultar saldo de ${asset}:`, e.message);
    }
    return 0;
  }
}
