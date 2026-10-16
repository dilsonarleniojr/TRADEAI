/**
 * TradeAI Institutional Risk & Capital Governance Manager (RiskManager)
 * 
 * Pilares Centrais:
 * 1. Dimensionamento Fracionário por Risco Técnico:
 *    PositionSize = (AccountBalance * RiskPercentage) / |EntryPrice - StopLossPrice|
 * 2. Circuit Breakers Atômicos de Carteira:
 *    - Daily Drawdown Limit (<= 3.0% do NAV) com hibernação de 24h
 *    - Consecutive Loss Brake (>= 3 perdas consecutivas acionam cooldown de 60 min)
 * 3. Viabilidade Operacional com Assimetria Positiva:
 *    - R:R Líquido >= 1:1.5 deduzindo taxas Maker/Taker e derrapagem
 * 4. Break-Even Dinâmico em 1R com buffer de preservação de capital pós-taxas
 */

export interface PositionSizeResult {
  valid: boolean;
  isViable: boolean;
  quantity: number;
  notionalUsdt: number;
  notionalTotal: number;
  riskAmountUsdt: number;
  maxLossUsdt: number;
  riskPercentOfBalance: number;
  effectiveSlPercent: number;
  reason?: string;
  rejectionReason?: string;
}

export interface OperationalViabilityResult {
  viable: boolean;
  netPayoffRatio: number;
  netRewardRiskRatio: number;
  grossPayoffRatio: number;
  projectedNetProfitUsdt: number;
  projectedNetLossUsdt: number;
  totalEstimatedFeesPercent: number;
  reason: string;
}

export interface CircuitBreakerStatus {
  blocked: boolean;
  reason?: string;
  cooldownExpiresAt?: number;
  circuitBreakerType?: "DAILY_DRAWDOWN" | "CONSECUTIVE_LOSS" | "MAX_NAV_EXPOSURE";
}

export interface ProtectionSettings {
  // 1. Trava de Perda Diária (Daily Drawdown Kill Switch)
  dailyDrawdownProtection: boolean;
  maxDailyDrawdownPct: number; // e.g. 0.03 (3.0%)

  // 2. Freio de Perdas Consecutivas (Consecutive Loss Brake)
  consecutiveLossProtection: boolean;
  maxConsecutiveLosses: number; // e.g. 3
  consecutiveLossCooldownMinutes: number; // e.g. 60

  // 3. Filtro de Viabilidade Operacional (R:R Líquido Mínimo >= 1.50)
  operationalViabilityFilter: boolean;
  minNetRewardRiskRatio: number; // e.g. 1.50

  // 4. Dimensionamento Fracionário por Risco Técnico (<= 1.0% por trade)
  fractionalRiskSizing: boolean;
  maxRiskPerTradePct: number; // e.g. 0.01 (1.0%)

  // 5. Break-Even Dinâmico em 1R (buffer de proteção de taxas +0.35%)
  dynamicBreakEven: boolean;
  breakEvenFeeBufferPct: number; // e.g. 0.35%

  // 6. Ordens Post-Only LIMIT_MAKER no bestBid (Zero Taker Fee & Zero Slippage)
  postOnlyMakerOrders: boolean;

  // 7. Timeout de Cancelamento Automático de Ordens Órfãs após 60s
  restingOrderTimeout: boolean;
  restingOrderTimeoutSeconds: number; // e.g. 60

  // 8. Filtro Macro do Bitcoin (BTC Gatekeeper)
  btcMacroFilter: boolean;

  // 9. Filtro de Correlação Cruzada (Beta r > 0.85)
  crossCorrelationFilter: boolean;

  // 10. Repricing Dinâmico de 1 Tick para LIMIT_MAKER (aos 30s se Fill-Rate < 40%)
  dynamicMakerRepricing: boolean;
  repricingTimeoutSeconds: number; // e.g. 30
  minFillRateThreshold: number; // e.g. 40 (40%)
}

export const DEFAULT_PROTECTION_SETTINGS: ProtectionSettings = {
  dailyDrawdownProtection: true,
  maxDailyDrawdownPct: 0.03,
  consecutiveLossProtection: true,
  maxConsecutiveLosses: 3,
  consecutiveLossCooldownMinutes: 60,
  operationalViabilityFilter: true,
  minNetRewardRiskRatio: 1.50,
  fractionalRiskSizing: true,
  maxRiskPerTradePct: 0.01,
  dynamicBreakEven: true,
  breakEvenFeeBufferPct: 0.35,
  postOnlyMakerOrders: true,
  restingOrderTimeout: true,
  restingOrderTimeoutSeconds: 60,
  btcMacroFilter: true,
  crossCorrelationFilter: true,
  dynamicMakerRepricing: true,
  repricingTimeoutSeconds: 30,
  minFillRateThreshold: 40,
};

export interface FillRateEvent {
  timestamp: number;
  symbol: string;
  status: "FILLED" | "CANCELLED" | "REPRICED";
}

export interface FillRateTelemetry {
  totalMakerOrders: number;
  filledMakerOrders: number;
  cancelledMakerOrders: number;
  repricedMakerOrders: number;
  fillRatePct: number;
  recentFillRatePct: number;
  isExtremeVolatility: boolean;
  recentHistory: FillRateEvent[];
}

export class RiskManager {
  private static instance: RiskManager;

  // Modos de proteção configuráveis pelo usuário
  private settings: ProtectionSettings;

  // Estado dos Circuit Breakers em memória
  private dailyHaltedUntil: number = 0;
  private consecutiveLossCooldownUntil: number = 0;
  private currentConsecutiveLosses: number = 0;
  private dailyLossUsdt: number = 0;
  private lastResetDay: number = new Date().getUTCDate();

  // Telemetria de Taxa de Preenchimento (Fill-Rate Telemetry)
  private makerOrdersCount: number = 0;
  private makerFilledCount: number = 0;
  private makerCancelledCount: number = 0;
  private makerRepricedCount: number = 0;
  private recentMakerEvents: FillRateEvent[] = [];

  // Limites institucionais configuráveis
  public static readonly DEFAULT_RISK_PER_TRADE_PCT = 0.01; // 1.0% do saldo em risco por trade
  public static readonly MAX_DAILY_DRAWDOWN_PCT = 0.03;      // 3.0% perda diária máxima
  public static readonly MAX_CONSECUTIVE_LOSSES = 3;         // 3 perdas consecutivas ativam freio
  public static readonly CONSECUTIVE_LOSS_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutos
  public static readonly DAILY_HIBERNATION_MS = 24 * 60 * 60 * 1000;    // 24 horas
  public static readonly MIN_NET_RR_RATIO = 1.50;            // Mínimo 1:1.5 líquido de taxas
  public static readonly ROUNDTRIP_FEE_PCT = 0.0015;         // 0.15% (0.075% Maker/BNB * 2 ou 0.10% Spot)
  public static readonly ESTIMATED_SLIPPAGE_PCT = 0.0005;    // 0.05% slippage médio em book líquido

  private constructor() {
    this.settings = this.loadInitialSettings();
    this.loadInitialFillTelemetry();
  }

  private loadInitialSettings(): ProtectionSettings {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = window.localStorage.getItem("tradeai_protection_settings");
        if (saved) {
          return { ...DEFAULT_PROTECTION_SETTINGS, ...JSON.parse(saved) };
        }
      } catch {}
    }
    return { ...DEFAULT_PROTECTION_SETTINGS };
  }

  public getProtectionSettings(): ProtectionSettings {
    return { ...this.settings };
  }

  public setProtectionSettings(partial: Partial<ProtectionSettings>): ProtectionSettings {
    this.settings = { ...this.settings, ...partial };
    if (partial.consecutiveLossProtection === false) {
      this.resetConsecutiveLossBrake();
    }
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem("tradeai_protection_settings", JSON.stringify(this.settings));
        window.dispatchEvent(new CustomEvent("tradeai_protection_settings_updated", { detail: this.settings }));
      } catch {}
    }
    return { ...this.settings };
  }

  public resetConsecutiveLossBrake() {
    this.currentConsecutiveLosses = 0;
    this.consecutiveLossCooldownUntil = 0;
  }

  /**
   * Destrava manualmente todos os circuit breakers (Daily Drawdown e Consecutive Losses),
   * zerando o acumulador de perda diária e os tempos de cooldown em memória.
   */
  public resetCircuitBreakers() {
    this.dailyHaltedUntil = 0;
    this.consecutiveLossCooldownUntil = 0;
    this.currentConsecutiveLosses = 0;
    this.dailyLossUsdt = 0;
    this.lastResetDay = new Date().getUTCDate();
  }

  public getConsecutiveLossStatus() {
    return {
      currentConsecutiveLosses: this.currentConsecutiveLosses,
      cooldownUntil: this.consecutiveLossCooldownUntil,
      isBlocked: this.settings.consecutiveLossProtection && (
        this.consecutiveLossCooldownUntil > Date.now() ||
        this.currentConsecutiveLosses >= (this.settings.maxConsecutiveLosses || RiskManager.MAX_CONSECUTIVE_LOSSES)
      ),
    };
  }

  public resetProtectionSettings(): ProtectionSettings {
    this.settings = { ...DEFAULT_PROTECTION_SETTINGS };
    this.resetConsecutiveLossBrake();
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem("tradeai_protection_settings");
        window.dispatchEvent(new CustomEvent("tradeai_protection_settings_updated", { detail: this.settings }));
      } catch {}
    }
    return { ...this.settings };
  }

  public static getInstance(): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager();
    }
    return RiskManager.instance;
  }

  /**
   * Reseta o acumulador diário se o dia UTC virou.
   */
  private checkDailyReset() {
    const today = new Date().getUTCDate();
    if (today !== this.lastResetDay) {
      this.dailyLossUsdt = 0;
      this.dailyHaltedUntil = 0;
      this.lastResetDay = today;
    }
  }

  /**
   * 1. Cálculo de Posição Baseado em Risco Exato:
   * PositionSize = (AccountBalance * RiskPercentage) / |EntryPrice - StopLossPrice|
   */
  public calculatePositionSize(params: {
    accountBalance: number;
    entryPrice: number;
    stopLossPrice: number;
    minNotional?: number;
    riskPercentage?: number;
    maxCapitalAllocationCap?: number;
    relativeAtr?: number;
  }): PositionSizeResult {
    const {
      accountBalance,
      entryPrice,
      stopLossPrice,
      minNotional = 10.0,
      riskPercentage = RiskManager.DEFAULT_RISK_PER_TRADE_PCT,
      maxCapitalAllocationCap,
      relativeAtr,
    } = params;

    if (!Number.isFinite(accountBalance) || accountBalance <= 0) {
      const reason = "Saldo da conta inválido ou zerado.";
      return {
        valid: false,
        isViable: false,
        quantity: 0,
        notionalUsdt: 0,
        notionalTotal: 0,
        riskAmountUsdt: 0,
        maxLossUsdt: 0,
        riskPercentOfBalance: 0,
        effectiveSlPercent: 0,
        reason,
        rejectionReason: reason,
      };
    }

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      const reason = "Preço de entrada inválido.";
      return {
        valid: false,
        isViable: false,
        quantity: 0,
        notionalUsdt: 0,
        notionalTotal: 0,
        riskAmountUsdt: 0,
        maxLossUsdt: 0,
        riskPercentOfBalance: 0,
        effectiveSlPercent: 0,
        reason,
        rejectionReason: reason,
      };
    }

    if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0 || stopLossPrice >= entryPrice) {
      const reason = `Stop-Loss (${stopLossPrice}) deve ser estritamente inferior ao preço de entrada (${entryPrice}).`;
      return {
        valid: false,
        isViable: false,
        quantity: 0,
        notionalUsdt: 0,
        notionalTotal: 0,
        riskAmountUsdt: 0,
        maxLossUsdt: 0,
        riskPercentOfBalance: 0,
        effectiveSlPercent: 0,
        reason,
        rejectionReason: reason,
      };
    }

    // Se o dimensionamento fracionário de risco estiver desativado pelo usuário,
    // aloca diretamente por valor nominal (modo estático / agressivo)
    if (!this.settings.fractionalRiskSizing) {
      const stopDistanceUsdt = Math.max(0, entryPrice - stopLossPrice);
      const effectiveSlPercent = (stopDistanceUsdt / entryPrice) * 100;
      let targetAllocation = maxCapitalAllocationCap && maxCapitalAllocationCap > 0
        ? Math.min(accountBalance, maxCapitalAllocationCap)
        : Math.min(accountBalance, 50.0);

      // Modulação de risco por volatilidade ATR (Risk-Parity institucional)
      if (typeof relativeAtr === "number" && Number.isFinite(relativeAtr) && relativeAtr > 1.60) {
        const volMultiplier = Math.min(1.0, Math.max(0.40, 1.60 / relativeAtr));
        targetAllocation = targetAllocation * volMultiplier;
      }
      
      const quantity = parseFloat((targetAllocation / entryPrice).toFixed(6));
      const notionalUsdt = parseFloat((quantity * entryPrice).toFixed(2));
      const rawLoss = parseFloat((stopDistanceUsdt * quantity).toFixed(2));
      const riskPct = accountBalance > 0 ? (rawLoss / accountBalance) * 100 : 0;

      return {
        valid: notionalUsdt >= minNotional,
        isViable: notionalUsdt >= minNotional,
        quantity,
        notionalUsdt,
        notionalTotal: notionalUsdt,
        riskAmountUsdt: rawLoss,
        maxLossUsdt: rawLoss,
        riskPercentOfBalance: riskPct,
        effectiveSlPercent,
        reason: notionalUsdt < minNotional
          ? `Alocação ($${notionalUsdt.toFixed(2)}) abaixo do lote mínimo ($${minNotional.toFixed(2)}) da Binance.`
          : `Dimensionamento estático (Proteção Fracionária desligada pelo usuário).`,
      };
    }

    // Distância por unidade até o Stop Loss
    const stopDistanceUsdt = entryPrice - stopLossPrice;
    const effectiveSlPercent = (stopDistanceUsdt / entryPrice) * 100;

    // Risco financeiro desejado em USDT (respeitando o teto configurado de risco fracionário)
    const effectiveRiskPct = Math.min(riskPercentage, this.settings.maxRiskPerTradePct);
    const riskAmountUsdt = accountBalance * effectiveRiskPct;

    // Quantidade teórica: Q = Risco em $ / Distância do Stop em $
    let quantity = riskAmountUsdt / stopDistanceUsdt;
    let notionalUsdt = quantity * entryPrice;

    // Modulação de risco por volatilidade ATR (Risk-Parity institucional)
    // Se o par apresenta volatilidade relativa elevada (> 1.60%), reduz proporcionalmente
    // a exposição da ordem (até 60% de corte) para conter o risco em dólares contra pavios e solavancos.
    if (typeof relativeAtr === "number" && Number.isFinite(relativeAtr) && relativeAtr > 1.60) {
      const volMultiplier = Math.min(1.0, Math.max(0.40, 1.60 / relativeAtr));
      notionalUsdt = notionalUsdt * volMultiplier;
      quantity = notionalUsdt / entryPrice;
    }

    // Teto de Alocação de Capital (ex: teto de capital para não concentrar a banca inteira em stop muito curto)
    const effectiveMaxCap = maxCapitalAllocationCap && maxCapitalAllocationCap > 0
      ? maxCapitalAllocationCap
      : accountBalance * 0.25; // Limite máximo padrão de 25% da banca por ativo

    if (notionalUsdt > effectiveMaxCap) {
      notionalUsdt = effectiveMaxCap;
      quantity = notionalUsdt / entryPrice;
    }

    // Verificação de lote mínimo da exchange (minNotional)
    if (notionalUsdt < minNotional) {
      // Se a banca for pequena, ajusta notional para o mínimo se o risco percentual ainda for tolerável (<= 3%)
      const adjustedRisk = (minNotional * (stopDistanceUsdt / entryPrice));
      const adjustedRiskPct = (adjustedRisk / accountBalance) * 100;

      if (adjustedRiskPct <= 3.0 && accountBalance >= minNotional) {
        notionalUsdt = minNotional;
        quantity = notionalUsdt / entryPrice;
      } else {
        const reason = `Valor nocional da ordem ($${notionalUsdt.toFixed(2)}) abaixo do lote mínimo ($${minNotional.toFixed(2)}) da Binance. Risco projetado excederia o limite.`;
        return {
          valid: false,
          isViable: false,
          quantity: 0,
          notionalUsdt,
          notionalTotal: notionalUsdt,
          riskAmountUsdt,
          maxLossUsdt: riskAmountUsdt,
          riskPercentOfBalance: (riskAmountUsdt / accountBalance) * 100,
          effectiveSlPercent,
          reason,
          rejectionReason: reason,
        };
      }
    }

    // Não pode gastar mais do que o saldo livre
    if (notionalUsdt > accountBalance * 0.98) {
      notionalUsdt = accountBalance * 0.98;
      quantity = notionalUsdt / entryPrice;
    }

    const finalRiskUsdt = quantity * stopDistanceUsdt;
    const finalRiskPercent = (finalRiskUsdt / accountBalance) * 100;

    return {
      valid: true,
      isViable: true,
      quantity,
      notionalUsdt,
      notionalTotal: notionalUsdt,
      riskAmountUsdt: finalRiskUsdt,
      maxLossUsdt: finalRiskUsdt,
      riskPercentOfBalance: finalRiskPercent,
      effectiveSlPercent,
    };
  }

  /**
   * 2. Avaliação de Viabilidade Operacional (R:R Líquido):
   * Verifica se a relação Risco:Retorno líquida de taxas e slippage atinge o piso configurado.
   */
  public evaluateOperationalViability(params: {
    entryPrice: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    isMaker?: boolean;
  }): OperationalViabilityResult {
    const { entryPrice, stopLossPrice, takeProfitPrice, isMaker = true } = params;

    const stopDistance = entryPrice - stopLossPrice;
    const profitDistance = takeProfitPrice - entryPrice;

    if (stopDistance <= 0 || profitDistance <= 0) {
      return {
        viable: false,
        netPayoffRatio: 0,
        netRewardRiskRatio: 0,
        grossPayoffRatio: 0,
        projectedNetProfitUsdt: 0,
        projectedNetLossUsdt: 0,
        totalEstimatedFeesPercent: 0,
        reason: "Preços de entrada, stop ou alvo inconsistentes.",
      };
    }

    const slPercent = (stopDistance / entryPrice) * 100;
    const tpPercent = (profitDistance / entryPrice) * 100;

    // Fricção operacional estimada (taxas ida/volta + slippage)
    const roundtripFee = isMaker ? 0.0010 : RiskManager.ROUNDTRIP_FEE_PCT;
    const slippage = isMaker ? 0 : RiskManager.ESTIMATED_SLIPPAGE_PCT;
    const totalFrictionPercent = (roundtripFee + slippage) * 100; // ~0.10% Maker, ~0.20% Taker

    const netTpPercent = Math.max(0, tpPercent - totalFrictionPercent);
    const netSlPercent = slPercent + totalFrictionPercent;

    const grossPayoffRatio = parseFloat((tpPercent / slPercent).toFixed(2));
    const netPayoffRatio = parseFloat((netTpPercent / netSlPercent).toFixed(2));

    // Se o filtro de viabilidade estiver desativado pelo usuário, aprova permissivamente
    if (!this.settings.operationalViabilityFilter) {
      return {
        viable: true,
        netPayoffRatio,
        netRewardRiskRatio: netPayoffRatio,
        grossPayoffRatio,
        projectedNetProfitUsdt: netTpPercent,
        projectedNetLossUsdt: netSlPercent,
        totalEstimatedFeesPercent: totalFrictionPercent,
        reason: "Filtro de viabilidade operacional desativado pelo usuário (Modo Permissivo).",
      };
    }

    const minRatio = this.settings.minNetRewardRiskRatio || RiskManager.MIN_NET_RR_RATIO;
    const viable = netPayoffRatio >= minRatio && netTpPercent >= 1.50;

    const reason = viable
      ? `R:R líquido de ${netPayoffRatio}x (TP líq: +${netTpPercent.toFixed(2)}% / SL líq: -${netSlPercent.toFixed(2)}%) acima do piso de ${minRatio}x.`
      : `R:R líquido de ${netPayoffRatio}x insuficiente (piso exigido: ${minRatio}x pós-taxas de ${totalFrictionPercent.toFixed(2)}%).`;

    return {
      viable,
      netPayoffRatio,
      netRewardRiskRatio: netPayoffRatio,
      grossPayoffRatio,
      projectedNetProfitUsdt: netTpPercent,
      projectedNetLossUsdt: netSlPercent,
      totalEstimatedFeesPercent: totalFrictionPercent,
      reason,
    };
  }

  /**
   * 3. Circuit Breaker: Verificação de Perda Diária e Perdas Consecutivas
   */
  public checkCircuitBreakers(totalNavUsdt: number): CircuitBreakerStatus {
    this.checkDailyReset();
    const now = Date.now();

    // Trava 1: Hibernação por Perda Diária Máxima (se ativa)
    if (this.settings.dailyDrawdownProtection) {
      if (this.dailyHaltedUntil > now) {
        const remainingMin = Math.ceil((this.dailyHaltedUntil - now) / 60000);
        return {
          blocked: true,
          reason: `[KILL_SWITCH_DAILY] Trava de perda diária ativada (-$${this.dailyLossUsdt.toFixed(2)} USDT excedeu ${(this.settings.maxDailyDrawdownPct * 100).toFixed(1)}% do NAV). Robô hibernando por mais ${remainingMin} minutos.`,
          cooldownExpiresAt: this.dailyHaltedUntil,
          circuitBreakerType: "DAILY_DRAWDOWN",
        };
      }

      // Verificação de Drawdown Diário Dinâmico
      if (totalNavUsdt > 0) {
        const maxDailyLossAllowed = totalNavUsdt * this.settings.maxDailyDrawdownPct;
        if (this.dailyLossUsdt >= maxDailyLossAllowed) {
          this.dailyHaltedUntil = now + RiskManager.DAILY_HIBERNATION_MS;
          return {
            blocked: true,
            reason: `[KILL_SWITCH_TRIGGERED] Perda diária acumulada (-$${this.dailyLossUsdt.toFixed(2)} USDT) atingiu o limite de ${(this.settings.maxDailyDrawdownPct * 100).toFixed(1)}% da banca ($${maxDailyLossAllowed.toFixed(2)} USDT). Hibernação de 24h iniciada.`,
            cooldownExpiresAt: this.dailyHaltedUntil,
            circuitBreakerType: "DAILY_DRAWDOWN",
          };
        }
      }
    }

    // Trava 2: Cooldown por Perdas Consecutivas (se ativa)
    if (this.settings.consecutiveLossProtection) {
      const maxLosses = this.settings.maxConsecutiveLosses || RiskManager.MAX_CONSECUTIVE_LOSSES;
      if (this.currentConsecutiveLosses >= maxLosses && this.consecutiveLossCooldownUntil <= now) {
        const cooldownMs = (this.settings.consecutiveLossCooldownMinutes || 60) * 60 * 1000;
        this.consecutiveLossCooldownUntil = now + cooldownMs;
      }

      if (this.consecutiveLossCooldownUntil > now) {
        const remainingMin = Math.ceil((this.consecutiveLossCooldownUntil - now) / 60000);
        return {
          blocked: true,
          reason: `[CONSECUTIVE_LOSS_BRAKE] Trava de perdas consecutivas ativada (${this.currentConsecutiveLosses} perdas seguidas). Em cooldown por mais ${remainingMin} minutos para proteção contra choppy market.`,
          cooldownExpiresAt: this.consecutiveLossCooldownUntil,
          circuitBreakerType: "CONSECUTIVE_LOSS",
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Registra o resultado financeiro de um trade encerrado para atualização dos circuit breakers.
   */
  public recordTradeResult(netPnlUsdt: number, totalNavUsdt: number) {
    this.checkDailyReset();

    if (netPnlUsdt < 0) {
      const loss = Math.abs(netPnlUsdt);
      this.dailyLossUsdt += loss;
      this.currentConsecutiveLosses += 1;

      const maxLosses = this.settings.maxConsecutiveLosses || RiskManager.MAX_CONSECUTIVE_LOSSES;
      if (this.currentConsecutiveLosses >= maxLosses) {
        const cooldownMs = (this.settings.consecutiveLossCooldownMinutes || 60) * 60 * 1000;
        this.consecutiveLossCooldownUntil = Date.now() + cooldownMs;
      }

      const maxDailyDrawdown = this.settings.maxDailyDrawdownPct || RiskManager.MAX_DAILY_DRAWDOWN_PCT;
      const maxDailyLossAllowed = totalNavUsdt * maxDailyDrawdown;
      if (totalNavUsdt > 0 && this.dailyLossUsdt >= maxDailyLossAllowed) {
        this.dailyHaltedUntil = Date.now() + RiskManager.DAILY_HIBERNATION_MS;
      }
    } else if (netPnlUsdt > 0) {
      // Ganho compensa a perda acumulada no dia e reseta perdas consecutivas
      this.dailyLossUsdt = Math.max(0, this.dailyLossUsdt - netPnlUsdt);
      this.currentConsecutiveLosses = 0;
    }
  }

  /**
   * 4. Break-Even Dinâmico em 1R:
   * Calcula se o preço atual atingiu 1R (|Entry - SL|) e retorna o novo Stop Loss
   * garantindo lucro líquido positivo pós-taxas de corretagem.
   */
  public calculateDynamicBreakEven(params: {
    entryPrice: number;
    currentPrice: number;
    initialStopLossPrice: number;
    feeBufferPercent?: number;
  }): { shouldArmBreakEven: boolean; newStopLossPrice: number; profitSecuredPercent: number } {
    const {
      entryPrice,
      currentPrice,
      initialStopLossPrice,
      feeBufferPercent = this.settings.breakEvenFeeBufferPct || 0.35,
    } = params;

    // Se a proteção de break-even dinâmico estiver desativada pelo usuário
    if (!this.settings.dynamicBreakEven) {
      return {
        shouldArmBreakEven: false,
        newStopLossPrice: initialStopLossPrice,
        profitSecuredPercent: 0,
      };
    }

    const rDistance = entryPrice - initialStopLossPrice;
    const currentGainDistance = currentPrice - entryPrice;

    // 1R atingido quando o ganho atual >= distância inicial do stop
    const isOneRReached = currentGainDistance >= rDistance && rDistance > 0;

    // Novo Stop Loss posicionado em Entry + FeeBuffer
    const bufferMultiplier = 1 + (feeBufferPercent / 100);
    const newStopLossPrice = parseFloat((entryPrice * bufferMultiplier).toFixed(8));

    return {
      shouldArmBreakEven: isOneRReached,
      newStopLossPrice,
      profitSecuredPercent: feeBufferPercent,
    };
  }

  private loadInitialFillTelemetry() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = window.localStorage.getItem("tradeai_fill_rate_telemetry");
        if (saved) {
          const parsed = JSON.parse(saved);
          this.makerOrdersCount = parsed.totalMakerOrders || 0;
          this.makerFilledCount = parsed.filledMakerOrders || 0;
          this.makerCancelledCount = parsed.cancelledMakerOrders || 0;
          this.makerRepricedCount = parsed.repricedMakerOrders || 0;
          this.recentMakerEvents = parsed.recentHistory || [];
        }
      } catch {}
    }
  }

  private persistFillTelemetry() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const payload = {
          totalMakerOrders: this.makerOrdersCount,
          filledMakerOrders: this.makerFilledCount,
          cancelledMakerOrders: this.makerCancelledCount,
          repricedMakerOrders: this.makerRepricedCount,
          recentHistory: this.recentMakerEvents.slice(-30),
        };
        window.localStorage.setItem("tradeai_fill_rate_telemetry", JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent("tradeai_fill_telemetry_updated", { detail: this.getFillRateTelemetry() }));
      } catch {}
    }
  }

  public recordMakerOrder(symbol: string = "UNKNOWN") {
    this.makerOrdersCount++;
    this.persistFillTelemetry();
  }

  public recordMakerFill(symbol: string = "UNKNOWN") {
    this.makerFilledCount++;
    this.recentMakerEvents.push({ timestamp: Date.now(), symbol, status: "FILLED" });
    if (this.recentMakerEvents.length > 50) this.recentMakerEvents.shift();
    this.persistFillTelemetry();
  }

  public recordMakerCancel(symbol: string = "UNKNOWN") {
    this.makerCancelledCount++;
    this.recentMakerEvents.push({ timestamp: Date.now(), symbol, status: "CANCELLED" });
    if (this.recentMakerEvents.length > 50) this.recentMakerEvents.shift();
    this.persistFillTelemetry();
  }

  public recordMakerReprice(symbol: string = "UNKNOWN") {
    this.makerRepricedCount++;
    this.recentMakerEvents.push({ timestamp: Date.now(), symbol, status: "REPRICED" });
    if (this.recentMakerEvents.length > 50) this.recentMakerEvents.shift();
    this.persistFillTelemetry();
  }

  public getFillRateTelemetry(): FillRateTelemetry {
    const total = this.makerOrdersCount;
    const filled = this.makerFilledCount;
    const fillRatePct = total > 0 ? parseFloat(((filled / total) * 100).toFixed(1)) : 100;

    // Calcula fill-rate da janela recente (últimos eventos de FILLED vs CANCELLED)
    const recentTerminalEvents = this.recentMakerEvents.filter((e) => e.status === "FILLED" || e.status === "CANCELLED");
    let recentFillRatePct = fillRatePct;
    if (recentTerminalEvents.length >= 3) {
      const recentFilled = recentTerminalEvents.filter((e) => e.status === "FILLED").length;
      recentFillRatePct = parseFloat(((recentFilled / recentTerminalEvents.length) * 100).toFixed(1));
    }

    const minThreshold = this.settings.minFillRateThreshold ?? 40;
    const isExtremeVolatility = recentTerminalEvents.length >= 3 && recentFillRatePct < minThreshold;

    return {
      totalMakerOrders: this.makerOrdersCount,
      filledMakerOrders: this.makerFilledCount,
      cancelledMakerOrders: this.makerCancelledCount,
      repricedMakerOrders: this.makerRepricedCount,
      fillRatePct,
      recentFillRatePct,
      isExtremeVolatility,
      recentHistory: [...this.recentMakerEvents],
    };
  }

  public resetFillRateTelemetryForTests() {
    this.makerOrdersCount = 0;
    this.makerFilledCount = 0;
    this.makerCancelledCount = 0;
    this.makerRepricedCount = 0;
    this.recentMakerEvents = [];
  }

  /**
   * Status e telemetria atual do gerenciador de risco
   */
  public getTelemetry(totalNavUsdt: number) {
    this.checkDailyReset();
    const maxDaily = totalNavUsdt * (this.settings.dailyDrawdownProtection ? this.settings.maxDailyDrawdownPct : RiskManager.MAX_DAILY_DRAWDOWN_PCT);
    return {
      dailyLossUsdt: this.dailyLossUsdt,
      maxDailyLossAllowedUsdt: maxDaily,
      dailyDrawdownPercent: totalNavUsdt > 0 ? (this.dailyLossUsdt / totalNavUsdt) * 100 : 0,
      consecutiveLosses: this.currentConsecutiveLosses,
      maxConsecutiveLossesAllowed: this.settings.maxConsecutiveLosses,
      isDailyHalted: this.settings.dailyDrawdownProtection && this.dailyHaltedUntil > Date.now(),
      dailyHaltRemainingMs: Math.max(0, this.dailyHaltedUntil - Date.now()),
      isConsecutiveLossCooldown: this.settings.consecutiveLossProtection && this.consecutiveLossCooldownUntil > Date.now(),
      consecutiveCooldownRemainingMs: Math.max(0, this.consecutiveLossCooldownUntil - Date.now()),
      fillRateTelemetry: this.getFillRateTelemetry(),
      activeProtections: {
        dailyDrawdownProtection: this.settings.dailyDrawdownProtection,
        consecutiveLossProtection: this.settings.consecutiveLossProtection,
        operationalViabilityFilter: this.settings.operationalViabilityFilter,
        fractionalRiskSizing: this.settings.fractionalRiskSizing,
        dynamicBreakEven: this.settings.dynamicBreakEven,
        postOnlyMakerOrders: this.settings.postOnlyMakerOrders,
        restingOrderTimeout: this.settings.restingOrderTimeout,
        btcMacroFilter: this.settings.btcMacroFilter,
        crossCorrelationFilter: this.settings.crossCorrelationFilter,
        dynamicMakerRepricing: this.settings.dynamicMakerRepricing,
      },
    };
  }

  /**
   * Reseta todo o estado de perdas e circuit breakers (usado em testes automatizados)
   */
  public resetStateForTests() {
    this.dailyHaltedUntil = 0;
    this.consecutiveLossCooldownUntil = 0;
    this.currentConsecutiveLosses = 0;
    this.dailyLossUsdt = 0;
    this.lastResetDay = new Date().getUTCDate();
    this.settings = { ...DEFAULT_PROTECTION_SETTINGS };
    this.resetFillRateTelemetryForTests();
  }
}

export const riskManager = RiskManager.getInstance();
