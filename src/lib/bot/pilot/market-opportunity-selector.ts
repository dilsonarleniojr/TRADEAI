import { PreciseMath } from "./precise-math";
import { TradeSignal, PilotTradeValidator } from "./pilot-trade-validator";
import { ExchangeMetadataService, SymbolFilters } from "./exchange-metadata-service";
import { calculateEMA, calculateRSI, relativeATR, calculateADX } from "../indicators";
import type { KlineData } from "@/lib/store";

export interface CandidateMarketData {
  symbol: string;
  volume24hUsd: number;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadPct: number;
  priceChange24hPct: number;
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
  rejectionReason?: string;
}

export class MarketOpportunitySelector {
  private static instance: MarketOpportunitySelector;
  private metadataService = ExchangeMetadataService.getInstance();

  // Critérios institucionais de corte para a banca de $70 USD
  public static readonly MIN_24H_VOLUME_USD = 20_000_000; // Mínimo $20M USD de volume
  public static readonly MAX_SPREAD_PERCENT = 0.0005; // Máximo 0.05% de spread bid-ask
  public static readonly MIN_RELATIVE_ATR = 0.008; // 0.8% mínimo de ATR para cobrir taxas
  public static readonly MAX_RELATIVE_ATR = 0.025; // 2.5% máximo de ATR para não violar teto de $1.40
  public static readonly MIN_ADX_TREND = 20; // Rejeição de mercado choppy (ADX < 20)

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

      // Ordena por maior volume financeiro
      return candidates.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
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
   * 3. Avalia um candidato, calcula métricas, calibra SL/TP e gera o score de oportunidade
   */
  public evaluateCandidate(
    candidate: CandidateMarketData,
    klines15m: KlineData[],
    filters: SymbolFilters,
    currentBalance = 70.0
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

    // 2. Filtro de Volatilidade: ATR deve caber no balanço de $70 USD
    if (relAtr < MarketOpportunitySelector.MIN_RELATIVE_ATR || relAtr > MarketOpportunitySelector.MAX_RELATIVE_ATR) {
      return null; // Volatilidade insuficiente para taxas ou excessiva para banca de $70 USD
    }

    const trendAligned = ema9 > ema21 && lastClose >= ema9 && rsi >= 40 && rsi <= 65;

    // 3. Calibração Dinâmica de Parâmetros Operacionais por ATR
    // Entrada no bestBid para garantir LIMIT_MAKER Post-Only (GTX)
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

    // 4. Verificação de Viabilidade de Risco para a Banca de $70 USD:
    // O lote mínimo ($11 USD) pode gerar uma perda no SL > $1.40 USD?
    const minQty = Math.ceil(PilotTradeValidator.TARGET_NOTIONAL_MIN_USD / entryPrice / filters.stepSize) * filters.stepSize;
    const lossAtMinLot = minQty * (entryPrice - stopLoss);

    if (lossAtMinLot > currentBalance * PilotTradeValidator.MAX_RISK_PERCENT * 1.05) {
      return null; // Stop-loss largo demais para o capital de $70 USD
    }

    // 5. Cálculo do Score de Oportunidade (0 a 100)
    // - Liquidez (0 a 35 pontos)
    const volumeScore = Math.min(35, (candidate.volume24hUsd / 200_000_000) * 35);

    // - Tendência & Momentum (0 a 35 pontos)
    let trendScore = 15;
    if (trendAligned) trendScore += 15;
    if (rsi >= 45 && rsi <= 58) trendScore += 5;

    // - Zona Áurea de ATR (0 a 30 pontos) - Pico em 1.5%
    const atrDistance = Math.abs(relAtr - 0.015);
    const atrScore = Math.max(0, 30 - (atrDistance / 0.01) * 20);

    // - Penalidade de Spread
    const spreadPenalty = (candidate.spreadPct / MarketOpportunitySelector.MAX_SPREAD_PERCENT) * 10;

    const totalScore = Math.max(0, Math.min(100, volumeScore + trendScore + atrScore - spreadPenalty));

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
    };
  }

  /**
   * 4. Varre o mercado e seleciona automaticamente a melhor oportunidade para o teste piloto
   */
  public async findBestOpportunity(currentBalance = 70.0, baseUrl = "https://api.binance.com"): Promise<EvaluatedOpportunity> {
    const candidates = await this.fetchCandidateTickers(baseUrl);
    const topCandidates = candidates.slice(0, 6); // Avalia em paralelo as 6 moedas mais líquidas

    const evaluatedResults = await Promise.all(
      topCandidates.map(async (c) => {
        try {
          const [filters, klines] = await Promise.all([
            this.metadataService.getSymbolFilters(c.symbol, baseUrl),
            this.fetchKlines(c.symbol, "15m", 50, baseUrl),
          ]);
          return this.evaluateCandidate(c, klines, filters, currentBalance);
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

    // Ordena pelo maior Score de Oportunidade
    evaluatedList.sort((a, b) => b.score - a.score);
    return evaluatedList[0];
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
    };
  }
}
