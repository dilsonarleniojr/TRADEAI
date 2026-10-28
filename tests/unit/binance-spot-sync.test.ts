import { describe, expect, it } from "bun:test";
import {
  isTokenizedStockSymbol,
  isTradableBinanceSpotSymbol,
  filterValidBinanceSpotTickers,
  quantizeToBinanceTick,
  VERIFIED_FALLBACK_SPOT_SYMBOLS,
} from "@/lib/binance-spot-sync";
import { CRYPTO_LIST } from "@/lib/crypto-meta";

describe("Binance Spot Synchronization & Eligibility Guardrails", () => {
  it("blocks restricted *BUSDT tokenized stocks/ETFs (TRD_GRP_261) while allowing legitimate *BUSDT cryptos", () => {
    const restrictedTokenizedEquities = [
      "SOXLBUSDT",
      "SNDKBUSDT",
      "SKHYBUSDT",
      "CRCLBUSDT",
      "MUBUSDT",
      "SPCXBUSDT",
      "KORUBUSDT",
      "NVDABUSDT",
      "TSLABUSDT",
      "AAPLBUSDT",
      "MSTRBUSDT",
      "GOOGLBUSDT",
      "AMDBUSDT",
      "INTCBUSDT",
      "COINBUSDT",
      "QQQBUSDT",
      "TQQQBUSDT",
      "SPYBUSDT",
    ];

    for (const sym of restrictedTokenizedEquities) {
      expect(isTokenizedStockSymbol(sym)).toBe(true);
      expect(isTradableBinanceSpotSymbol(sym)).toBe(false);
    }

    const legitimateCryptosEndingInBusdt = [
      "BNBUSDT",
      "ARBUSDT",
      "SHIBUSDT",
      "TRBUSDT",
      "CKBUSDT",
      "BBUSDT",
    ];

    for (const sym of legitimateCryptosEndingInBusdt) {
      expect(isTokenizedStockSymbol(sym)).toBe(false);
      expect(isTradableBinanceSpotSymbol(sym)).toBe(true);
    }
  });

  it("blocks stablecoins, fiat-pegged, gold-pegged, wrapped tokens, and non-ASCII symbols", () => {
    const invalidPairs = [
      "USDCUSDT",
      "FDUSDUSDT",
      "UUSDT",
      "XUSDUSDT",
      "RLUSDUSDT",
      "RWUSDUSDT",
      "BFUSDUSDT",
      "USD1USDT",
      "USDSUSDT",
      "USDEUSDT",
      "PAXGUSDT",
      "XAUTUSDT",
      "EURUSDT",
      "EURIUSDT",
      "AEURUSDT",
      "WBTCUSDT",
      "WBETHUSDT",
      "BNSOLUSDT",
      "币安人生USDT",
      "牛来USDT",
      "BTCUPUSDT",
      "ETHDOWNUSDT",
    ];

    for (const sym of invalidPairs) {
      expect(isTradableBinanceSpotSymbol(sym)).toBe(false);
    }
  });

  it("blocks delisted, halted (BREAK), and futures-only symbols", () => {
    const delistedOrBreakSymbols = [
      "TONUSDT",
      "HNTUSDT",
      "STORJUSDT",
      "GLMUDST",
      "OMUSDT",
      "MKRUSDT",
      "TRUUSDT",
      "CTCUSDT",
      "PHBUSDT",
      "NFPUSDT",
      "CTXCUSDT",
      "EOSUSDT",
      "KASUSDT",
      "MATICUSDT",
      "RNDRUSDT",
      "FTMUSDT",
      "KLAYUSDT",
    ];

    for (const sym of delistedOrBreakSymbols) {
      expect(isTradableBinanceSpotSymbol(sym)).toBe(false);
    }
  });

  it("rejects tickers with zero bid/ask (BREAK status on Binance Spot) or flat $1.00 stablecoin peg", () => {
    expect(
      isTradableBinanceSpotSymbol("SOLUSDT", {
        lastPrice: "150.00",
        bidPrice: "0.00000000",
        askPrice: "0.00000000",
        quoteVolume: "10000000",
      })
    ).toBe(false);

    expect(
      isTradableBinanceSpotSymbol("NEWSTABLEUSDT", {
        lastPrice: "1.0001",
        highPrice: "1.0005",
        lowPrice: "0.9998",
        bidPrice: "1.0000",
        askPrice: "1.0002",
        quoteVolume: "50000000",
      })
    ).toBe(false);

    expect(
      isTradableBinanceSpotSymbol("SOLUSDT", {
        lastPrice: "152.40",
        highPrice: "158.00",
        lowPrice: "146.50",
        bidPrice: "152.39",
        askPrice: "152.41",
        quoteVolume: "450000000",
      })
    ).toBe(true);
  });

  it("validates all symbols in CRYPTO_LIST and VERIFIED_FALLBACK_SPOT_SYMBOLS", () => {
    for (const item of CRYPTO_LIST) {
      expect(isTradableBinanceSpotSymbol(item.symbol)).toBe(true);
    }
    for (const sym of VERIFIED_FALLBACK_SPOT_SYMBOLS) {
      expect(isTradableBinanceSpotSymbol(sym)).toBe(true);
    }
  });

  it("quantizes prices accurately to Binance tickSize", () => {
    expect(quantizeToBinanceTick(67891.23456, 0.01)).toBe(67891.23);
    expect(quantizeToBinanceTick(1.84567, 0.0001)).toBe(1.8457);
    expect(quantizeToBinanceTick(1.84567, 0.001, "floor")).toBe(1.845);
    expect(quantizeToBinanceTick(1.84512, 0.001, "ceil")).toBe(1.846);
  });

  it("filters ticker arrays keeping only tradable Binance Spot pairs", () => {
    const sample = [
      { symbol: "BTCUSDT", lastPrice: "68000", bidPrice: "67999", askPrice: "68001", quoteVolume: "900000000" },
      { symbol: "SOXLBUSDT", lastPrice: "35.2", bidPrice: "35.1", askPrice: "35.3", quoteVolume: "15000000" },
      { symbol: "SNDKBUSDT", lastPrice: "48.1", bidPrice: "48.0", askPrice: "48.2", quoteVolume: "12000000" },
      { symbol: "UUSDT", lastPrice: "1.0000", bidPrice: "0.9999", askPrice: "1.0001", quoteVolume: "80000000" },
      { symbol: "TONUSDT", lastPrice: "5.10", bidPrice: "0.00", askPrice: "0.00", quoteVolume: "0" },
      { symbol: "SUIUSDT", lastPrice: "2.15", bidPrice: "2.149", askPrice: "2.151", quoteVolume: "250000000" },
    ];
    const filtered = filterValidBinanceSpotTickers(sample);
    expect(filtered.map((f) => f.symbol)).toEqual(["BTCUSDT", "SUIUSDT"]);
  });
});
