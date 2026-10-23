/**
 * GPUTransformFeedbackEngine
 * Motor de computação paralela na GPU via WebGL 2.0 Transform Feedback (GLSL ES 3.00).
 * Calcula desbalanceamento cumulativo de livros de ofertas L2 (Order Book Imbalance)
 * e pressão de absorção diretamente nos núcleos da GPU com RASTERIZER_DISCARD,
 * dispensando qualquer loop de cálculo numérico na thread principal da CPU.
 */

export interface DepthLevelInput {
  price: number;
  quantity: number;
  side: 1 | -1; // 1 = Bid, -1 = Ask
  distanceFromMidPct: number;
  symbolIndex?: number; // 0 = BTC, 1 = ETH, 2 = SOL...
}

export interface GPUTFIImbalanceMetrics {
  imbalanceRatio: number;      // -1.0 (100% Venda) a +1.0 (100% Compra)
  weightedBidVolume: number;
  weightedAskVolume: number;
  absorptionPressure: number;
  dominantSide: "BUY_DOMINANT" | "SELL_DOMINANT" | "BALANCED";
  processedLevels: number;
}

export class GPUTransformFeedbackEngine {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private inputVao: WebGLVertexArrayObject | null = null;
  private inputBuffer: WebGLBuffer | null = null;
  private outputBuffer: WebGLBuffer | null = null;
  private transformFeedback: WebGLTransformFeedback | null = null;

  public readonly maxLevels: number;
  public readonly lambdaDecay: number; // Fator de decaimento por distância do spread

  // Buffers de memória contígua para envio e leitura
  private inputData: Float32Array;
  private outputData: Float32Array;

  constructor(
    contextOrCanvas?: WebGL2RenderingContext | HTMLCanvasElement | OffscreenCanvas | null,
    maxLevels: number = 256,
    lambdaDecay: number = 2.5
  ) {
    this.maxLevels = maxLevels;
    this.lambdaDecay = lambdaDecay;

    // 4 floats por nível de entrada: [price, quantity, side, distanceFromMidPct]
    this.inputData = new Float32Array(this.maxLevels * 4);
    // 4 floats por saída de nível: [weightedVolume, isBid, isAsk, absorptionScore]
    this.outputData = new Float32Array(this.maxLevels * 4);

    if (contextOrCanvas) {
      this.init(contextOrCanvas);
    }
  }

  /**
   * Verifica se o ambiente suporta WebGL 2.0 com Transform Feedback.
   */
  public static isSupported(): boolean {
    if (typeof HTMLCanvasElement === "undefined" && typeof OffscreenCanvas === "undefined") {
      return false;
    }
    try {
      const canvas = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : document.createElement("canvas");
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
      return !!gl && typeof gl.createTransformFeedback === "function";
    } catch {
      return false;
    }
  }

  /**
   * Inicializa o pipeline de Transform Feedback na GPU.
   */
  public init(target: WebGL2RenderingContext | HTMLCanvasElement | OffscreenCanvas): boolean {
    if ("createShader" in target) {
      this.gl = target as WebGL2RenderingContext;
    } else {
      const canvas = target as HTMLCanvasElement | OffscreenCanvas;
      this.gl = canvas.getContext("webgl2", {
        powerPreference: "high-performance",
      }) as WebGL2RenderingContext | null;
    }

    if (!this.gl) return false;
    const gl = this.gl;

    // 1. Shaders de Computação em Vertex Shader GLSL ES 3.00
    const vsSource = `#version 300 es
    precision highp float;

    // Entrada: [price, quantity, side (1 = Bid, -1 = Ask), distanceFromMidPct]
    layout(location = 0) in vec4 a_level;

    // Uniforms de calibração
    uniform float u_lambdaDecay;

    // Saída capturada pelo Transform Feedback: [weightedVolume, isBid, isAsk, absorptionScore]
    out vec4 v_outputMetrics;

    void main() {
      float qty = a_level.y;
      float side = a_level.z;
      float distPct = max(a_level.w, 0.0);

      // Ponderação hiperbólica/exponencial por proximidade do spread (Top of Book tem maior peso)
      float weight = exp(-u_lambdaDecay * distPct);
      float weightedVol = qty * weight;

      float isBid = (side > 0.0) ? 1.0 : 0.0;
      float isAsk = (side < 0.0) ? 1.0 : 0.0;

      // Score de absorção: níveis próximos com volume desproporcional
      float absorption = (distPct < 0.001) ? (qty * 1.5) : (qty * weight);

      v_outputMetrics = vec4(weightedVol, isBid, isAsk, absorption);

      // Posição fictícia pois o rasterizador será descartado (RASTERIZER_DISCARD)
      gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
    }`;

    // Fragment shader dummy necessário para compilação do WebGLProgram
    const fsSource = `#version 300 es
    precision mediump float;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(0.0);
    }`;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return false;

    this.program = gl.createProgram();
    if (!this.program) return false;

    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);

    // CRÍTICO: Definir varyings do Transform Feedback ANTES de linkar o programa
    gl.transformFeedbackVaryings(
      this.program,
      ["v_outputMetrics"],
      gl.INTERLEAVED_ATTRIBS
    );

    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("TF Program Link Error:", gl.getProgramInfoLog(this.program));
      return false;
    }

    // Configurar Uniforms
    const uLambda = gl.getUniformLocation(this.program, "u_lambdaDecay");
    gl.useProgram(this.program);
    gl.uniform1f(uLambda, this.lambdaDecay);

    // 2. Configurar VAO e Input VBO
    this.inputVao = gl.createVertexArray();
    gl.bindVertexArray(this.inputVao);

    this.inputBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inputBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.inputData.byteLength, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 4 * 4, 0);

    gl.bindVertexArray(null);

    // 3. Configurar Transform Feedback e Output VBO
    this.outputBuffer = gl.createBuffer();
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.outputBuffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, this.outputData.byteLength, gl.DYNAMIC_READ);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);

    this.transformFeedback = gl.createTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.outputBuffer);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("TF Shader Compile Error:", this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Executa o cálculo paralelo do desbalanceamento na GPU para uma coleção de níveis L2.
   * Desativa o rasterizador da GPU (RASTERIZER_DISCARD), alcançando velocidade pura de computação.
   */
  public computeImbalance(levels: DepthLevelInput[]): GPUTFIImbalanceMetrics {
    const count = Math.min(levels.length, this.maxLevels);
    if (count === 0) {
      return {
        imbalanceRatio: 0,
        weightedBidVolume: 0,
        weightedAskVolume: 0,
        absorptionPressure: 0,
        dominantSide: "BALANCED",
        processedLevels: 0,
      };
    }

    // 1. Popula buffer de entrada contíguo Float32Array
    for (let i = 0; i < count; i++) {
      const l = levels[i];
      const offset = i * 4;
      this.inputData[offset + 0] = l.price;
      this.inputData[offset + 1] = l.quantity;
      this.inputData[offset + 2] = l.side;
      this.inputData[offset + 3] = l.distanceFromMidPct;
    }

    // 2. Executa na GPU se o contexto estiver ativo
    if (this.gl && this.program && this.inputVao && this.transformFeedback && this.outputBuffer) {
      const gl = this.gl;

      gl.useProgram(this.program);
      gl.bindVertexArray(this.inputVao);

      // Atualiza VBO de entrada
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inputBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inputData.subarray(0, count * 4));

      // Ativa Transform Feedback e descarta rasterização
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);

      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.endTransformFeedback();

      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindVertexArray(null);

      // Lê de volta os resultados agregados da GPU
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.outputBuffer);
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.outputData.subarray(0, count * 4));
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);

      return this.aggregateMetricsFromBuffer(this.outputData, count);
    }

    // 3. Fallback vetorizado equivalente para testes/headless
    return this.computeVectorizedFallback(levels, count);
  }

  /**
   * Agrega as métricas a partir da memória do buffer de saída do Transform Feedback.
   */
  private aggregateMetricsFromBuffer(buffer: Float32Array, count: number): GPUTFIImbalanceMetrics {
    let totalBidWeight = 0;
    let totalAskWeight = 0;
    let totalAbsorption = 0;

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      const weightedVol = buffer[offset + 0];
      const isBid = buffer[offset + 1];
      const isAsk = buffer[offset + 2];
      const absorption = buffer[offset + 3];

      if (isBid > 0.5) {
        totalBidWeight += weightedVol;
      } else if (isAsk > 0.5) {
        totalAskWeight += weightedVol;
      }
      totalAbsorption += absorption;
    }

    const totalWeight = totalBidWeight + totalAskWeight;
    const imbalanceRatio = totalWeight > 0 ? (totalBidWeight - totalAskWeight) / totalWeight : 0;

    let dominantSide: "BUY_DOMINANT" | "SELL_DOMINANT" | "BALANCED" = "BALANCED";
    if (imbalanceRatio > 0.20) dominantSide = "BUY_DOMINANT";
    else if (imbalanceRatio < -0.20) dominantSide = "SELL_DOMINANT";

    return {
      imbalanceRatio: Math.round(imbalanceRatio * 1000) / 1000,
      weightedBidVolume: Math.round(totalBidWeight * 100) / 100,
      weightedAskVolume: Math.round(totalAskWeight * 100) / 100,
      absorptionPressure: Math.round(totalAbsorption * 100) / 100,
      dominantSide,
      processedLevels: count,
    };
  }

  /**
   * Cálculo matemático puro equivalente executado caso WebGL 2.0 não esteja disponível.
   */
  private computeVectorizedFallback(levels: DepthLevelInput[], count: number): GPUTFIImbalanceMetrics {
    let totalBidWeight = 0;
    let totalAskWeight = 0;
    let totalAbsorption = 0;

    for (let i = 0; i < count; i++) {
      const l = levels[i];
      const weight = Math.exp(-this.lambdaDecay * Math.max(l.distanceFromMidPct, 0));
      const weightedVol = l.quantity * weight;

      if (l.side > 0) {
        totalBidWeight += weightedVol;
      } else {
        totalAskWeight += weightedVol;
      }

      totalAbsorption += l.distanceFromMidPct < 0.001 ? l.quantity * 1.5 : weightedVol;
    }

    const totalWeight = totalBidWeight + totalAskWeight;
    const imbalanceRatio = totalWeight > 0 ? (totalBidWeight - totalAskWeight) / totalWeight : 0;

    let dominantSide: "BUY_DOMINANT" | "SELL_DOMINANT" | "BALANCED" = "BALANCED";
    if (imbalanceRatio > 0.20) dominantSide = "BUY_DOMINANT";
    else if (imbalanceRatio < -0.20) dominantSide = "SELL_DOMINANT";

    return {
      imbalanceRatio: Math.round(imbalanceRatio * 1000) / 1000,
      weightedBidVolume: Math.round(totalBidWeight * 100) / 100,
      weightedAskVolume: Math.round(totalAskWeight * 100) / 100,
      absorptionPressure: Math.round(totalAbsorption * 100) / 100,
      dominantSide,
      processedLevels: count,
    };
  }

  /**
   * Obtém a referência do buffer de saída da GPU para retroalimentação de outros shaders/texturas
   * diretamente em VRAM sem passagem pela CPU.
   */
  public getOutputBuffer(): WebGLBuffer | null {
    return this.outputBuffer;
  }

  /**
   * Libera buffers, VAOs e programas de computação da VRAM.
   */
  public destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    if (this.inputBuffer) gl.deleteBuffer(this.inputBuffer);
    if (this.outputBuffer) gl.deleteBuffer(this.outputBuffer);
    if (this.inputVao) gl.deleteVertexArray(this.inputVao);
    if (this.transformFeedback) gl.deleteTransformFeedback(this.transformFeedback);
    if (this.program) gl.deleteProgram(this.program);

    this.gl = null;
  }
}
