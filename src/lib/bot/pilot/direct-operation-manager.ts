import { MarketOpportunitySelector, EvaluatedOpportunity, TriggerCondition, RankedOpportunitySummary } from './market-opportunity-selector';
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
  status: 'WAITING_TRIGGER' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  closeReason?: 'TIME_EXPIRED' | 'TARGET_REACHED' | 'STOP_LOSS' | 'MANUAL_CLOSE' | 'TRIGGER_EXPIRED' | 'RADAR_CANCELLED';
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
  triggerCondition?: TriggerCondition;
  strategyChosen?: string;
  targetEntryPrice?: number;
  radarExpiresAt?: number;
  isExecutingTrigger?: boolean;
  topRanked?: RankedOpportunitySummary[];
  isCooldownApplied?: boolean;
}

// Armazenamento em memória de sessões ativas
const activeSessions = new Map<string, DirectOperationSession>();

export class DirectOperationManager {
  // Histórico em memória de símbolos operados recentemente para rotação de ativos
  private static recentSymbolsHistory: { symbol: string; timestamp: number }[] = [];

  /**
   * Recupera os símbolos operados dentro da janela de cooldown (padrão 30 minutos)
   */
  public static getCooldownSymbols(cooldownMs = 30 * 60 * 1000): string[] {
    const cutoff = Date.now() - cooldownMs;
    return this.recentSymbolsHistory
      .filter((h) => h.timestamp > cutoff)
      .map((h) => h.symbol);
  }

  /**
   * Registra um símbolo no histórico de rotação recente
   */
  public static recordSymbolExecution(symbol: string): void {
    this.recentSymbolsHistory = [
      { symbol, timestamp: Date.now() },
      ...this.recentSymbolsHistory.filter((h) => h.symbol !== symbol),
    ].slice(0, 20);
  }

  /**
   * Limpa histórico de cooldown (útil para testes ou reset manual)
   */
  public static clearCooldownHistory(): void {
    this.recentSymbolsHistory = [];
  }

  /**
   * Inicia uma nova Operação Direta com IA
   */
  public static async startOperation(params: {
    amount: number;
    durationMinutes: number;
    strategy?: string;
    mode?: 'live' | 'paper';
    binanceCredentials?: BinanceCredentials;
    overrideSymbol?: string;
  }): Promise<{ session: DirectOperationSession; validation: ValidationResult }> {
    const { amount, durationMinutes, strategy = 'AUTO', mode = 'paper', binanceCredentials, overrideSymbol } = params;

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

    // 3. Seleção inteligente do melhor ativo com rotação automática (Cooldown de 30 min)
    const cooldownSymbols = DirectOperationManager.getCooldownSymbols();
    const selector = MarketOpportunitySelector.getInstance();
    const opportunity: EvaluatedOpportunity = await selector.findBestOpportunity(
      amount,
      "https://api.binance.com",
      strategy,
      cooldownSymbols,
      overrideSymbol
    );

    // Registra o símbolo selecionado para que a próxima operação priorize outro ativo
    DirectOperationManager.recordSymbolExecution(opportunity.symbol);

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

    // Validação mandatória de credenciais para modo real antes de qualquer agendamento ou execução
    if (mode === 'live') {
      if (!binanceCredentials || !binanceCredentials.apiKey || !binanceCredentials.apiSecret) {
        throw new Error('Chaves da API da Binance não encontradas ou inválidas para o modo Real.');
      }
    }

    const isImmediate = opportunity.triggerCondition.type === 'IMMEDIATE';
    let finalEntryPrice = entryPrice;
    let finalQty = quantizedQty;
    let finalNotional = notionalUsd;
    let binanceOrderId: string | undefined;
    let binanceClientOrderId: string | undefined;
    let executedQty: number | undefined;

    // 9. Se for modo REAL (live) e o gatilho for IMEDIATO, executa a compra a mercado agora na Binance Spot
    if (mode === 'live' && isImmediate) {
      const orderExecutor = PilotOrderExecutor.getInstance();
      const liveBuyResult = await orderExecutor.executeLiveBuy({
        symbol: opportunity.symbol,
        notionalUsd,
        suggestedQty: quantizedQty,
        filters,
        credentials: binanceCredentials!,
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
    const radarExpiresAt = now + (opportunity.triggerCondition.expirationMinutes * 60 * 1000);

    const session: DirectOperationSession = {
      id: sessionId,
      symbol: opportunity.symbol,
      baseCurrency: normalized.baseCurrency,
      quoteCurrency: normalized.quoteCurrency,
      investedAmountUsd: finalNotional,
      durationMinutes,
      startTime: isImmediate ? now : 0,
      endTime: isImmediate ? now + durationMs : 0,
      entryPrice: finalEntryPrice,
      targetPrice: opportunity.signal.takeProfit,
      stopLossPrice: opportunity.signal.stopLoss,
      quantity: finalQty,
      notionalUsd: finalNotional,
      riskUsd: validation.order.riskAmountUsd,
      rewardRiskRatio: validation.order.netRewardRiskRatio,
      aiScore: opportunity.score,
      mode,
      status: isImmediate ? 'ACTIVE' : 'WAITING_TRIGGER',
      currentPrice: opportunity.marketData.lastPrice,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      rationale: `Oportunidade selecionada pela IA (${opportunity.effectiveStrategy}) com Score ${opportunity.score}/100. ${opportunity.triggerCondition.conditionDescription}`,
      binanceOrderId,
      binanceClientOrderId,
      executedQuantity: executedQty,
      credentials: binanceCredentials,
      triggerCondition: opportunity.triggerCondition,
      strategyChosen: opportunity.effectiveStrategy,
      targetEntryPrice: opportunity.triggerCondition.targetPrice,
      radarExpiresAt,
      isExecutingTrigger: false,
      topRanked: opportunity.topRanked,
      isCooldownApplied: opportunity.isCooldownApplied,
    };

    activeSessions.set(sessionId, session);
    return { session, validation };
  }

  /**
   * Ativa a ordem de compra quando o gatilho ótimo for atingido ou forçado pelo usuário
   */
  public static async activateWaitingSession(
    sessionId: string,
    currentPrice?: number,
    force = false
  ): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada.`);
    }

    if (session.status !== 'WAITING_TRIGGER') {
      return session;
    }

    // Trava de concorrência atômica para evitar double-buy
    if (session.isExecutingTrigger) {
      return session;
    }
    session.isExecutingTrigger = true;

    try {
      const metadataService = ExchangeMetadataService.getInstance();
      const filters = await metadataService.getSymbolFilters(session.symbol);

      let effectiveEntryPrice = currentPrice ?? session.currentPrice;
      let finalQty = session.quantity;
      let finalNotional = session.notionalUsd;
      let binanceOrderId = session.binanceOrderId;
      let binanceClientOrderId = session.binanceClientOrderId;
      let executedQty = session.executedQuantity;

      // Se for modo REAL (live), despacha a compra a mercado agora na Binance Spot
      if (session.mode === 'live') {
        if (!session.credentials || !session.credentials.apiKey || !session.credentials.apiSecret) {
          throw new Error('Credenciais da Binance não disponíveis para executar disparo real.');
        }

        const orderExecutor = PilotOrderExecutor.getInstance();
        const liveBuyResult = await orderExecutor.executeLiveBuy({
          symbol: session.symbol,
          notionalUsd: session.notionalUsd,
          suggestedQty: session.quantity,
          filters,
          credentials: session.credentials,
        });

        binanceOrderId = String(liveBuyResult.orderId);
        binanceClientOrderId = liveBuyResult.clientOrderId;
        executedQty = liveBuyResult.executedQty;
        finalQty = liveBuyResult.executedQty > 0 ? liveBuyResult.executedQty : session.quantity;
        if (liveBuyResult.avgPrice > 0) {
          effectiveEntryPrice = liveBuyResult.avgPrice;
          finalNotional = PreciseMath.roundDown(finalQty * effectiveEntryPrice, 2);
        }
      }

      const now = Date.now();
      const durationMs = session.durationMinutes * 60 * 1000;

      session.status = 'ACTIVE';
      session.entryPrice = effectiveEntryPrice;
      session.currentPrice = effectiveEntryPrice;
      session.quantity = finalQty;
      session.notionalUsd = finalNotional;
      session.executedQuantity = executedQty;
      session.binanceOrderId = binanceOrderId;
      session.binanceClientOrderId = binanceClientOrderId;
      session.startTime = now;
      session.endTime = now + durationMs;
      session.isExecutingTrigger = false;

      return session;
    } catch (err: any) {
      session.isExecutingTrigger = false;
      throw err;
    }
  }

  /**
   * Força a entrada imediata ignorando a espera pelo gatilho
   */
  public static async forceEntry(sessionId: string): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada.`);
    }
    if (session.status !== 'WAITING_TRIGGER') {
      return session;
    }
    return await this.activateWaitingSession(sessionId, session.currentPrice, true);
  }

  /**
   * Cancela a espera no radar sem realizar nenhum trade
   */
  public static cancelRadar(sessionId: string): DirectOperationSession {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada.`);
    }
    if (session.status !== 'WAITING_TRIGGER') {
      return session;
    }
    session.status = 'CANCELLED';
    session.closeReason = 'RADAR_CANCELLED';
    session.unrealizedPnlUsd = 0;
    session.unrealizedPnlPercent = 0;
    session.realizedPnlUsd = 0;
    session.realizedPnlPercent = 0;
    return session;
  }

  /**
   * Atualiza e consulta a telemetria ao vivo de uma sessão
   */
  public static async pollSession(sessionId: string): Promise<DirectOperationSession> {
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão de operação ${sessionId} não encontrada.`);
    }

    if (session.status === 'CLOSED' || session.status === 'CANCELLED') {
      return session;
    }

    // Consultar preço em tempo real na Binance
    let latestPrice = session.currentPrice;
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
      latestPrice = session.currentPrice;
    }

    session.currentPrice = latestPrice;

    // Se estiver aguardando gatilho ótimo (Radar Sniper)
    if (session.status === 'WAITING_TRIGGER') {
      const trigger = session.triggerCondition;
      const target = trigger?.targetPrice ?? session.targetEntryPrice ?? session.entryPrice;
      const distPct = Math.abs(latestPrice - target) / latestPrice * 100;
      if (session.triggerCondition) {
        session.triggerCondition.distanceToTriggerPct = PreciseMath.roundDown(distPct, 2);
      }

      // 1. Radar expirado
      if (session.radarExpiresAt && Date.now() >= session.radarExpiresAt) {
        session.status = 'CLOSED';
        session.closeReason = 'TRIGGER_EXPIRED';
        session.realizedPnlUsd = 0;
        session.realizedPnlPercent = 0;
        session.unrealizedPnlUsd = 0;
        session.unrealizedPnlPercent = 0;
        return session;
      }

      // 2. Avaliação da condição de disparo
      let shouldTrigger = false;
      if (trigger?.triggerDirection === 'LESS_THAN_OR_EQUAL' && latestPrice <= target) {
        shouldTrigger = true;
      } else if (trigger?.triggerDirection === 'GREATER_THAN_OR_EQUAL' && latestPrice >= target) {
        shouldTrigger = true;
      } else if (trigger?.triggerDirection === 'NOW') {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        return await this.activateWaitingSession(sessionId, latestPrice);
      }

      return session;
    }

    // Cálculo de PnL flutuante para status ACTIVE
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

    if (session.status === 'CLOSED' || session.status === 'CANCELLED') {
      return session;
    }

    if (session.status === 'WAITING_TRIGGER') {
      if (reason === 'MANUAL_CLOSE') {
        session.status = 'CLOSED';
        session.closeReason = 'MANUAL_CLOSE';
        session.unrealizedPnlUsd = 0;
        session.unrealizedPnlPercent = 0;
        session.realizedPnlUsd = 0;
        session.realizedPnlPercent = 0;
        return session;
      }
      // Se for encerramento de alvo/tempo em teste/simulação, ativa a sessão mantendo o entryPrice planejado
      await this.activateWaitingSession(sessionId, session.entryPrice);
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
