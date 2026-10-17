/**
 * CurrencyPairNormalizer
 * 
 * Implementação de acordo com o padrão interbancário e ISO 4217:
 * - Hierarquia de prioridade cambial: EUR > GBP > AUD > NZD > USD > CAD > CHF > JPY
 * - Cotações com stablecoins e crypto (USDT, USDC, BUSD, BTC, ETH) normalizadas sem inversão indevida
 * - Inversão cruzada estrita de cotações invertidas:
 *     Bid_std = 1 / Ask_inv
 *     Ask_std = 1 / Bid_inv
 * - Detecção de book cruzado (crossed market) e cálculo preciso de spread e pips
 */

export type QuoteClassification = 'STANDARD' | 'INVERTED' | 'UNCLASSIFIED';

export interface RawQuoteInput {
  rawSymbol: string;
  bidPrice: number;
  askPrice: number;
  vendorId?: string;
}

export interface NormalizedQuoteResult {
  rawSymbol: string;
  normalizedSymbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  classification: QuoteClassification;
  isInverted: boolean;
  isCrossed: boolean;
  bidPrice: number;
  askPrice: number;
  spreadPrice: number;
  spreadPips: number | null;
  pipSize: number | null;
}

export class CurrencyPairNormalizer {
  // Ranking padrão interbancário ISO 4217 (índice menor = maior prioridade como base currency)
  private static readonly MAJOR_FX_RANKING: string[] = [
    'EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'
  ];

  // Stablecoins e moedas de cotação em cripto
  private static readonly CRYPTO_QUOTE_CURRENCIES = new Set([
    'USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USD', 'DAI', 'EUR'
  ]);

  /**
   * Divide e extrai base e quote de um símbolo em formato flexível (ex: BTCUSDT, EUR/USD, USD-JPY)
   */
  public static parseSymbol(raw: string): { base: string; quote: string } | null {
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.trim().toUpperCase();

    // Caso possua delimitadores comuns
    const delimiterMatch = clean.match(/^([A-Z0-9]{2,10})[\/\_\-\.\:\s]([A-Z0-9]{2,10})$/);
    if (delimiterMatch) {
      return { base: delimiterMatch[1], quote: delimiterMatch[2] };
    }

    // Caso clássico de Crypto Binance (ex: BTCUSDT, SOLUSDT, ETHBTC)
    for (const q of this.CRYPTO_QUOTE_CURRENCIES) {
      if (clean.endsWith(q) && clean.length > q.length) {
        const base = clean.slice(0, clean.length - q.length);
        return { base, quote: q };
      }
    }

    // Caso de 6 caracteres FX clássico (ex: EURUSD, USDJPY)
    if (clean.length === 6) {
      return { base: clean.slice(0, 3), quote: clean.slice(3, 6) };
    }

    return null;
  }

  /**
   * Normaliza uma cotação bruta aplicando as regras interbancárias e de microestrutura
   */
  public static normalizeQuote(input: RawQuoteInput): NormalizedQuoteResult {
    const { rawSymbol, bidPrice, askPrice } = input;

    // Validação estrita de valores positivos e finitos
    if (!Number.isFinite(bidPrice) || !Number.isFinite(askPrice) || bidPrice <= 0 || askPrice <= 0) {
      throw new Error(`[CurrencyPairNormalizer] Preços inválidos para ${rawSymbol}: bid=${bidPrice}, ask=${askPrice}`);
    }

    const parsed = this.parseSymbol(rawSymbol);
    if (!parsed) {
      throw new Error(`[CurrencyPairNormalizer] Não foi possível fazer o parse do par ${rawSymbol}`);
    }

    const { base: cur1, quote: cur2 } = parsed;

    if (cur1 === cur2) {
      throw new Error(`[CurrencyPairNormalizer] Par não pode conter a mesma moeda em ambas as pernas: ${rawSymbol}`);
    }

    // Checagem de book cruzado (crossed book)
    const isCrossed = bidPrice > askPrice;

    // Verificar se ambas as pernas estão no ranking de Forex Maior
    const idx1 = this.MAJOR_FX_RANKING.indexOf(cur1);
    const idx2 = this.MAJOR_FX_RANKING.indexOf(cur2);

    let classification: QuoteClassification = 'UNCLASSIFIED';
    let normalizedBase = cur1;
    let normalizedQuote = cur2;
    let normBid = bidPrice;
    let normAsk = askPrice;

    if (idx1 !== -1 && idx2 !== -1) {
      // Ambas são moedas FX com ranking definido
      if (idx1 < idx2) {
        classification = 'STANDARD';
      } else {
        classification = 'INVERTED';
        normalizedBase = cur2;
        normalizedQuote = cur1;

        // Inversão Cruzada Estrita (Cross-Inversion):
        // Bid_std = 1 / Ask_inv
        // Ask_std = 1 / Bid_inv
        normBid = 1 / askPrice;
        normAsk = 1 / bidPrice;
      }
    } else {
      // Pelo menos uma moeda não está no ranking Major FX (ex: Criptoativos como BTC, SOL, ZEC ou moedas exóticas)
      // Conforme a regra da skill: UNCLASSIFIED deve passar direto sem inversão indevida
      classification = 'UNCLASSIFIED';
    }

    const normalizedSymbol = `${normalizedBase}${normalizedQuote}`;
    const spreadPrice = normAsk - normBid;

    // Cálculo do tamanho do pip baseado na moeda de cotação normalizada
    let pipSize: number | null = null;
    let spreadPips: number | null = null;

    if (classification !== 'UNCLASSIFIED') {
      pipSize = normalizedQuote === 'JPY' ? 0.01 : 0.0001;
      spreadPips = spreadPrice / pipSize;
    }

    return {
      rawSymbol,
      normalizedSymbol,
      baseCurrency: normalizedBase,
      quoteCurrency: normalizedQuote,
      classification,
      isInverted: classification === 'INVERTED',
      isCrossed,
      bidPrice: normBid,
      askPrice: normAsk,
      spreadPrice,
      spreadPips,
      pipSize,
    };
  }
}
