/**
 * l2-heatmap-shader.ts - Shaders GLSL ES 3.00 & Paleta 1D de Textura em VRAM
 * 
 * Pipeline de Renderização de Livro de Ofertas L2 (Pilar 1 Institucional):
 * 1. Compressão Logarítmica de Volume / Densidade diretamente no Fragment Shader da GPU.
 * 2. Amostragem contínua via Paleta 1D de Textura (256x1 texels RGBA com filtro LINEAR)
 *    eliminando branching pesado e despesas de CPU para mapeamento de cores.
 * 3. Detecção e Bloom Óptico Bilateral de Ordens Iceberg no Canal B com interpolação temporal.
 * 4. Zero Alocações de Heap no caminho crítico de renderização.
 */

export const L2_HEATMAP_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position; // Quad unitário normalizado [-1, 1]
layout(location = 1) in vec2 a_texCoord; // Coordenadas de textura UV [0, 1]

out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const L2_HEATMAP_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 v_texCoord;

// Textura 2D do Heatmap: R = Bid Liquidity, G = Ask Liquidity, B = Iceberg Detection, A = Alpha/Weight
uniform sampler2D u_heatmapTexture;

// Paleta 1D de Textura (256x1 RGBA): Mapeia densidade normalizada [0, 1] para tons institucionais
uniform sampler2D u_palette1D;

uniform float u_alpha;
uniform vec4 u_viewBounds;   // [startIndex, visibleCount, minPrice, maxPrice]
uniform vec4 u_texBounds;    // [texMinPrice, texMaxPrice, currentCol, historyLength]
uniform vec4 u_dynamicRange; // [atr, centerPrice, compressionFactor, flags(1.0=quant, 2.0=palette, 3.0=both)]

out vec4 fragColor;

void main() {
  // 1. Reamostragem circular no eixo horizontal (tempo histórico)
  float headCol = u_texBounds.z;
  float histLen = max(u_texBounds.w, 1.0);
  float uCoord = fract(v_texCoord.x + (headCol / histLen));

  // 2. Reamostragem no eixo vertical (preço proporcional)
  float viewMinP = u_viewBounds.z;
  float viewMaxP = u_viewBounds.w;
  float texMinP = u_texBounds.x;
  float texMaxP = u_texBounds.y;

  float price = mix(viewMinP, viewMaxP, v_texCoord.y);
  float vCoord = 0.0;

  // 3. Dynamic Price Range Quantization (Logarítmica Adaptativa via ATR)
  float flags = u_dynamicRange.w;
  float atr = u_dynamicRange.x;
  bool quantOn = (flags == 1.0 || flags >= 3.0) && atr > 0.00001;

  if (quantOn) {
    float centerP = u_dynamicRange.y > 0.0 ? u_dynamicRange.y : (texMinP + texMaxP) * 0.5;
    float kappa = max(u_dynamicRange.z, 0.1);

    float x = (price - centerP) / atr;
    float xMin = (texMinP - centerP) / atr;
    float xMax = (texMaxP - centerP) / atr;

    float gX = sign(x) * log(1.0 + kappa * abs(x));
    float gMin = sign(xMin) * log(1.0 + kappa * abs(xMin));
    float gMax = sign(xMax) * log(1.0 + kappa * abs(xMax));

    vCoord = clamp((gX - gMin) / max(gMax - gMin, 0.00001), 0.0, 1.0);
  } else {
    vCoord = clamp((price - texMinP) / max(texMaxP - texMinP, 0.00001), 0.0, 1.0);
  }

  vec4 texel = texture(u_heatmapTexture, vec2(uCoord, vCoord));
  float bidIntensity = texel.r;
  float askIntensity = texel.g;
  float rawIceberg = texel.b;

  // 4. Tone Mapping Logarítmico na GPU via Paleta 1D de Textura
  bool paletteOn = (flags >= 2.0);
  float spreadRel = max(texMaxP - texMinP, 0.001);
  float volRatio = clamp((atr > 0.0 ? atr : spreadRel * 0.05) / spreadRel * 25.0, 1.5, 40.0);

  if (paletteOn) {
    bidIntensity = log(1.0 + volRatio * bidIntensity) / log(1.0 + volRatio);
    askIntensity = log(1.0 + volRatio * askIntensity) / log(1.0 + volRatio);
  }

  // 5. Dual-Axis Bloom: Convolução 1D Horizontal no Eixo Temporal (X) para ordens iceberg
  float hStep = 1.0 / histLen;
  float iceH = 0.0;
  iceH += texture(u_heatmapTexture, vec2(fract(uCoord - 2.0 * hStep), vCoord)).b * 0.06136;
  iceH += texture(u_heatmapTexture, vec2(fract(uCoord - 1.0 * hStep), vCoord)).b * 0.24477;
  iceH += rawIceberg * 0.38774;
  iceH += texture(u_heatmapTexture, vec2(fract(uCoord + 1.0 * hStep), vCoord)).b * 0.24477;
  iceH += texture(u_heatmapTexture, vec2(fract(uCoord + 2.0 * hStep), vCoord)).b * 0.06136;

  float iceberg = max(rawIceberg, iceH * 1.35);

  // 6. Amostragem na Paleta 1D de Textura
  // Metade inferior [0.0, 0.48]: Bids (Cyan/Emerald institucional)
  // Metade superior [0.52, 1.0]: Asks (Amber/Rose institucional)
  float uBidPalette = clamp(bidIntensity * 0.48, 0.0, 0.48);
  float uAskPalette = clamp(0.52 + askIntensity * 0.48, 0.52, 1.0);

  vec4 bidSample = texture(u_palette1D, vec2(uBidPalette, 0.5));
  vec4 askSample = texture(u_palette1D, vec2(uAskPalette, 0.5));

  vec3 bidColor = bidSample.rgb * bidIntensity;
  vec3 askColor = askSample.rgb * askIntensity;

  // Iceberg Halo & Glow
  float isIceCore = step(0.5, rawIceberg);
  float isIceGlow = smoothstep(0.02, 0.5, iceberg);
  float icePulse = 1.0 + 0.35 * sin(uCoord * 62.8318);

  vec3 icebergCoreColor = vec3(1.00, 0.30, 1.00) * (isIceCore * icePulse * 1.5);
  vec3 icebergGlowColor = vec3(0.88, 0.18, 1.00) * (isIceGlow * iceberg * 1.25);
  vec3 icebergColor = icebergCoreColor + icebergGlowColor;

  vec3 finalColor = bidColor + askColor + icebergColor;
  float totalDensity = clamp(bidIntensity + askIntensity + (isIceGlow * 0.8) + (isIceCore * 0.4), 0.0, 1.0);

  fragColor = vec4(finalColor, totalDensity * u_alpha);
}
`;

export const PALETTE_1D_WIDTH = 256;
export const PALETTE_1D_HEIGHT = 1;

/**
 * Gera a tabela de cores RGBA de 256x1 para a Paleta 1D de Textura.
 * [0..127]: Bids (Gradiente Contínuo do escuro até Cyan / Emerald Institucional)
 * [128..255]: Asks (Gradiente Contínuo do escuro até Amber / Rose Institucional)
 */
export function generate1DHeatmapPaletteData(): Uint8Array {
  const data = new Uint8Array(PALETTE_1D_WIDTH * 4);

  // 1. Metade Bids (0 a 127) -> Base Cyan/Emerald vec3(0.06, 0.78, 0.52)
  // Index 0 = volume zero (alpha 0); Index 127 = volume máximo (alpha 255, verde/ciano brilhante)
  for (let i = 0; i < 128; i++) {
    const t = i / 127;
    const curve = Math.pow(t, 1.4);
    const r = Math.min(255, Math.floor(15 * curve + 35 * Math.pow(t, 3)));
    const g = Math.min(255, Math.floor(220 * curve));
    const b = Math.min(255, Math.floor(140 * curve + 115 * Math.pow(t, 2)));
    const a = Math.min(255, Math.floor(255 * Math.pow(t, 0.8)));

    const offset = i * 4;
    data[offset + 0] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  // 2. Metade Asks (128 a 255) -> Base Amber/Rose vec3(0.94, 0.32, 0.25)
  // Index 128 = volume zero (alpha 0); Index 255 = volume máximo (alpha 255, âmbar/vermelho brilhante)
  for (let i = 0; i < 128; i++) {
    const t = i / 127;
    const curve = Math.pow(t, 1.4);
    const r = Math.min(255, Math.floor(245 * curve + 10 * Math.pow(t, 2)));
    const g = Math.min(255, Math.floor(95 * curve));
    const b = Math.min(255, Math.floor(65 * curve));
    const a = Math.min(255, Math.floor(255 * Math.pow(t, 0.8)));

    const offset = (128 + i) * 4;
    data[offset + 0] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  return data;
}

/**
 * Cria ou atualiza a textura WebGL 1D/2D contendo a Paleta Institucional.
 */
export function create1DTexturePalette(
  gl: WebGL2RenderingContext,
  customData?: Uint8Array
): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  const data = customData || generate1DHeatmapPaletteData();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    PALETTE_1D_WIDTH,
    PALETTE_1D_HEIGHT,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data
  );

  // Amostragem bilinear contínua sem repetição
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export interface L2HeatmapProgramLocations {
  program: WebGLProgram;
  uHeatmapTextureLoc: WebGLUniformLocation | null;
  uPalette1DLoc: WebGLUniformLocation | null;
  uAlphaLoc: WebGLUniformLocation | null;
  uViewBoundsLoc: WebGLUniformLocation | null;
  uTexBoundsLoc: WebGLUniformLocation | null;
  uDynamicRangeLoc: WebGLUniformLocation | null;
}

/**
 * Compila e linka o programa GLSL ES 3.00 com suporte a Paleta 1D de Textura.
 */
export function compileL2HeatmapProgram(
  gl: WebGL2RenderingContext
): L2HeatmapProgramLocations | null {
  function compile(type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("[l2-heatmap-shader] Shader Compile Error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = compile(gl.VERTEX_SHADER, L2_HEATMAP_VERTEX_SHADER);
  const fs = compile(gl.FRAGMENT_SHADER, L2_HEATMAP_FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[l2-heatmap-shader] Program Link Error:", gl.getProgramInfoLog(program));
    return null;
  }

  return {
    program,
    uHeatmapTextureLoc: gl.getUniformLocation(program, "u_heatmapTexture"),
    uPalette1DLoc: gl.getUniformLocation(program, "u_palette1D"),
    uAlphaLoc: gl.getUniformLocation(program, "u_alpha"),
    uViewBoundsLoc: gl.getUniformLocation(program, "u_viewBounds"),
    uTexBoundsLoc: gl.getUniformLocation(program, "u_texBounds"),
    uDynamicRangeLoc: gl.getUniformLocation(program, "u_dynamicRange"),
  };
}
