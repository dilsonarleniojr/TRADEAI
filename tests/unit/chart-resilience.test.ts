import { describe, it, expect, mock } from "bun:test";
import {
  generate1DHeatmapPaletteData,
  create1DTexturePalette,
  PALETTE_1D_WIDTH,
  PALETTE_1D_HEIGHT,
} from "@/lib/performance/l2-heatmap-shader";
import { calculateOrderBookImbalance } from "@/lib/order-book-imbalance";

describe("Chart Section & Microstructure Resilience", () => {
  it("should generate a valid 1D palette dataset of 256x1 RGBA entries", () => {
    const palette = generate1DHeatmapPaletteData();
    expect(palette.length).toBe(PALETTE_1D_WIDTH * 4);
    // Bids volume zero should have low/zero intensity
    expect(palette[3]).toBe(0); // alpha of index 0
    // Asks volume zero should have low/zero intensity
    expect(palette[128 * 4 + 3]).toBe(0); // alpha of index 128
    // Max bids should have high alpha
    expect(palette[127 * 4 + 3]).toBeGreaterThan(200);
    // Max asks should have high alpha
    expect(palette[255 * 4 + 3]).toBeGreaterThan(200);
  });

  it("should configure dynamic mipmap and anisotropic filtering on WebGL context", () => {
    const texParams: Record<number, number> = {};
    const texParamf: Record<number, number> = {};
    let mipmapGenerated = false;

    const mockExtAniso = {
      TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe,
      MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
    };

    const mockGl = {
      TEXTURE_2D: 0x0de1,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      LINEAR: 0x2601,
      LINEAR_MIPMAP_LINEAR: 0x2703,
      CLAMP_TO_EDGE: 0x812f,
      createTexture: () => ({ id: "mock_texture" }),
      bindTexture: mock(() => {}),
      texImage2D: mock(() => {}),
      generateMipmap: mock(() => {
        mipmapGenerated = true;
      }),
      texParameteri: mock((target: number, pname: number, param: number) => {
        texParams[pname] = param;
      }),
      texParameterf: mock((target: number, pname: number, param: number) => {
        texParamf[pname] = param;
      }),
      getExtension: mock((name: string) => {
        if (name === "EXT_texture_filter_anisotropic") return mockExtAniso;
        return null;
      }),
      getParameter: mock((pname: number) => {
        if (pname === mockExtAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) return 8;
        return 0;
      }),
    } as unknown as WebGL2RenderingContext;

    const texture = create1DTexturePalette(mockGl);
    expect(texture).not.toBeNull();
    expect(mipmapGenerated).toBe(true);
    expect(texParams[mockGl.TEXTURE_MIN_FILTER]).toBe(mockGl.LINEAR_MIPMAP_LINEAR);
    expect(texParams[mockGl.TEXTURE_MAG_FILTER]).toBe(mockGl.LINEAR);
    expect(texParamf[mockExtAniso.TEXTURE_MAX_ANISOTROPY_EXT]).toBe(4);
  });

  it("should safely compute order book imbalance even when orderbook arrays are empty or incomplete", () => {
    const emptyResult = calculateOrderBookImbalance([], []);
    expect(emptyResult.skewRatio).toBe(1.0);
    expect(emptyResult.confluenceSignal).toBe("NEUTRAL");
    expect(Number.isFinite(emptyResult.skewRatio)).toBe(true);

    const normalResult = calculateOrderBookImbalance(
      [{ price: 100, volume: 10 }],
      [{ price: 101, volume: 2 }]
    );
    expect(normalResult.skewRatio).toBeGreaterThan(1);
    expect(normalResult.confluenceSignal).toBe("BULLISH");
  });

  it("should guard trade markers against undefined pnl, mode and symbol", () => {
    // Simulates trade item without pnl or mode (such as an open BUY order)
    const rawTrade = {
      id: "trade-1",
      side: "BUY" as const,
      price: 65000,
      quantity: 0.1,
      timestamp: Date.now(),
      // pnl: undefined
      // mode: undefined
      // symbol: undefined
    };

    const safePnlStr =
      typeof (rawTrade as any).pnl === "number" && Number.isFinite((rawTrade as any).pnl)
        ? `${(rawTrade as any).pnl >= 0 ? "+" : ""}${(rawTrade as any).pnl.toFixed(2)} USD`
        : "N/A";

    const safeMode = ((rawTrade as any).mode || "SIM").toUpperCase();
    const safeSymbol = ((rawTrade as any).symbol || "BTCUSDT").replace("USDT", "");

    expect(safePnlStr).toBe("N/A");
    expect(safeMode).toBe("SIM");
    expect(safeSymbol).toBe("BTC");
  });
});
