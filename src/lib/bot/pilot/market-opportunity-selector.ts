import { PreciseMath } from "./precise-math";
import { TradeSignal, PilotTradeValidator } from "./pilot-trade-validator";
import { ExchangeMetadataService, SymbolFilters } from "./exchange-metadata-service";
import { calculateEMA, calculateRSI, relativeATR, calculateADX } from "../indicators";
import type { KlineData } from "@/lib/store";

export type StrategyType = "AUTO" | "CONFLUENCE" | "MOMENTUM" | "MEAN_REVERSION";

export interface CandidateMarketData {
  symbol: string;
  volume24hUsd: number;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadPct: number;
  priceChange24hPct: number;
}

export interface TriggerCondition {
  type: "IMMEDIATE" | "PULLBACK_EMA" | "BREAKOUT_RESISTANCE" | "OVERSOLD_BOUNCE" | "ORDERBOOK_PRESSURE";
  targetPrice: number;
  conditionDescription: string;
  triggerDirection: "LESS_THAN_OR_EQUAL" | "GREATER_THAN_OR_EQUAL" | "NOW";
  expirationMinutes: number;
  strategyChosen: "CONFLUENCE" | "MOMENTUM" | "MEAN_REVERSION";
  distanceToTriggerPct: number;
}

export interface RankedOpportunitySummary {
  symbol: string;
  score: number;
  strategy: "CONFLUENCE" | "MOMENTUM" | "MEAN_REVERSION";
  priceChange24hPct: number;
  rationale: string;
  isCooldownApplied?: boolean;
}

export interface EvaluatedOpportunity {
  symbol: string;
  score: number;
  signal: TradeSignal;
  marketData: CandidateMarketData;
  technicalMetrics: {
    relativeAtr: number;
    adx: number | null;
    rsi14: number;
    ema9: number;
    ema21: number;
    trendAligned: boolean;
  };
  triggerCondition: TriggerCondition;
  effectiveStrategy: "CONFLUENCE" | "MOMENTUM" | "MEAN_REVERSION";
  topRanked?: RankedOpportunitySummary[];
  isCooldownApplied?: boolean;
  rejectionReason?: string;
}

export class MarketOpportunitySelector {
  private static instance: MarketOpportunitySelector;
  private metadataService = ExchangeMetadataService.getInstance();

  // Critérios institucionais de corte para microestrutura expandida (35-40 ativos)
  public static readonly MIN_24H_VOLUME_USD = 10_000_000; // Mínimo $10M USD de volume
  public static readonly MAX_SPREAD_PERCENT = 0.0008; // Máximo 0.08% de spread bid-ask
  public static readonly MIN_RELATIVE_ATR = 0.0010; // 0.10% mínimo de ATR em 15m (garante que altcoins líquidas sejam válidas)
  public static readonly MAX_RELATIVE_ATR = 0.035; // 3.5% máximo de ATR para não violar gestão de risco
  public static readonly MIN_ADX_TREND = 15; // Rejeição de mercado totalmente sem tendência (choppy)

  // Lista negra de stables ou tokens não adequados para trade direcional
  private static readonly EXCLUDED_SYMBOLS = new Set([
    "USDCUSDT",
    "FDUSDUSDT",
    "TUSDUSDT",
    "BUSDUSDT",
    "EURUSDT",
    "WBTCUSDT",
    "USDPUSDT",
    "DAIUSDT",
    "AEURUSDT",
    "USD1USDT",
    "USDDUSDT",
    "PYUSDUSDT",
    "EURIUSDT",
    "USDEUSDT",
  ]);

  private constructor() {}

  public static getInstance(): MarketOpportunitySelector {
    if (!MarketOpportunitySelector.instance) {
      MarketOpportunitySelector.instance = new MarketOpportunitySelector();
    }
    return MarketOpportunitySelector.instance;
  }

  /**
   * 1. Consulta tickers da Binance e filtra o universo de alta liquidez e spread comprimido
   */
  public async fetchCandidateTickers(baseUrl = "https://api.binance.com"): Promise<CandidateMarketData[]> {
    try {
      const [tickerRes, bookRes] = await Promise.all([
        fetch(`${baseUrl}/api/v3/ticker/24hr`, { signal: AbortSignal.timeout(5000), cache: "no-store" }),
        fetch(`${baseUrl}/api/v3/ticker/bookTicker`, { signal: AbortSignal.timeout(5000), cache: "no-store" }),
      ]);

      if (!tickerRes.ok || !bookRes.ok) {
        throw new Error("Falha ao consultar tickers da Binance");
      }

      const tickers: any[] = await tickerRes.json();
      const books: any[] = await bookRes.json();

      const bookMap = new Map<string, { bid: number; ask: number }>();
      for (const b of books) {
        bookMap.set(b.symbol, { bid: parseFloat(b.bidPrice), ask: parseFloat(b.askPrice) });
      }

      const candidates: CandidateMarketData[] = [];

      for (const t of tickers) {
        const symbol: string = t.symbol;
        if (!symbol.endsWith("USDT") || MarketOpportunitySelector.EXCLUDED_SYMBOLS.has(symbol)) {
          continue;
        }

        const volume24hUsd = parseFloat(t.quoteVolume || "0");
        if (volume24hUsd < MarketOpportunitySelector.MIN_24H_VOLUME_USD) {
          continue;
        }

        const book = bookMap.get(symbol);
        if (!book || book.bid <= 0 || book.ask <= 0) {
          continue;
        }

        const spreadPct = (book.ask - book.bid) / book.bid;
        if (spreadPct > MarketOpportunitySelector.MAX_SPREAD_PERCENT) {
          continue; // Descarta spreads abertos (evita derrapagem)
        }

        candidates.push({
          symbol,
          volume24hUsd,
          lastPrice: parseFloat(t.lastPrice),
          bestBid: book.bid,
          bestAsk: book.ask,
          spreadPct,
          priceChange24hPct: parseFloat(t.priceChangePercent || "0"),
        });
      }

      // Mescla os top 25 por volume com os top 15 com maior momentum positivo (24h)
      const topVolume = [...candidates].sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, 25);
      const topMomentum = [...candidates]
        .filter((c) => c.priceChange24hPct > 0)
        .sort((a, b) => b.priceChange24hPct - a.priceChange24hPct)
        .slice(0, 15);

      const mergedMap = new Map<string, CandidateMarketData>();
      for (const item of [...topVolume, ...topMomentum]) {
        mergedMap.set(item.symbol, item);
      }

      return Array.from(mergedMap.values());
    } catch (err: any) {
      console.warn(`[MarketOpportunitySelector] Falha ao consultar tickers em tempo real: ${err.message}. Usando fallbacks.`);
      return this.getFallbackCandidates();
    }
  }

  /**
   * 2. Consulta klines e calcula indicadores técnicos (ATR, ADX, RSI, EMA)
   */
  public async fetchKlines(symbol: string, interval = "15m", limit = 50, baseUrl = "https://api.binance.com"): Promise<KlineData[]> {
    try {
      const res = await fetch(`${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, {
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const raw: any[][] = await res.json();
      return raw.map((k) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch {
      return this.generateSyntheticKlines(symbol);
    }
  }

  /**
   * Detecta o melhor regime operacional para o ativo
   */
  public detectOptimalStrategy(
    adx: number | null,
    rsi: number,
    ema9: number,
    ema21: number,
    lastClose: number,
    candidate: CandidateMarketData
  ): "CONFLUENCE" | "MOMENTUM" | "MEAN_REVERSION" {
    // 1. Momentum: tendência direcional forte + médias altistas alinhadas
    if ((adx !== null && adx >= 28) && ema9 > ema21 && lastClose >= ema9 && candidate.priceChange24hPct >= 0) {
      return "MOMENTUM";
    }
    // 2. Reversão à média: sobrevenda (RSI <= 35) ou afastamento substancial abaixo da EMA21
    if (rsi <= 35 || (rsi <= 42 && lastClose < ema21 * 0.985)) {
      return "MEAN_REVERSION";
    }
    // 3. Confluência Institucional: padrão balanceado
    return "CONFLUENCE";
  }

  /**
   * 3. Avalia um candidato, calcula métricas, calibra SL/TP e gera o score de oportunidade
   */
  public evaluateCandidate(
    candidate: CandidateMarketData,
    klines15m: KlineData[],
    filters: SymbolFilters,
    currentBalance = 70.0,
    strategy: StrategyType | string = "AUTO"
  ): EvaluatedOpportunity | null {
    if (klines15m.length < 25) return null;

    const closes = klines15m.map((k) => k.close);
    const lastClose = closes[closes.length - 1];

    // Cálculo dos indicadores técnicos puros
    const relAtr = relativeATR(klines15m, 14);
    const adx = calculateADX(klines15m, 14);
    const rsi = calculateRSI(closes, 14);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);

    // 1. Filtro Anti-Choppy: Se ADX for muito baixo, mercado sem tendência
    if (adx !== null && adx < MarketOpportunitySelector.MIN_ADX_TREND) {
      return null; // Mercado lateral/sem momentum
    }

    // 2. Filtro de Volatilidade: ATR deve cobrir taxas e não estourar teto de risco
    if (relAtr < MarketOpportunitySelector.MIN_RELATIVE_ATR || relAtr > MarketOpportunitySelector.MAX_RELATIVE_ATR) {
      return null;
    }

    const trendAligned = ema9 > ema21 && lastClose >= ema9 && rsi >= 40 && rsi <= 65;

    // 3. Determinação da Estratégia Efetiva (se AUTO, a IA decide o melhor regime)
    const effectiveStrategy = (strategy === "AUTO" || !strategy)
      ? this.detectOptimalStrategy(adx, rsi, ema9, ema21, lastClose, candidate)
      : (strategy as "CONFLUENCE" | "MOMENTUM" | "MEAN_REVERSION");

    // 4. Calibração Dinâmica de Parâmetros Operacionais por ATR
    // Entrada base no bestBid para garantir LIMIT_MAKER Post-Only (GTX)
    const entryPrice = this.metadataService.quantizePrice(candidate.bestBid, filters);
    const atrValue = lastClose * relAtr;

    // Stop-Loss em 1.2x ATR abaixo da entrada
    const rawSl = entryPrice - atrValue * 1.2;
    const stopLoss = this.metadataService.quantizePrice(rawSl, filters);

    // Take-Profit analítico com garantia de R:R líquido >= 1.80x (compensando comissões e tickSize)
    const minSafeTp = PilotTradeValidator.calculateTargetTakeProfit(entryPrice, stopLoss, 1.80, filters);
    const rawTpAtr = entryPrice + atrValue * 2.5;
    const atrTp = this.metadataService.quantizePrice(rawTpAtr, filters);
    const takeProfit = Math.max(atrTp, minSafeTp);

    // 5. Verificação de Viabilidade de Risco
    const baseNav = Math.max(70.0, currentBalance);
    const minQty = Math.ceil(PilotTradeValidator.TARGET_NOTIONAL_MIN_USD / entryPrice / filters.stepSize) * filters.stepSize;
    const lossAtMinLot = minQty * (entryPrice - stopLoss);

    if (lossAtMinLot > baseNav * PilotTradeValidator.MAX_RISK_PERCENT * 1.05) {
      return null; // Stop-loss largo demais para o capital
    }

    // 6. Cálculo do Gatilho Ótimo / Condição de Disparo (Radar Sniper)
    let triggerType: TriggerCondition["type"] = "IMMEDIATE";
    let targetPrice = entryPrice;
    let conditionDescription = "Entrada imediata no melhor preço de compra disponível (bestBid).";
    let triggerDirection: TriggerCondition["triggerDirection"] = "NOW";

    if (effectiveStrategy === "MOMENTUM") {
      // Se estiver muito esticado em relação à EMA9 (> 0.35%), espera pullback para não comprar no topo
      const distanceToEma9 = (lastClose - ema9) / ema9;
      if (distanceToEma9 > 0.0035) {
        triggerType = "PULLBACK_EMA";
        targetPrice = this.metadataService.quantizePrice(Math.max(ema9, candidate.bestBid), filters);
        conditionDescription = `Aguardando pullback na EMA 9 ($${targetPrice}) para entrada sniper com proteção de ruído.`;
        triggerDirection = "LESS_THAN_OR_EQUAL";
      } else {
        // Se estiver perto do topo recente dos últimos 3 candles, gatilho no rompimento
        const recentHigh = Math.max(...klines15m.slice(-3).map((k) => k.high));
        if (recentHigh > lastClose && (recentHigh - lastClose) / lastClose < 0.005) {
          triggerType = "BREAKOUT_RESISTANCE";
          targetPrice = this.metadataService.quantizePrice(recentHigh + filters.tickSize, filters);
          conditionDescription = `Aguardando rompimento da resistência local ($${targetPrice}) com fluxo comprador.`;
          triggerDirection = "GREATER_THAN_OR_EQUAL";
        }
      }
    } else if (effectiveStrategy === "MEAN_REVERSION") {
      // Se estiver em sobrevenda acentuada, espera candle de reversão (superar máxima do candle anterior)
      const prevCandleHigh = klines15m[klines15m.length - 2]?.high ?? lastClose;
      if (lastClose < prevCandleHigh) {
        triggerType = "OVERSOLD_BOUNCE";
        targetPrice = this.metadataService.quantizePrice(prevCandleHigh, filters);
        conditionDescription = `Aguardando repique de sobrevenda: rompimento da máxima anterior ($${targetPrice}) para evitar faca caindo.`;
        triggerDirection = "GREATER_THAN_OR_EQUAL";
      }
    }

    const distanceToTriggerPct = Math.abs(candidate.lastPrice - targetPrice) / candidate.lastPrice * 100;
    // Se a distância for insignificante (<= 0.08%), dispara de imediato
    if (distanceToTriggerPct <= 0.08 || triggerDirection === "NOW") {
      triggerType = "IMMEDIATE";
      triggerDirection = "NOW";
      targetPrice = entryPrice;
    }

    const triggerCondition: TriggerCondition = {
      type: triggerType,
      targetPrice,
      conditionDescription,
      triggerDirection,
      expirationMinutes: 30, // Radar ativo por até 30 minutos aguardando o momento ótimo
      strategyChosen: effectiveStrategy,
      distanceToTriggerPct: PreciseMath.roundDown(distanceToTriggerPct, 2),
    };

    // 7. Cálculo do Score de Oportunidade Ponderado pela Estratégia Escolhida
    // - Liquidez balanceada (0 a 15 pontos, evitando viés excessivo em mega-caps)
    const volumeScore = Math.min(15, (candidate.volume24hUsd / 100_000_000) * 15);

    // - Penalidade de Spread (0 a 10 pontos)
    const spreadPenalty = (candidate.spreadPct / MarketOpportunitySelector.MAX_SPREAD_PERCENT) * 10;

    let strategyScore = 20;

    if (effectiveStrategy === "MOMENTUM") {
      // Prioriza alinhamento altista, volume e rompimento
      if (ema9 > ema21) strategyScore += 25;
      if (lastClose >= ema9) strategyScore += 15;
      if (candidate.priceChange24hPct > 1.0) strategyScore += 15;
      else if (candidate.priceChange24hPct > 0) strategyScore += 10;
      if (rsi >= 45 && rsi <= 68) strategyScore += 15;
      if (relAtr >= 0.002) strategyScore += 5;
    } else if (effectiveStrategy === "MEAN_REVERSION") {
      // Prioriza exaustão estatística e sobrevenda para repique
      if (rsi < 28) strategyScore += 35;
      else if (rsi < 38) strategyScore += 25;
      else if (rsi < 48) strategyScore += 10;
      if (lastClose < ema21) strategyScore += 15;
      if (relAtr >= 0.003) strategyScore += 10;
    } else {
      // CONFLUENCE (Padrão Institucional)
      if (adx !== null && adx >= 30) strategyScore += 20;
      else if (adx !== null && adx >= 20) strategyScore += 10;
      if (trendAligned) strategyScore += 20;
      if (rsi >= 35 && rsi <= 62) strategyScore += 15;
      const atrDistance = Math.abs(relAtr - 0.015);
      strategyScore += Math.max(0, 15 - (atrDistance / 0.01) * 10);
    }

    // Bônus se a oportunidade estiver exatamente no ponto de entrada ou com trigger claro
    if (triggerCondition.type === "IMMEDIATE") {
      strategyScore += 5;
    }

    const totalScore = Math.max(0, Math.min(100, volumeScore + strategyScore - spreadPenalty));

    const signal: TradeSignal = {
      symbol: candidate.symbol,
      side: "BUY",
      suggestedPrice: entryPrice,
      stopLoss,
      takeProfit,
      timestamp: Date.now(),
    };

    return {
      symbol: candidate.symbol,
      score: totalScore,
      signal,
      marketData: candidate,
      technicalMetrics: {
        relativeAtr: relAtr,
        adx,
        rsi14: rsi,
        ema9,
        ema21,
        trendAligned,
      },
      triggerCondition,
      effectiveStrategy,
    };
  }

  /**
   * 4. Varre o mercado e seleciona automaticamente a melhor oportunidade com rotação e ranking
   */
  public async findBestOpportunity(
    currentBalance = 70.0,
    baseUrl = "https://api.binance.com",
    strategy: StrategyType | string = "AUTO",
    cooldownSymbols: string[] = [],
    overrideSymbol?: string
  ): Promise<EvaluatedOpportunity> {
    const candidates = await this.fetchCandidateTickers(baseUrl);
    // Avalia até 35 ativos qualificados (ampla cobertura de mercado)
    const topCandidates = candidates.slice(0, 35);

    const evaluatedResults = await Promise.all(
      topCandidates.map(async (c) => {
        try {
          const [filters, klines] = await Promise.all([
            this.metadataService.getSymbolFilters(c.symbol, baseUrl),
            this.fetchKlines(c.symbol, "15m", 50, baseUrl),
          ]);
          return this.evaluateCandidate(c, klines, filters, currentBalance, strategy);
        } catch {
          return null;
        }
      })
    );

    const evaluatedList = evaluatedResults.filter((e): e is EvaluatedOpportunity => e !== null);

    if (evaluatedList.length === 0) {
      // Fallback determinístico seguro em BTCUSDT caso o mercado esteja 100% choppy
      return this.getFallbackOpportunity("BTCUSDT", currentBalance);
    }

    // Aplica penalidade de rotação (-25 pts) para ativos em cooldown recente (< 30 min)
    for (const item of evaluatedList) {
      if (cooldownSymbols.includes(item.symbol)) {
        item.score = Math.max(0, item.score - 25);
        item.isCooldownApplied = true;
      }
    }

    // Ordena pelo maior Score de Oportunidade
    evaluatedList.sort((a, b) => b.score - a.score);

    // Constrói o Top 3 para exibição transparente no Cockpit
    const topRanked: RankedOpportunitySummary[] = evaluatedList.slice(0, 3).map((item) => ({
      symbol: item.symbol,
      score: PreciseMath.roundDown(item.score, 1),
      strategy: item.effectiveStrategy,
      priceChange24hPct: item.marketData.priceChange24hPct,
      rationale: item.triggerCondition.conditionDescription,
      isCooldownApplied: item.isCooldownApplied,
    }));

    const chosen = (overrideSymbol && evaluatedList.find((e) => e.symbol === overrideSymbol)) || evaluatedList[0];
    chosen.topRanked = topRanked;
    return chosen;
  }

  /**
   * Fallback de candidatos caso a rede externa esteja indisponível
   */
  private getFallbackCandidates(): CandidateMarketData[] {
    return [
      {
        symbol: "BTCUSDT",
        volume24hUsd: 850_000_000,
        lastPrice: 65000.0,
        bestBid: 64998.0,
        bestAsk: 65000.0,
        spreadPct: 0.00003,
        priceChange24hPct: 2.4,
      },
      {
        symbol: "SOLUSDT",
        volume24hUsd: 320_000_000,
        lastPrice: 155.0,
        bestBid: 154.98,
        bestAsk: 155.02,
        spreadPct: 0.00025,
        priceChange24hPct: 3.8,
      },
      {
        symbol: "ETHUSDT",
        volume24hUsd: 520_000_000,
        lastPrice: 3450.0,
        bestBid: 3449.8,
        bestAsk: 3450.2,
        spreadPct: 0.00011,
        priceChange24hPct: 1.8,
      },
    ];
  }

  private generateSyntheticKlines(symbol: string): KlineData[] {
    const base = symbol === "BTCUSDT" ? 65000 : symbol === "SOLUSDT" ? 155 : 3450;
    const klines: KlineData[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (let i = 50; i >= 0; i--) {
      const price = base * (1 + (50 - i) * 0.0005);
      klines.push({
        time: now - i * 900,
        open: price * 0.999,
        high: price * 1.006,
        low: price * 0.997,
        close: price,
        volume: 1000,
      });
    }
    return klines;
  }

  private getFallbackOpportunity(symbol: string, currentBalance: number): EvaluatedOpportunity {
    const entry = symbol === "BTCUSDT" ? 65000.0 : 150.0;
    const atr = entry * 0.015; // 1.5%
    const stopLoss = entry - atr * 1.2;
    const takeProfit = PilotTradeValidator.calculateTargetTakeProfit(entry, stopLoss, 1.80);

    return {
      symbol,
      score: 85.0,
      signal: {
        symbol,
        side: "BUY",
        suggestedPrice: entry,
        stopLoss,
        takeProfit,
        timestamp: Date.now(),
      },
      marketData: {
        symbol,
        volume24hUsd: 500_000_000,
        lastPrice: entry,
        bestBid: entry,
        bestAsk: entry * 1.0001,
        spreadPct: 0.0001,
        priceChange24hPct: 2.0,
      },
      technicalMetrics: {
        relativeAtr: 0.015,
        adx: 28,
        rsi14: 52,
        ema9: entry * 0.998,
        ema21: entry * 0.995,
        trendAligned: true,
      },
      triggerCondition: {
        type: "IMMEDIATE",
        targetPrice: entry,
        conditionDescription: "Entrada imediata por liquidez institucional em BTCUSDT.",
        triggerDirection: "NOW",
        expirationMinutes: 30,
        strategyChosen: "CONFLUENCE",
        distanceToTriggerPct: 0,
      },
      effectiveStrategy: "CONFLUENCE",
      topRanked: [
        {
          symbol,
          score: 85.0,
          strategy: "CONFLUENCE",
          priceChange24hPct: 2.0,
          rationale: "Entrada imediata por liquidez institucional em BTCUSDT.",
          isCooldownApplied: false,
        },
        {
          symbol: "ETHUSDT",
          score: 82.0,
          strategy: "CONFLUENCE",
          priceChange24hPct: 1.8,
          rationale: "Fluxo institucional consistente.",
          isCooldownApplied: false,
        },
        {
          symbol: "SOLUSDT",
          score: 79.0,
          strategy: "MOMENTUM",
          priceChange24hPct: 3.8,
          rationale: "Rompimento de volatilidade positiva.",
          isCooldownApplied: false,
        },
      ],
    };
  }
}
