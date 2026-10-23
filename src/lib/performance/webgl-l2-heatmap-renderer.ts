/**
 * WebGLL2HeatmapRenderer
 * Renderizador de Heatmap de Livro de Ofertas L2 e Volume Profile Dinâmico na GPU
 * via textura 2D dinâmica atualizada incrementalmente com gl.texSubImage2D.
 * Plota nuvens de liquidez histórica e ordens iceberg com zero impacto de frametime.
 */

export interface L2Level {
  price: number;
  quantity: number;
}

export interface HeatmapConfig {
  historyLength?: number; // Largura da textura no tempo (ex: 256 colunas)
  priceBins?: number;     // Altura da textura em faixas de preço (ex: 128 níveis)
  alpha?: number;         // Opacidade geral do heatmap (0.0 a 1.0)
}

export interface VolumeProfileBin {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  percentage: number;
  isPoc: boolean;
  isValueArea: boolean;
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[];
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  totalVolume: number;
  maxBinVolume: number;
}

export interface HeatmapBounds {
  minPrice: number;
  maxPrice: number;
  startIndex?: number;
  visibleCount?: number;
}

export class WebGLL2HeatmapRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private quadVbo: WebGLBuffer | null = null;

  // Uniform locations
  private uHeatmapTextureLoc: WebGLUniformLocation | null = null;
  private uAlphaLoc: WebGLUniformLocation | null = null;
  private uViewBoundsLoc: WebGLUniformLocation | null = null;
  private uTexBoundsLoc: WebGLUniformLocation | null = null;

  public readonly historyLength: number;
  public readonly priceBins: number;
  public alpha: number;

  // Buffer de dados da textura RGBA (historyLength * priceBins * 4 bytes)
  // R: Bid Liquidity, G: Ask Liquidity, B: Iceberg Detection, A: Opacity/Weight
  private textureData: Uint8Array;
  private sliceScratch: Uint8Array;
  private currentColumn: number = 0;
  private lastMinPrice: number = 0;
  private lastMaxPrice: number = 0;

  constructor(contextOrCanvas?: WebGL2RenderingContext | HTMLCanvasElement | OffscreenCanvas | null, config?: HeatmapConfig) {
    this.historyLength = config?.historyLength ?? 256;
    this.priceBins = config?.priceBins ?? 128;
    this.alpha = config?.alpha ?? 0.65;

    this.textureData = new Uint8Array(this.historyLength * this.priceBins * 4);
    this.sliceScratch = new Uint8Array(this.priceBins * 4);

    if (contextOrCanvas) {
      this.init(contextOrCanvas);
    }
  }

  /**
   * Inicializa contexto WebGL 2.0, textura 2D dinâmica e shaders de heatmap.
   */
  public init(target: WebGL2RenderingContext | HTMLCanvasElement | OffscreenCanvas): boolean {
    if ("createShader" in target) {
      this.gl = target as WebGL2RenderingContext;
    } else {
      const canvas = target as HTMLCanvasElement | OffscreenCanvas;
      this.gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      }) as WebGL2RenderingContext | null;
    }

    if (!this.gl) return false;
    const gl = this.gl;

    // Shaders GLSL ES 3.00
    const vsSource = `#version 300 es
    precision highp float;

    layout(location = 0) in vec2 a_position; // Quad unitário [-1, 1]
    layout(location = 1) in vec2 a_texCoord; // Coordenadas de textura [0, 1]

    out vec2 v_texCoord;

    void main() {
      v_texCoord = a_texCoord;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`;

    const fsSource = `#version 300 es
    precision mediump float;

    in vec2 v_texCoord;
    uniform sampler2D u_heatmapTexture;
    uniform float u_alpha;
    uniform vec4 u_viewBounds; // [startIndex, visibleCount, minPrice, maxPrice]
    uniform vec4 u_texBounds;  // [texMinPrice, texMaxPrice, currentCol, historyLength]

    out vec4 fragColor;

    void main() {
      // Reamostragem circular no eixo horizontal (tempo)
      float headCol = u_texBounds.z;
      float histLen = u_texBounds.w;
      float uCoord = fract(v_texCoord.x + (headCol / histLen));

      // Reamostragem no eixo vertical (preço proporcional)
      float viewMinP = u_viewBounds.z;
      float viewMaxP = u_viewBounds.w;
      float texMinP = u_texBounds.x;
      float texMaxP = u_texBounds.y;

      float price = mix(viewMinP, viewMaxP, v_texCoord.y);
      float vCoord = clamp((price - texMinP) / max(texMaxP - texMinP, 0.00001), 0.0, 1.0);

      vec4 texel = texture(u_heatmapTexture, vec2(uCoord, vCoord));
      float bidIntensity = texel.r;
      float askIntensity = texel.g;
      float iceberg = texel.b;

      // Color mapping:
      // Bids (Cyan/Emerald): vec3(0.06, 0.78, 0.52)
      // Asks (Amber/Rose): vec3(0.94, 0.32, 0.25)
      // Iceberg (Projeção Direta Canal B - Neon Magenta / Halo Pulsante de Alta Densidade):
      // Quando iceberg > 0.05, gera halo pulsante no nível de preço exato sem custo para CPU
      float isIce = step(0.05, iceberg);
      float icePulse = 1.8 + 0.35 * sin(uCoord * 62.8318); // 10 oscilações no histórico temporal

      vec3 bidColor = vec3(0.06, 0.78, 0.52) * bidIntensity;
      vec3 askColor = vec3(0.94, 0.32, 0.25) * askIntensity;
      vec3 icebergColor = vec3(0.88, 0.18, 1.00) * (isIce * icePulse);

      vec3 finalColor = bidColor + askColor + icebergColor;
      float totalDensity = clamp(bidIntensity + askIntensity + (isIce * 1.0), 0.0, 1.0);

      fragColor = vec4(finalColor, totalDensity * u_alpha);
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
      console.error("Heatmap Program Link Error:", gl.getProgramInfoLog(this.program));
      return false;
    }

    // Localizar Uniforms
    this.uHeatmapTextureLoc = gl.getUniformLocation(this.program, "u_heatmapTexture");
    this.uAlphaLoc = gl.getUniformLocation(this.program, "u_alpha");
    this.uViewBoundsLoc = gl.getUniformLocation(this.program, "u_viewBounds");
    this.uTexBoundsLoc = gl.getUniformLocation(this.program, "u_texBounds");

    // Configurar VAO e Quad de fundo
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);

    // Quad: [pos.x, pos.y, tex.u, tex.v]
    const quadVertices = new Float32Array([
      -1.0, -1.0, 0.0, 0.0,
       1.0, -1.0, 1.0, 0.0,
      -1.0,  1.0, 0.0, 1.0,
      -1.0,  1.0, 0.0, 1.0,
       1.0, -1.0, 1.0, 0.0,
       1.0,  1.0, 1.0, 1.0,
    ]);

    this.quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0); // a_position
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * 4, 0);

    gl.enableVertexAttribArray(1); // a_texCoord
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

    gl.bindVertexArray(null);

    // Alocar Textura 2D Dinâmica
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Inicializa textura vazia com dimensões historyLength x priceBins
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.historyLength,
      this.priceBins,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.textureData
    );

    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("Heatmap Shader Compile Error:", this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Converte um preço contínuo no índice discreto do bin de textura [0, priceBins - 1].
   */
  public quantizePrice(price: number, minPrice: number, maxPrice: number): number {
    const range = maxPrice - minPrice;
    if (range <= 0) return 0;
    const normalized = (price - minPrice) / range;
    const bin = Math.floor(normalized * (this.priceBins - 1));
    return Math.max(0, Math.min(this.priceBins - 1, bin));
  }

  /**
   * Insere um novo snapshot L2 de Bids e Asks na textura da GPU via gl.texSubImage2D.
   * Executa upload de estritamente 1 coluna (priceBins * 4 bytes) com zero realocações.
   */
  public pushDepthSnapshot(
    bids: L2Level[],
    asks: L2Level[],
    minPrice: number,
    maxPrice: number,
    icebergVolumeThreshold: number = 50.0
  ): boolean {
    this.lastMinPrice = minPrice;
    this.lastMaxPrice = maxPrice;

    // Limpa o slice temporário
    this.sliceScratch.fill(0);

    // Normalização de quantidade com escala logarítmica
    const maxQty = Math.max(
      ...bids.map((b) => b.quantity),
      ...asks.map((a) => a.quantity),
      1.0
    );

    // 1. Processa Bids (Canal R)
    for (let i = 0; i < bids.length; i++) {
      const b = bids[i];
      if (b.price < minPrice || b.price > maxPrice) continue;
      const bin = this.quantizePrice(b.price, minPrice, maxPrice);
      const intensity = Math.min(255, Math.floor((b.quantity / maxQty) * 255));
      const offset = bin * 4;

      this.sliceScratch[offset + 0] = Math.max(this.sliceScratch[offset + 0], intensity);

      // Detecção de Ordens Iceberg / Absorção Anômala (Canal B)
      if (b.quantity >= icebergVolumeThreshold) {
        this.sliceScratch[offset + 2] = 255;
      }
    }

    // 2. Processa Asks (Canal G)
    for (let i = 0; i < asks.length; i++) {
      const a = asks[i];
      if (a.price < minPrice || a.price > maxPrice) continue;
      const bin = this.quantizePrice(a.price, minPrice, maxPrice);
      const intensity = Math.min(255, Math.floor((a.quantity / maxQty) * 255));
      const offset = bin * 4;

      this.sliceScratch[offset + 1] = Math.max(this.sliceScratch[offset + 1], intensity);

      // Detecção de Iceberg no Ask
      if (a.quantity >= icebergVolumeThreshold) {
        this.sliceScratch[offset + 2] = 255;
      }
    }

    // Copia o slice para a textura interna contígua
    const colOffset = this.currentColumn * 4;
    for (let bin = 0; bin < this.priceBins; bin++) {
      const texOffset = (bin * this.historyLength * 4) + colOffset;
      const sliceOff = bin * 4;
      this.textureData[texOffset + 0] = this.sliceScratch[sliceOff + 0];
      this.textureData[texOffset + 1] = this.sliceScratch[sliceOff + 1];
      this.textureData[texOffset + 2] = this.sliceScratch[sliceOff + 2];
      this.textureData[texOffset + 3] = 255; // Alpha
    }

    // 3. Upload atômico para a GPU via gl.texSubImage2D (largura = 1 coluna)
    if (this.gl && this.texture) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        this.currentColumn, // xOffset (apenas a coluna atual)
        0,                  // yOffset
        1,                  // width = 1 coluna
        this.priceBins,     // height = todos os bins de preço
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.sliceScratch
      );
    }

    // Avança ponteiro circular de coluna
    this.currentColumn = (this.currentColumn + 1) % this.historyLength;
    return true;
  }

  /**
   * Calcula o Volume Profile Dinâmico distribuindo o volume transacionado por faixas de preço.
   * Identifica o POC (Point of Control) e a Área de Valor (VAH / VAL a 70% do volume total).
   */
  public calculateVolumeProfile(
    candles: Array<{ open: number; high: number; low: number; close: number; volume: number }>,
    minPrice: number,
    maxPrice: number
  ): VolumeProfileResult {
    const bins: VolumeProfileBin[] = [];
    const binCount = Math.min(this.priceBins, 64); // 64 bins para legibilidade do histograma
    const priceStep = (maxPrice - minPrice) / binCount;

    let totalVolume = 0;

    for (let i = 0; i < binCount; i++) {
      const binPrice = minPrice + (i + 0.5) * priceStep;
      bins.push({
        price: binPrice,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        percentage: 0,
        isPoc: false,
        isValueArea: false,
      });
    }

    // Distribui o volume de cada candle entre os bins correspondentes
    for (const c of candles) {
      if (c.high < minPrice || c.low > maxPrice) continue;
      const isBullish = c.close >= c.open;
      const candleMin = Math.max(minPrice, c.low);
      const candleMax = Math.min(maxPrice, c.high);
      const candleRange = Math.max(candleMax - candleMin, 0.0001);

      const startBin = Math.max(0, Math.floor((candleMin - minPrice) / priceStep));
      const endBin = Math.min(binCount - 1, Math.floor((candleMax - minPrice) / priceStep));
      const spannedBins = Math.max(1, endBin - startBin + 1);
      const volPerBin = c.volume / spannedBins;

      for (let b = startBin; b <= endBin; b++) {
        bins[b].volume += volPerBin;
        totalVolume += volPerBin;
        if (isBullish) {
          bins[b].buyVolume += volPerBin;
        } else {
          bins[b].sellVolume += volPerBin;
        }
      }
    }

    // Localiza o Point of Control (POC - maior volume acumulado)
    let maxBinVolume = 0;
    let pocIndex = 0;

    for (let i = 0; i < bins.length; i++) {
      if (bins[i].volume > maxBinVolume) {
        maxBinVolume = bins[i].volume;
        pocIndex = i;
      }
    }

    if (bins.length > 0) {
      bins[pocIndex].isPoc = true;
    }

    // Calcula Value Area (VAH e VAL) cobrindo 70% do volume ao redor do POC
    const targetValueAreaVolume = totalVolume * 0.70;
    let accumulatedVaVolume = bins[pocIndex]?.volume ?? 0;
    if (bins[pocIndex]) bins[pocIndex].isValueArea = true;

    let upIndex = pocIndex + 1;
    let downIndex = pocIndex - 1;

    while (accumulatedVaVolume < targetValueAreaVolume && (upIndex < binCount || downIndex >= 0)) {
      const upVol = (upIndex < binCount) ? bins[upIndex].volume : 0;
      const downVol = (downIndex >= 0) ? bins[downIndex].volume : 0;

      if (upVol >= downVol && upIndex < binCount) {
        accumulatedVaVolume += upVol;
        bins[upIndex].isValueArea = true;
        upIndex++;
      } else if (downIndex >= 0) {
        accumulatedVaVolume += downVol;
        bins[downIndex].isValueArea = true;
        downIndex--;
      } else if (upIndex < binCount) {
        accumulatedVaVolume += upVol;
        bins[upIndex].isValueArea = true;
        upIndex++;
      } else {
        break;
      }
    }

    const pocPrice = bins[pocIndex]?.price ?? (minPrice + maxPrice) / 2;
    const vahPrice = bins[Math.min(binCount - 1, upIndex - 1)]?.price ?? maxPrice;
    const valPrice = bins[Math.max(0, downIndex + 1)]?.price ?? minPrice;

    // Calcula percentual de cada bin
    for (const b of bins) {
      b.percentage = totalVolume > 0 ? (b.volume / totalVolume) * 100 : 0;
    }

    return {
      bins,
      pocPrice,
      vahPrice,
      valPrice,
      totalVolume,
      maxBinVolume,
    };
  }

  /**
   * Renderiza o Heatmap na GPU como plano de fundo sob os candles.
   */
  public render(bounds: HeatmapBounds): boolean {
    if (!this.gl || !this.program || !this.quadVao || !this.texture) {
      return false;
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.quadVao);

    // Ativa textura do heatmap no slot 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uHeatmapTextureLoc, 0);

    gl.uniform1f(this.uAlphaLoc, this.alpha);
    gl.uniform4f(
      this.uViewBoundsLoc,
      bounds.startIndex ?? 0,
      bounds.visibleCount ?? this.historyLength,
      bounds.minPrice,
      bounds.maxPrice
    );
    gl.uniform4f(
      this.uTexBoundsLoc,
      this.lastMinPrice || bounds.minPrice,
      this.lastMaxPrice || bounds.maxPrice,
      this.currentColumn,
      this.historyLength
    );

    // Renderiza quad de tela cheia
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
    return true;
  }

  /**
   * Retorna métricas de telemetria do heatmap.
   */
  public getMetrics(): {
    historyLength: number;
    priceBins: number;
    currentColumn: number;
    bytesUploadedPerSlice: number;
    totalTextureBytes: number;
  } {
    return {
      historyLength: this.historyLength,
      priceBins: this.priceBins,
      currentColumn: this.currentColumn,
      bytesUploadedPerSlice: this.priceBins * 4,
      totalTextureBytes: this.historyLength * this.priceBins * 4,
    };
  }

  /**
   * Libera texturas, shaders e buffers da VRAM.
   */
  public destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    if (this.texture) gl.deleteTexture(this.texture);
    if (this.quadVbo) gl.deleteBuffer(this.quadVbo);
    if (this.quadVao) gl.deleteVertexArray(this.quadVao);
    if (this.program) gl.deleteProgram(this.program);

    this.gl = null;
  }
}
