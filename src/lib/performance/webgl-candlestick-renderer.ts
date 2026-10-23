/**
 * WebGLCandlestickRenderer
 * Motor de renderização acelerado por GPU via WebGL 2.0 com suporte a Instanced Rendering
 * e OffscreenCanvas para visualização de alta performance (>5.000 a 50.000 candles).
 * Descarrega 100% da geometria para a GPU, liberando o Event Loop da CPU.
 */

import { WebGLL2HeatmapRenderer } from "./webgl-l2-heatmap-renderer";

export interface WebGLViewport {
  width: number;
  height: number;
  devicePixelRatio?: number;
}

export interface WebGLViewBounds {
  startIndex: number;
  visibleCount?: number;
  endIndex?: number;
  minPrice: number;
  maxPrice: number;
  maxVolume?: number;
  showHeatmap?: boolean;
  atr?: number;
  centerPrice?: number;
  compressionFactor?: number;
}

export interface WebGLCandleData {
  index: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

export class WebGLCandlestickRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private instanceBufferA: WebGLBuffer | null = null;
  private instanceBufferB: WebGLBuffer | null = null;
  private heatmapRenderer: WebGLL2HeatmapRenderer | null = null;

  // Uniform locations
  private uResolutionLoc: WebGLUniformLocation | null = null;
  private uViewBoundsLoc: WebGLUniformLocation | null = null;
  private uCandleLayoutLoc: WebGLUniformLocation | null = null;
  private uVolumeHeightRatioLoc: WebGLUniformLocation | null = null;
  private uMaxVolumeLoc: WebGLUniformLocation | null = null;

  private candleCount: number = 0;
  private width: number = 800;
  private height: number = 400;

  // Buffers de transferência reutilizáveis para Zero-GC Churn na GPU
  private gpuScratchA: Float32Array = new Float32Array(2048 * 4);
  private gpuScratchB: Float32Array = new Float32Array(2048 * 4);

  constructor(
    contextOrCanvas?: WebGL2RenderingContext | HTMLCanvasElement | OffscreenCanvas | null,
    options?: { heatmapEnabled?: boolean }
  ) {
    if (contextOrCanvas) {
      this.init(contextOrCanvas);
    } else if (options?.heatmapEnabled) {
      this.heatmapRenderer = new WebGLL2HeatmapRenderer(null);
    }
  }

  public getHeatmapRenderer(): WebGLL2HeatmapRenderer | null {
    return this.heatmapRenderer;
  }

  /**
   * Atualiza os parâmetros de faixa dinâmica (ATR, centerPrice e fator de compressão)
   * no renderizador de Heatmap L2 subjacente.
   */
  public setDynamicRangeParams(atr: number, centerPrice?: number, compressionFactor?: number): void {
    if (this.heatmapRenderer) {
      this.heatmapRenderer.setDynamicRangeParams(atr, centerPrice, compressionFactor);
    }
  }

  /**
   * Verifica se o ambiente possui suporte a WebGL 2.0.
   */
  public static isSupported(): boolean {
    if (typeof HTMLCanvasElement === "undefined" && typeof OffscreenCanvas === "undefined") {
      return false;
    }
    try {
      const canvas = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : document.createElement("canvas");
      const ctx = canvas.getContext("webgl2");
      return !!ctx;
    } catch {
      return false;
    }
  }

  /**
   * Inicializa o contexto WebGL 2.0 e compila o pipeline de shaders.
   */
  public init(target: WebGL2RenderingContext | HTMLCanvasElement | OffscreenCanvas): boolean {
    if ("createShader" in target) {
      this.gl = target as WebGL2RenderingContext;
    } else {
      const canvas = target as HTMLCanvasElement | OffscreenCanvas;
      this.width = canvas.width || 800;
      this.height = canvas.height || 400;
      this.gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      }) as WebGL2RenderingContext | null;
    }

    if (!this.gl) {
      return false;
    }

    const gl = this.gl;

    // Shaders GLSL ES 3.00
    const vsSource = `#version 300 es
    precision highp float;

    layout(location = 0) in vec2 a_unitVertex;
    layout(location = 1) in float a_geomType; // 0.0 = Wick, 1.0 = Body, 2.0 = Volume

    layout(location = 2) in vec4 a_candleA; // [index, open, high, low]
    layout(location = 3) in vec4 a_candleB; // [close, volume, time, flags]

    uniform vec2 u_resolution;
    uniform vec4 u_viewBounds; // [startIndex, visibleCount, minPrice, maxPrice]
    uniform vec2 u_candleLayout; // [candleWidth, wickWidth]
    uniform float u_volumeRatio;
    uniform float u_maxVolume;

    out vec4 v_color;

    void main() {
      float idx = a_candleA.x;
      float o = a_candleA.y;
      float h = a_candleA.z;
      float l = a_candleA.w;
      float c = a_candleB.x;
      float vol = a_candleB.y;

      float startIdx = u_viewBounds.x;
      float visible = max(u_viewBounds.y, 1.0);
      float minP = u_viewBounds.z;
      float maxP = u_viewBounds.w;
      float range = max(maxP - minP, 0.00001);

      bool isBull = c >= o;
      vec4 bullCol = vec4(0.133, 0.773, 0.369, 1.0); // #22c55e
      vec4 bearCol = vec4(0.937, 0.267, 0.267, 1.0); // #ef4444
      vec4 col = isBull ? bullCol : bearCol;

      float relIdx = idx - startIdx;
      float slotWidth = u_resolution.x / visible;
      float centerX = relIdx * slotWidth + (slotWidth * 0.5);

      float chartH = u_resolution.y * (1.0 - u_volumeRatio);
      float volBaseY = u_resolution.y;

      vec2 px = vec2(0.0);

      if (a_geomType < 0.5) {
        // Wick (Sombra)
        float wickW = max(u_candleLayout.y, 1.0);
        float yH = chartH * (1.0 - (h - minP) / range);
        float yL = chartH * (1.0 - (l - minP) / range);
        float topY = min(yH, yL);
        float botY = max(yH, yL);
        float hPx = max(botY - topY, 1.0);

        px.x = centerX + (a_unitVertex.x * wickW);
        px.y = topY + (a_unitVertex.y * hPx);
        v_color = col;
      } else if (a_geomType < 1.5) {
        // Body (Corpo)
        float bodyW = max(u_candleLayout.x, 1.0);
        float yO = chartH * (1.0 - (o - minP) / range);
        float yC = chartH * (1.0 - (c - minP) / range);
        float topY = min(yO, yC);
        float botY = max(yO, yC);
        float hPx = max(botY - topY, 1.0);

        px.x = centerX + (a_unitVertex.x * bodyW);
        px.y = topY + (a_unitVertex.y * hPx);
        v_color = col;
      } else {
        // Volume
        float bodyW = max(u_candleLayout.x, 1.0);
        float maxVolH = u_resolution.y * u_volumeRatio;
        float volNorm = (u_maxVolume > 0.0) ? (vol / u_maxVolume) : 0.0;
        float hPx = volNorm * maxVolH;

        px.x = centerX + (a_unitVertex.x * bodyW);
        px.y = volBaseY - (a_unitVertex.y * hPx);
        v_color = vec4(col.rgb, 0.40);
      }

      vec2 clip = (px / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    }`;

    const fsSource = `#version 300 es
    precision mediump float;
    in vec4 v_color;
    out vec4 fragColor;
    void main() {
      fragColor = v_color;
    }`;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return false;

    this.program = gl.createProgram();
    if (!this.program) return false;

    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("WebGL Program Link Error:", gl.getProgramInfoLog(this.program));
      return false;
    }

    // Localizar Uniforms
    this.uResolutionLoc = gl.getUniformLocation(this.program, "u_resolution");
    this.uViewBoundsLoc = gl.getUniformLocation(this.program, "u_viewBounds");
    this.uCandleLayoutLoc = gl.getUniformLocation(this.program, "u_candleLayout");
    this.uVolumeHeightRatioLoc = gl.getUniformLocation(this.program, "u_volumeRatio");
    this.uMaxVolumeLoc = gl.getUniformLocation(this.program, "u_maxVolume");

    // Configurar VAO e Geometria Base (Wick + Body + Volume)
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // 3 quads em sequência (TRIANGLES ou TRIANGLE_STRIP degenerado)
    // Usamos 6 vértices por quad (2 triângulos):
    // [x, y, geomType]
    const unitQuadVerts = new Float32Array([
      // 1. Wick (geomType = 0.0)
      -0.5, 0.0, 0.0,
       0.5, 0.0, 0.0,
      -0.5, 1.0, 0.0,
      -0.5, 1.0, 0.0,
       0.5, 0.0, 0.0,
       0.5, 1.0, 0.0,

      // 2. Body (geomType = 1.0)
      -0.5, 0.0, 1.0,
       0.5, 0.0, 1.0,
      -0.5, 1.0, 1.0,
      -0.5, 1.0, 1.0,
       0.5, 0.0, 1.0,
       0.5, 1.0, 1.0,

      // 3. Volume Bar (geomType = 2.0)
      -0.5, 0.0, 2.0,
       0.5, 0.0, 2.0,
      -0.5, 1.0, 2.0,
      -0.5, 1.0, 2.0,
       0.5, 0.0, 2.0,
       0.5, 1.0, 2.0,
    ]);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, unitQuadVerts, gl.STATIC_DRAW);

    // Atributos de vértice unitário
    gl.enableVertexAttribArray(0); // a_unitVertex
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 3 * 4, 0);

    gl.enableVertexAttribArray(1); // a_geomType
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 3 * 4, 2 * 4);

    // Buffers instanciados (divisor = 1)
    this.instanceBufferA = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBufferA);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 4 * 4, 0);
    gl.vertexAttribDivisor(2, 1);

    this.instanceBufferB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBufferB);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 4 * 4, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    // Configurar Blending para Alpha/Transparência
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Inicializa renderizador de heatmap de liquidez L2 se WebGL estiver ativo
    try {
      this.heatmapRenderer = new WebGLL2HeatmapRenderer(gl);
    } catch (err) {
      console.warn("[WebGLCandlestickRenderer] Falha ao inicializar Heatmap L2:", err);
    }

    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("Shader Compile Error:", this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Atualiza as dimensões da viewport do WebGL.
   */
  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  private ensureScratchCapacity(requiredElements: number): void {
    if (this.gpuScratchA.length < requiredElements) {
      let newCapacity = this.gpuScratchA.length * 2;
      while (newCapacity < requiredElements) newCapacity *= 2;
      this.gpuScratchA = new Float32Array(newCapacity);
      this.gpuScratchB = new Float32Array(newCapacity);
    }
  }

  /**
   * Envia dados de candles para as instâncias da GPU via Float32Array sem alocações transitórias (Zero-GC).
   */
  public setCandleData(candles: WebGLCandleData[]): void {
    if (!this.gl || !this.instanceBufferA || !this.instanceBufferB) return;

    this.candleCount = candles.length;
    if (this.candleCount === 0) return;

    const requiredElements = this.candleCount * 4;
    this.ensureScratchCapacity(requiredElements);

    const dataA = this.gpuScratchA;
    const dataB = this.gpuScratchB;

    for (let i = 0; i < this.candleCount; i++) {
      const c = candles[i];
      const offset = i * 4;

      dataA[offset + 0] = c.index;
      dataA[offset + 1] = c.open;
      dataA[offset + 2] = c.high;
      dataA[offset + 3] = c.low;

      dataB[offset + 0] = c.close;
      dataB[offset + 1] = c.volume;
      dataB[offset + 2] = c.timestamp ?? 0;
      dataB[offset + 3] = 0; // flags
    }

    const gl = this.gl;
    const viewA = new Float32Array(dataA.buffer, 0, requiredElements);
    const viewB = new Float32Array(dataB.buffer, 0, requiredElements);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBufferA);
    gl.bufferData(gl.ARRAY_BUFFER, viewA, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBufferB);
    gl.bufferData(gl.ARRAY_BUFFER, viewB, gl.DYNAMIC_DRAW);
  }

  /**
   * Envia dados de candles diretamente a partir de vetores contíguos SoA (Structure-of-Arrays).
   * Elimina 100% de alocações transitórias de objetos { open, high, low, close } no caminho crítico.
   * Viabiliza vetorização SIMD nativa na GPU com leitura de memória contígua da CPU.
   */
  public setCandleDataFromSoA(
    count: number,
    opens: Float64Array | Float32Array,
    highs: Float64Array | Float32Array,
    lows: Float64Array | Float32Array,
    closes: Float64Array | Float32Array,
    volumes: Float64Array | Float32Array,
    timestamps?: Float64Array | Float32Array
  ): void {
    if (!this.gl || !this.instanceBufferA || !this.instanceBufferB || count <= 0) return;

    this.candleCount = count;
    const requiredElements = count * 4;
    this.ensureScratchCapacity(requiredElements);

    const dataA = this.gpuScratchA;
    const dataB = this.gpuScratchB;

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      dataA[offset + 0] = i; // index
      dataA[offset + 1] = opens[i];
      dataA[offset + 2] = highs[i];
      dataA[offset + 3] = lows[i];

      dataB[offset + 0] = closes[i];
      dataB[offset + 1] = volumes[i];
      dataB[offset + 2] = timestamps ? timestamps[i] : 0;
      dataB[offset + 3] = 0; // flags
    }

    const gl = this.gl;
    const viewA = new Float32Array(dataA.buffer, 0, requiredElements);
    const viewB = new Float32Array(dataB.buffer, 0, requiredElements);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBufferA);
    gl.bufferData(gl.ARRAY_BUFFER, viewA, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBufferB);
    gl.bufferData(gl.ARRAY_BUFFER, viewB, gl.DYNAMIC_DRAW);
  }

  /**
   * Executa a renderização instanciada em um único draw call na GPU.
   */
  public render(bounds: WebGLViewBounds, candleWidthPx: number = 6, wickWidthPx: number = 1.5): boolean {
    if (!this.gl || !this.program || !this.vao || this.candleCount === 0) {
      return false;
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const effectiveVisibleCount = bounds.visibleCount ?? (bounds.endIndex !== undefined ? Math.max(1, bounds.endIndex - bounds.startIndex) : 100);

    // Uniforms
    gl.uniform2f(this.uResolutionLoc, this.width, this.height);
    gl.uniform4f(
      this.uViewBoundsLoc,
      bounds.startIndex,
      effectiveVisibleCount,
      bounds.minPrice,
      bounds.maxPrice
    );
    gl.uniform2f(this.uCandleLayoutLoc, candleWidthPx, wickWidthPx);
    gl.uniform1f(this.uVolumeHeightRatioLoc, 0.18);
    gl.uniform1f(this.uMaxVolumeLoc, bounds.maxVolume ?? 100);

    // Limpa a tela
    gl.clearColor(0.05, 0.07, 0.11, 0.0); // Transparente para composição sobre grid
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 1. Renderiza plano de fundo: Heatmap de Livro de Ofertas L2 (se habilitado e ativo)
    if (bounds.showHeatmap && this.heatmapRenderer) {
      this.heatmapRenderer.render({
        minPrice: bounds.minPrice,
        maxPrice: bounds.maxPrice,
        startIndex: bounds.startIndex,
        visibleCount: effectiveVisibleCount,
        atr: bounds.atr,
        centerPrice: bounds.centerPrice,
        compressionFactor: bounds.compressionFactor,
      });
    }

    // 2. Draw call único para até 50.000 instâncias de candles e volume
    // 18 vértices (3 quads de 6 vértices) * candleCount
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 18, this.candleCount);

    gl.bindVertexArray(null);
    return true;
  }

  /**
   * Destrói buffers e programas liberando memória de vídeo (VRAM).
   */
  public destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    if (this.heatmapRenderer) {
      this.heatmapRenderer.destroy();
      this.heatmapRenderer = null;
    }

    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.instanceBufferA) gl.deleteBuffer(this.instanceBufferA);
    if (this.instanceBufferB) gl.deleteBuffer(this.instanceBufferB);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);

    this.gl = null;
  }
}
