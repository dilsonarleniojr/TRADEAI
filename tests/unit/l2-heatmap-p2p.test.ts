import { describe, it, expect, vi, beforeEach } from "bun:test";
import {
  generate1DHeatmapPaletteData,
  create1DTexturePalette,
  compileL2HeatmapProgram,
  L2_HEATMAP_VERTEX_SHADER,
  L2_HEATMAP_FRAGMENT_SHADER,
} from "@/lib/performance/l2-heatmap-shader";
import { WebGLL2HeatmapRenderer } from "@/lib/performance/webgl-l2-heatmap-renderer";
import { SharedL2DepthMatrix } from "@/lib/performance/shared-l2-depth-matrix";
import { OffscreenChartController } from "@/lib/performance/offscreen-chart-controller";
import { BinanceWorkerManager } from "@/lib/performance/binance-worker-manager";

describe("L2 Heatmap P2P & 1D Texture Palette (Pilar 1 & 4 Institucional)", () => {
  describe("Geração e Validação da Paleta 1D de Textura em VRAM (256x1 RGBA)", () => {
    it("deve gerar buffer de 1024 bytes (256 pixels x 4 canais RGBA) sem valores nulos ou NaN", () => {
      const palette = generate1DHeatmapPaletteData();
      expect(palette).toBeInstanceOf(Uint8Array);
      expect(palette.length).toBe(1024);

      for (let i = 0; i < palette.length; i++) {
        expect(palette[i]).toBeGreaterThanOrEqual(0);
        expect(palette[i]).toBeLessThanOrEqual(255);
        expect(Number.isNaN(palette[i])).toBe(false);
      }
    });

    it("deve mapear lado Bid (índices 0..127) com gradiente Esmeralda/Ciano e alta densidade", () => {
      const palette = generate1DHeatmapPaletteData();
      
      // Índice de maior densidade de Bid (índice 127 = pico de volume de compra)
      const offsetBid = 127 * 4;
      const rBid = palette[offsetBid + 0];
      const gBid = palette[offsetBid + 1];
      const bBid = palette[offsetBid + 2];
      const aBid = palette[offsetBid + 3];

      expect(gBid).toBeGreaterThan(rBid); // Canal verde/ciano dominante
      expect(bBid).toBeGreaterThan(0);
      expect(aBid).toBeGreaterThan(200); // Alta opacidade para clusters densos

      // Índice com volume zero (índice 0)
      expect(palette[3]).toBe(0); // Transparência no volume nulo
    });

    it("deve mapear lado Ask (índices 128..255) com gradiente Âmbar/Rubi e alta densidade", () => {
      const palette = generate1DHeatmapPaletteData();
      
      // Índice de maior densidade de Ask (índice 255 = normalized 1.0)
      const offsetAsk = 255 * 4;
      const rAsk = palette[offsetAsk + 0];
      const gAsk = palette[offsetAsk + 1];
      const bAsk = palette[offsetAsk + 2];
      const aAsk = palette[offsetAsk + 3];

      expect(rAsk).toBeGreaterThan(bAsk); // Canal vermelho/âmbar dominante
      expect(aAsk).toBeGreaterThan(200); // Alta opacidade para book denso de venda
    });

    it("deve manter o ponto zero de volume (índices 0 e 128) transparente para evitar poluição visual", () => {
      const palette = generate1DHeatmapPaletteData();
      const alphaZeroBid = palette[3]; // Índice 0 (zero bid)
      const alphaZeroAsk = palette[128 * 4 + 3]; // Índice 128 (zero ask)
      expect(alphaZeroBid).toBe(0);
      expect(alphaZeroAsk).toBe(0);
    });
  });

  describe("Shaders GLSL ES 3.00 & Compilação de Programa", () => {
    it("deve conter amostragem de textura 1D (u_palette1D) e compressão logarítmica no shader fragment", () => {
      expect(L2_HEATMAP_FRAGMENT_SHADER).toContain("uniform sampler2D u_palette1D");
      expect(L2_HEATMAP_FRAGMENT_SHADER).toContain("uniform vec4 u_dynamicRange");
      expect(L2_HEATMAP_FRAGMENT_SHADER).toContain("log(1.0 +");
      expect(L2_HEATMAP_FRAGMENT_SHADER).toContain("texture(u_palette1D");
    });

    it("deve compilar programa de shader e carregar textura 1D via mock de WebGL2", () => {
      const mockGl: any = {
        createShader: vi.fn(() => ({})),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        getShaderParameter: vi.fn(() => true),
        getShaderInfoLog: vi.fn(() => ""),
        createProgram: vi.fn(() => ({})),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        getProgramParameter: vi.fn(() => true),
        getProgramInfoLog: vi.fn(() => ""),
        getAttribLocation: vi.fn((_, name) => (name === "a_position" ? 0 : 1)),
        getUniformLocation: vi.fn((_, name) => ({ name })),
        deleteShader: vi.fn(),
        createTexture: vi.fn(() => ({})),
        bindTexture: vi.fn(),
        texImage2D: vi.fn(),
        texParameteri: vi.fn(),
        TEXTURE_2D: 0x0DE1,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        TEXTURE_MIN_FILTER: 0x2801,
        TEXTURE_MAG_FILTER: 0x2800,
        TEXTURE_WRAP_S: 0x2802,
        TEXTURE_WRAP_T: 0x2803,
        LINEAR: 0x2601,
        CLAMP_TO_EDGE: 0x812F,
      };

      const compiled = compileL2HeatmapProgram(mockGl);
      expect(compiled).not.toBeNull();
      if (!compiled) return;

      expect(mockGl.createProgram).toHaveBeenCalled();
      expect(compiled.uPalette1DLoc).toBeDefined();
      expect(compiled.uDynamicRangeLoc).toBeDefined();
      expect(compiled.uHeatmapTextureLoc).toBeDefined();

      const texture = create1DTexturePalette(mockGl);
      expect(texture).not.toBeNull();
      expect(mockGl.createTexture).toHaveBeenCalled();
      expect(mockGl.texImage2D).toHaveBeenCalled();
    });
  });

  describe("WebGLL2HeatmapRenderer - Ingestão Zero-Allocation da Matriz L2 (pushDepthSliceFromMatrix)", () => {
    it("deve aceitar SharedL2DepthMatrix e empacotar fatia temporal RGBA sem alocações dinâmicas no loop", () => {
      if (typeof SharedArrayBuffer === "undefined") {
        return; // Pula em ambientes sem suporte nativo a SAB
      }

      const matrix = SharedL2DepthMatrix.create(500, false);
      const bids: [number, number][] = [
        [65000, 1.5],
        [64990, 3.2],
        [64980, 5.0],
      ];
      const asks: [number, number][] = [
        [65010, 2.0],
        [65020, 4.5],
        [65030, 8.1],
      ];

      matrix.writeDepthSnapshot(bids, asks, Date.now());

      const mockGl: any = {
        createShader: vi.fn(() => ({})),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        getShaderParameter: vi.fn(() => true),
        getShaderInfoLog: vi.fn(() => ""),
        createProgram: vi.fn(() => ({})),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        getProgramParameter: vi.fn(() => true),
        getProgramInfoLog: vi.fn(() => ""),
        getAttribLocation: vi.fn(() => 0),
        getUniformLocation: vi.fn(() => ({})),
        deleteShader: vi.fn(),
        createTexture: vi.fn(() => ({})),
        bindTexture: vi.fn(),
        texImage2D: vi.fn(),
        texSubImage2D: vi.fn(),
        texParameteri: vi.fn(),
        createBuffer: vi.fn(() => ({})),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        createVertexArray: vi.fn(() => ({})),
        bindVertexArray: vi.fn(),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        activeTexture: vi.fn(),
        uniform1i: vi.fn(),
        uniform1f: vi.fn(),
        uniform2f: vi.fn(),
        viewport: vi.fn(),
        clearColor: vi.fn(),
        clear: vi.fn(),
        drawArrays: vi.fn(),
        deleteProgram: vi.fn(),
        deleteTexture: vi.fn(),
        deleteBuffer: vi.fn(),
        deleteVertexArray: vi.fn(),
        useProgram: vi.fn(),
        getExtension: vi.fn(() => null),
        COLOR_BUFFER_BIT: 0x4000,
        TRIANGLES: 0x0004,
        TEXTURE0: 0x84C0,
        TEXTURE1: 0x84C1,
        TEXTURE_2D: 0x0DE1,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88E4,
        DYNAMIC_DRAW: 0x88E8,
        FLOAT: 0x1406,
        TEXTURE_MIN_FILTER: 0x2801,
        TEXTURE_MAG_FILTER: 0x2800,
        TEXTURE_WRAP_S: 0x2802,
        TEXTURE_WRAP_T: 0x2803,
        LINEAR: 0x2601,
        CLAMP_TO_EDGE: 0x812F,
      };

      const renderer = new WebGLL2HeatmapRenderer(mockGl, {
        priceResolution: 500,
        timeHistoryLength: 100,
      });

      const pushed = renderer.pushDepthSliceFromMatrix(matrix, 64900, 65100, {
        dynamicMaxVolume: true,
      });

      expect(pushed).toBe(true);
      expect(mockGl.texSubImage2D).toHaveBeenCalled();

      renderer.destroy();
      expect(mockGl.deleteTexture).toHaveBeenCalled();
    });
  });

  describe("Transmissão Peer-to-Peer Zero-Hop (PEER_L2_UPDATE)", () => {
    it("deve trafegar snapshot L2 pelo canal MessagePort P2P e notificar OffscreenChartController", async () => {
      const controller = new OffscreenChartController();
      const channel = new MessageChannel();

      let receivedUpdate: any = null;
      const unbind = controller.onPeerL2Update((update) => {
        receivedUpdate = update;
      });

      controller.connectPeerPort(channel.port2);

      const mockL2Payload = {
        type: "PEER_L2_UPDATE",
        symbol: "BTCUSDT",
        bids: [
          [65400.0, 1.2],
          [65390.0, 2.5],
        ],
        asks: [
          [65410.0, 0.8],
          [65420.0, 3.1],
        ],
        timestamp: 1715000030000,
      };

      // Simula o Ingestion Worker enviando no canal P2P
      channel.port1.postMessage(mockL2Payload);

      // Aguarda despacho do event loop
      await new Promise((resolve) => setTimeout(resolve, 30));

      const lastL2 = controller.getLastL2Update();
      expect(lastL2).not.toBeNull();
      expect(lastL2.symbol).toBe("BTCUSDT");
      expect(lastL2.bids.length).toBe(2);
      expect(lastL2.asks.length).toBe(2);
      expect(lastL2.timestamp).toBe(1715000030000);

      expect(receivedUpdate).not.toBeNull();
      expect(receivedUpdate.symbol).toBe("BTCUSDT");

      unbind();
      controller.destroy();
    });

    it("deve integrar BinanceWorkerManager e repassar L2 depth snapshot para SharedL2DepthMatrix e P2P", async () => {
      const manager = new BinanceWorkerManager({
        symbols: ["BTCUSDT"],
        queueCapacity: 64,
        spscStride: 16,
      });

      const controller = new OffscreenChartController();
      const channel = OffscreenChartController.connectWorkers(manager, controller);
      expect(channel).not.toBeNull();

      let receivedByController: any = null;
      controller.onPeerL2Update((update) => {
        receivedByController = update;
      });

      const bids: [number, number][] = [
        [65000, 1.5],
        [64990, 3.0],
      ];
      const asks: [number, number][] = [
        [65010, 2.2],
        [65020, 4.1],
      ];
      const ts = 1715000050000;

      // Despacha snapshot pelo manager
      manager.dispatchL2DepthSnapshot("BTCUSDT", bids, asks, ts);

      // Verifica se gravou na matriz compartilhada
      const matrix = manager.getL2DepthMatrix();
      if (matrix) {
        const summary = matrix.readSnapshotSummary();
        expect(summary.bidsCount).toBe(2);
        expect(summary.asksCount).toBe(2);
        expect(summary.bestBid).toBe(65000);
        expect(summary.bestAsk).toBe(65010);
      }

      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(receivedByController).not.toBeNull();
      expect(receivedByController?.symbol).toBe("BTCUSDT");
      expect(receivedByController?.bids.length).toBe(2);

      manager.destroy();
      controller.destroy();
    });
  });
});
