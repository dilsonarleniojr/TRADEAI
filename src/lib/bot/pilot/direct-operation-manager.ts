import { MarketOpportunitySelector, EvaluatedOpportunity } from './market-opportunity-selector';
import { ExchangeMetadataService, SymbolFilters } from './exchange-metadata-service';
import { PilotTradeValidator, ValidationResult } from './pilot-trade-validator';
import { EnvironmentCleanupService } from './environment-cleanup-service';
import { CurrencyPairNormalizer } from './currency-pair-normalizer';
import { PreciseMath } from './precise-math';
import { PilotOrderExecutor, BinanceCredentials } from './pilot-order-executor';

export interface DirectOperationSession {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  investedAmountUsd: number;
  durationMinutes: number;
  startTime: number;
  endTime: number;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  quantity: number;
  notionalUsd: number;
  riskUsd: number;
  rewardRiskRatio: number;
  aiScore: number;
  mode: 'live' | 'paper';
  status: 'ACTIVE' | 'CLOSED';
  closeReason?: 'TIME_EXPIRED' | 'TARGET_REACHED' | 'STOP_LOSS' | 'MANUAL_CLOSE';
  currentPrice: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercent: number;
  realizedPnlUsd?: number;
  realizedPnlPercent?: number;
  feeDeductedUsd?: number;
  rationale: string;
  binanceOrderId?: string;
  binanceClientOrderId?: string;
  closeBinanceOrderId?: string;
  executedQuantity?: number;
  credentials?: BinanceCredentials;
}

// Armazenamento em memória de sessões ativas
const activeSessions = new Map<string, DirectOperationSession>();

export class DirectOperationManager {
  /**
   * Inicia uma nova Operação Direta com IA
   */
  public static async startOperation(params: {
    amount: number;
    durationMinutes: number;
    strategy?: string;
    mode?: 'live' | 'paper';
    binanceCredentials?: BinanceCredentials;
  }): Promise<{ session: DirectOperationSession; validation: ValidationResult }> {
    const { amount, durationMinutes, mode = 'paper', binanceCredentials } = params;

    // 1. Validação estrita de valor de investimento
    if (!Number.isFinite(amount) || amount < 11.00) {
      throw new Error('Valor mínimo para operação direta é $11.00 USD para cumprir o MIN_NOTIONAL da Binance com margem de segurança.');
    }
    if (amount > 500.00) {
      throw new Error('Valor máximo por operação direta é de $500.00 USD para preservação de capital.');
    }

    // 2. Sincronização de relógio da exchange e limpeza de travas
    const cleanupService = EnvironmentCleanupService.getInstance();
    await cleanupService.syncServerTime();

    // 3. Seleção inteligente do melhor ativo via IA / microestrutura
    const selector = MarketOpportunitySelector.getInstance();
    const opportunity: EvaluatedOpportunity = await selector.findBestOpportunity(amount);

    // 4. Normalização de convenção de cotação cambial/cripto (ISO 4217 / Interbank)
    const normalized = CurrencyPairNormalizer.normalizeQuote({
      rawSymbol: opportunity.symbol,
      bidPrice: opportunity.marketData.bestBid,
      askPrice: opportunity.marketData.bestAsk,
    });

    if (normalized.isCrossed) {
      throw new Error(`[DirectOperationManager] Livro de ofertas cruzado detectado em ${opportunity.symbol}. Operação abortada.`);
    }

    // 5. Ingestão de filtros de microestrutura (exchangeInfo)
    const metadataService = ExchangeMetadataService.getInstance();
    const filters: SymbolFilters = await metadataService.getSymbolFilters(opportunity.symbol);

    // 6. Dimensionamento proporcional ao valor informado pelo usuário
    const entryPrice = opportunity.signal.suggestedPrice;
    const rawQty = amount / entryPrice;
    const quantizedQty = PreciseMath.quantizeLotDown(rawQty, filters.stepSize);
    const notionalUsd = PreciseMath.roundDown(quantizedQty * entryPrice, 2);

    // 7. Auto-cura e garantia de R:R Líquido >= 1.80x contra atrito de comissões e tickSize
    const minSafeTakeProfit = PilotTradeValidator.calculateTargetTakeProfit(
      opportunity.signal.suggestedPrice,
      opportunity.signal.stopLoss,
      1.80,
      filters
    );
    if (opportunity.signal.takeProfit < minSafeTakeProfit) {
      opportunity.signal.takeProfit = minSafeTakeProfit;
    }

    // 8. Validação de risco através do PilotTradeValidator
    const validator = PilotTradeValidator.getInstance();
    const validation = await validator.validateSignal(
      opportunity.signal,
      amount,
      false,
      filters
    );

    if (!validation.valid || !validation.order) {
      throw new Error(`[DirectOperationManager] Falha na validação de risco: ${validation.rejectionReason}`);
    }

    let finalEntryPrice = entryPrice;
    let finalQty = quantizedQty;
    let finalNotional = notionalUsd;
    let binanceOrderId: string | undefined;
    let binanceClientOrderId: string | undefined;
    let executedQty: number | undefined;

    // 9. Se for modo REAL (live), executa a compra a mercado imediatamente na Binance Spot
    if (mode === 'live') {
      if (!binanceCredentials || !binanceCredentials.apiKey || !binanceCredentials.apiSecret) {
        throw new Error('Chaves da API da Binance não encontradas ou inválidas para o modo Real.');
      }

      const orderExecutor = PilotOrderExecutor.getInstance();
      const liveBuyResult = await orderExecutor.executeLiveBuy({
        symbol: opportunity.symbol,
        notionalUsd,
        suggestedQty: quantizedQty,
        filters,
        credentials: binanceCredentials,
      });

      binanceOrderId = String(liveBuyResult.orderId);
      binanceClientOrderId = liveBuyResult.clientOrderId;
      executedQty = liveBuyResult.executedQty;
      finalQty = liveBuyResult.executedQty > 0 ? liveBuyResult.executedQty : quantizedQty;
      if (liveBuyResult.avgPrice > 0) {
        finalEntryPrice = liveBuyResult.avgPrice;
        finalNotional = PreciseMath.roundDown(finalQty * finalEntryPrice, 2);
      }
    }

    const sessionId = `direct-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const durationMs = durationMinutes * 60 * 1000;

    const session: DirectOperationSession = {
      id: sessionId,
      symbol: opportunity.symbol,
      baseCurrency: normalized.baseCurrency,
      quoteCurrency: normalized.quoteCurrency,
      investedAmountUsd: finalNotional,
      durationMinutes,
      startTime: now,
      endTime: now + durationMs,
      entryPrice: finalEntryPrice,
      targetPrice: opportunity.signal.takeProfit,
      stopLossPrice: opportunity.signal.stopLoss,
      quantity: finalQty,
      notionalUsd: finalNotional,
      riskUsd: validation.order.riskAmountUsd,
      rewardRiskRatio: validation.order.netRewardRiskRatio,
      aiScore: opportunity.score,
      mode,
      status: 'ACTIVE',
      currentPrice: finalEntryPrice,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      rationale: `Oportunidade selecionada pela IA (Score: ${opportunity.score}/100) com base em spread compresso (${(opportunity.marketData.spreadPct * 100).toFixed(3)}%) e ADX direcional (${opportunity.technicalMetrics.adx?.toFixed(1) || 'N/A'}).`,
      binanceOrderId,
      binanceClientOrderId,
      executedQuantity: executedQty,
      credentials: binanceCredentials,
    };

    activeSessions.set(sessionId, session);
    return { session, validation };
  }

  /**
   * Atualiza e consulta a telemetria ao vivo de uma sessão
   */
  public static async pollSession(sessionId: string): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão de operação ${sessionId} não encontrada.`);
    }

    if (session.status === 'CLOSED') {
      return session;
    }

    // Consultar preço em tempo real na Binance
    let latestPrice = session.entryPrice;
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${session.symbol}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        const p = parseFloat(data.price);
        if (Number.isFinite(p) && p > 0) latestPrice = p;
      }
    } catch {
      // Em caso de instabilidade pontual de rede, usa o último preço registrado
      latestPrice = session.currentPrice;
    }

    session.currentPrice = latestPrice;

    // Cálculo de PnL flutuante
    const priceDiff = latestPrice - session.entryPrice;
    const grossPnl = priceDiff * (session.executedQuantity || session.quantity);
    const pnlPercent = (priceDiff / session.entryPrice) * 100;

    session.unrealizedPnlUsd = PreciseMath.roundDown(grossPnl, 2);
    session.unrealizedPnlPercent = PreciseMath.roundDown(pnlPercent, 2);

    const now = Date.now();

    // Verificação de condições de encerramento automático:
    // 1. Take Profit atingido
    if (latestPrice >= session.targetPrice) {
      return await this.closeOperation(sessionId, 'TARGET_REACHED', latestPrice);
    }

    // 2. Stop Loss atingido
    if (latestPrice <= session.stopLossPrice) {
      return await this.closeOperation(sessionId, 'STOP_LOSS', latestPrice);
    }

    // 3. Tempo esgotado
    if (now >= session.endTime) {
      return await this.closeOperation(sessionId, 'TIME_EXPIRED', latestPrice);
    }

    return session;
  }

  /**
   * Encerra a operação direta, liquida na Binance (se live) e entrega o resultado final
   */
  public static async closeOperation(
    sessionId: string,
    reason: 'TIME_EXPIRED' | 'TARGET_REACHED' | 'STOP_LOSS' | 'MANUAL_CLOSE',
    explicitExitPrice?: number,
    overrideCredentials?: BinanceCredentials
  ): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão de operação ${sessionId} não encontrada.`);
    }

    if (session.status === 'CLOSED') {
      return session;
    }

    let exitPrice = explicitExitPrice ?? session.currentPrice;
    let closeBinanceOrderId: string | undefined;

    // Se a sessão foi aberta no modo LIVE, executa a VENDA da posição na Binance Spot
    if (session.mode === 'live') {
      const creds = overrideCredentials || session.credentials;
      if (!creds || !creds.apiKey || !creds.apiSecret) {
        throw new Error('Chaves da API da Binance não encontradas para liquidação da ordem real.');
      }

      const metadataService = ExchangeMetadataService.getInstance();
      const filters = await metadataService.getSymbolFilters(session.symbol);
      const orderExecutor = PilotOrderExecutor.getInstance();

      const liveSellResult = await orderExecutor.executeLiveSell({
        symbol: session.symbol,
        baseAsset: session.baseCurrency,
        quantity: session.executedQuantity || session.quantity,
        filters,
        credentials: creds,
      });

      closeBinanceOrderId = String(liveSellResult.orderId);
      if (liveSellResult.avgPrice > 0) {
        exitPrice = liveSellResult.avgPrice;
      }
    }

    const effectiveQty = session.executedQuantity || session.quantity;
    const priceDiff = exitPrice - session.entryPrice;
    const grossPnl = priceDiff * effectiveQty;

    // Dedução realista de taxas Maker (entrada) + Taker (saída a mercado de encerramento)
    const entryFee = session.notionalUsd * 0.001;
    const exitNotional = effectiveQty * exitPrice;
    const exitFee = exitNotional * 0.001;
    const totalFees = entryFee + exitFee;

    const netPnl = grossPnl - totalFees;
    const netPercent = (netPnl / session.investedAmountUsd) * 100;

    session.status = 'CLOSED';
    session.closeReason = reason;
    session.currentPrice = exitPrice;
    session.closeBinanceOrderId = closeBinanceOrderId;
    session.realizedPnlUsd = PreciseMath.roundDown(netPnl, 2);
    session.realizedPnlPercent = PreciseMath.roundDown(netPercent, 2);
    session.feeDeductedUsd = PreciseMath.roundDown(totalFees, 2);
    session.unrealizedPnlUsd = 0;
    session.unrealizedPnlPercent = 0;

    return session;
  }

  /**
   * Limpa sessões expiradas da memória
   */
  public static clearSession(sessionId: string): boolean {
    return activeSessions.delete(sessionId);
  }
}
