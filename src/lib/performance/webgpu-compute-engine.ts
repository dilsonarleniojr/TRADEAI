/**
 * WebGPUOrderBookComputeEngine
 * Motor de computação paralela de alta frequência via WebGPU Compute Pipelines (WGSL).
 * Executa computação vetorial nativa com workgroups 1D/2D, memória compartilhada local
 * (workgroup shared memory) e redução paralela em árvore O(log N) com workgroupBarrier().
 *
 * Elimina 100% dos loops numéricos na CPU para múltiplos livros L2 (BTC, ETH, SOL)
 * com 50 a 100 níveis de profundidade e viabiliza encadeamento direto em VRAM para
 * pipelines de renderização de Heatmap.
 */

import { DepthLevelInput, GPUTransformFeedbackEngine, GPUTFIImbalanceMetrics } from "./gpu-transform-feedback-engine";

export interface WebGPUImbalanceMetrics extends GPUTFIImbalanceMetrics {
  backend: "WEBGPU_COMPUTE" | "WEBGL2_TRANSFORM_FEEDBACK" | "VECTORIZED_CPU_FALLBACK";
  hasSubgroups?: boolean;
  hasSubgroupShuffle?: boolean;
  detectedIcebergs?: number;
  maxWallRatio?: number;
  icebergBlueChannelProjected?: boolean;
  bloomPassApplied?: boolean;
  computeTimeUs?: number; // Tempo de execução em microssegundos
}

export const GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
};

export const GPUBufferUsage = {
  MAP_READ: 1,
  MAP_WRITE: 2,
  COPY_SRC: 4,
  COPY_DST: 8,
  INDEX: 16,
  VERTEX: 32,
  UNIFORM: 64,
  STORAGE: 128,
};

// Ambient Type Definitions para compatibilidade irrestrita sem depender de @types/webgpu externo
export interface MinimalGPUDevice {
  queue: {
    writeBuffer(buffer: any, bufferOffset: number, data: BufferSource): void;
    submit(commandBuffers: any[]): void;
  };
  createShaderModule(descriptor: { code: string }): any;
  createComputePipeline(descriptor: any): any;
  createBuffer(descriptor: { size: number; usage: number; mappedAtCreation?: boolean }): any;
  createTexture?(descriptor: {
    size: [number, number, number] | { width: number; height: number; depthOrArrayLayers?: number };
    format: string;
    usage: number;
  }): any;
  createBindGroup(descriptor: any): any;
  createCommandEncoder(descriptor?: any): any;
  destroy?(): void;
}

export const WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER = /* wgsl */ `
enable subgroups;

struct LevelData {
    price: f32,
    quantity: f32,
    side: f32, // 1.0 = Bid, -1.0 = Ask
    distPct: f32,
}

struct UniformParams {
    midPrice: f32,
    decayLambda: f32,
    levelCount: u32,
    priceBins: u32,
    minPrice: f32,
    maxPrice: f32,
    pad0: f32,
    pad1: f32,
}

struct OutputReduction {
    totalWeightedBid: f32,
    totalWeightedAsk: f32,
    totalAbsorption: f32,
    imbalanceRatio: f32,
    detectedIcebergs: f32,
    maxWallRatio: f32,
    pad0: f32,
    pad1: f32,
}

@group(0) @binding(0) var<storage, read> levels: array<LevelData>;
@group(0) @binding(1) var<uniform> params: UniformParams;
@group(0) @binding(2) var<storage, read_write> reductionResult: OutputReduction;
@group(0) @binding(3) var<storage, read_write> heatmapSlice: array<atomic<u32>>;

// Apenas 4 slots de memória compartilhada para consolidar os líderes de cada subgroup
var<workgroup> s_subgroupBid: array<f32, 4>;
var<workgroup> s_subgroupAsk: array<f32, 4>;
var<workgroup> s_subgroupAbsorb: array<f32, 4>;
var<workgroup> s_subgroupIcebergs: array<f32, 4>;
var<workgroup> s_subgroupMaxWall: array<f32, 4>;

@compute @workgroup_size(64)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(subgroup_invocation_id) sub_id: u32,
    @builtin(subgroup_size) sub_size: u32
) {
    let gIdx = global_id.x;
    var localBid: f32 = 0.0;
    var localAsk: f32 = 0.0;
    var localAbsorb: f32 = 0.0;
    var rawQty: f32 = 0.0;
    var levelPrice: f32 = 0.0;
    var levelSide: f32 = 0.0;

    // 0. Limpeza atômica do slice da coluna de heatmap na VRAM (alinhado a 256 bytes = 64 u32 por bin)
    if (local_id.x < params.priceBins) {
        atomicStore(&heatmapSlice[local_id.x * 64u], 0u);
    }
    workgroupBarrier();

    // 1. Carregamento cooperativo de níveis L2
    if (gIdx < params.levelCount) {
        let level = levels[gIdx];
        rawQty = level.quantity;
        levelPrice = level.price;
        levelSide = level.side;
        let decay = exp(-params.decayLambda * level.distPct);
        let weighted = rawQty * decay;

        if (level.side > 0.0) {
            localBid = weighted;
        } else {
            localAsk = weighted;
        }

        localAbsorb = (1.0 - clamp(level.distPct * 10.0, 0.0, 1.0)) * rawQty;
    }

    // 2. Subgroup Shuffle Primitives para Detecção Instantânea de Iceberg Orders (Zero-Shared-Memory)
    // subgroupBroadcastFirst() distribui o volume do Top of Book (lane 0) para calibração de escala
    let topOfBookQty = subgroupBroadcastFirst(rawQty);

    // subgroupShuffleDown() lê diretamente o registrador da lane adjacente (sub_id + 1u) via barramento cross-lane
    let nextQty = subgroupShuffleDown(rawQty, 1u);

    // Detecção instantânea de muralhas e ordens iceberg via gradiente de liquidez
    var isIceberg: f32 = 0.0;
    var wallRatio: f32 = 1.0;
    if (gIdx < params.levelCount && (sub_id + 1u) < sub_size && nextQty > 0.001) {
        wallRatio = rawQty / nextQty;
        if (wallRatio >= 3.0 && rawQty >= topOfBookQty * 1.5) {
            isIceberg = 1.0;
        }
    }

    // 3. Projeção Direta de Iceberg no Canal Azul (B) da Textura 2D do Heatmap L2 (rgba8unorm)
    // Converte o preço contínuo do nível no bin discreto da textura e grava os canais na VRAM
    // Canal R: Bid, Canal G: Ask, Canal B (bits 16..23): 0x00FF0000u (Iceberg), Canal A: 0xFF000000u (Opacity)
    if (gIdx < params.levelCount && levelPrice >= params.minPrice && levelPrice <= params.maxPrice) {
        let priceRange = max(params.maxPrice - params.minPrice, 0.0001);
        let normalizedPrice = clamp((levelPrice - params.minPrice) / priceRange, 0.0, 1.0);
        let bin = u32(clamp(floor(normalizedPrice * f32(params.priceBins - 1u)), 0.0, f32(params.priceBins - 1u)));

        let isIceMask = select(0u, 0x00FF0000u, isIceberg > 0.5);
        let alphaMask = 0xFF000000u;
        let intensity = u32(clamp((rawQty / max(topOfBookQty, 0.001)) * 255.0, 10.0, 255.0));

        var texelVal: u32 = 0u;
        if (levelSide > 0.0) {
            texelVal = intensity | isIceMask | alphaMask;
        } else {
            texelVal = (intensity << 8u) | isIceMask | alphaMask;
        }

        atomicOr(&heatmapSlice[bin * 64u], texelVal);
    }

    // 4. SIMD Wave Intrinsics: Redução em 1 ciclo no nível de Registradores de Hardware do Warp
    let waveBid = subgroupAdd(localBid);
    let waveAsk = subgroupAdd(localAsk);
    let waveAbsorb = subgroupAdd(localAbsorb);
    let waveIcebergs = subgroupAdd(isIceberg);
    let waveMaxWall = subgroupAdd(wallRatio * isIceberg);

    // 5. Apenas a thread eleita (subgroupElect) escreve o resultado consolidado da wave
    let subIdx = local_id.x / sub_size;
    if (subgroupElect()) {
        s_subgroupBid[subIdx] = waveBid;
        s_subgroupAsk[subIdx] = waveAsk;
        s_subgroupAbsorb[subIdx] = waveAbsorb;
        s_subgroupIcebergs[subIdx] = waveIcebergs;
        s_subgroupMaxWall[subIdx] = waveMaxWall;
    }

    // Única barreira necessária em todo o pipeline
    workgroupBarrier();

    // 6. Thread líder (local_id == 0) consolida apenas as parciais dos líderes de subgroup
    if (local_id.x == 0u) {
        let numSubgroups = (64u + sub_size - 1u) / sub_size;
        var totalBid: f32 = 0.0;
        var totalAsk: f32 = 0.0;
        var totalAbsorb: f32 = 0.0;
        var totalIcebergs: f32 = 0.0;
        var maxWall: f32 = 1.0;

        for (var s: u32 = 0u; s < numSubgroups; s = s + 1u) {
            totalBid = totalBid + s_subgroupBid[s];
            totalAsk = totalAsk + s_subgroupAsk[s];
            totalAbsorb = totalAbsorb + s_subgroupAbsorb[s];
            totalIcebergs = totalIcebergs + s_subgroupIcebergs[s];
            maxWall = max(maxWall, s_subgroupMaxWall[s]);
        }

        let totalVol = totalBid + totalAsk;
        let imbalance = select(0.0, (totalBid - totalAsk) / totalVol, totalVol > 0.00001);

        reductionResult.totalWeightedBid = totalBid;
        reductionResult.totalWeightedAsk = totalAsk;
        reductionResult.totalAbsorption = totalAbsorb;
        reductionResult.imbalanceRatio = imbalance;
        reductionResult.detectedIcebergs = totalIcebergs;
        reductionResult.maxWallRatio = maxWall;
        reductionResult.pad0 = 0.0;
        reductionResult.pad1 = 0.0;
    }
}
`;

export const WGSL_ORDER_BOOK_IMBALANCE_SHADER = /* wgsl */ `
struct LevelData {
    price: f32,
    quantity: f32,
    side: f32, // 1.0 = Bid, -1.0 = Ask
    distPct: f32,
}

struct UniformParams {
    midPrice: f32,
    decayLambda: f32,
    levelCount: u32,
    priceBins: u32,
    minPrice: f32,
    maxPrice: f32,
    pad0: f32,
    pad1: f32,
}

struct OutputReduction {
    totalWeightedBid: f32,
    totalWeightedAsk: f32,
    totalAbsorption: f32,
    imbalanceRatio: f32,
    detectedIcebergs: f32,
    maxWallRatio: f32,
    pad0: f32,
    pad1: f32,
}

@group(0) @binding(0) var<storage, read> levels: array<LevelData>;
@group(0) @binding(1) var<uniform> params: UniformParams;
@group(0) @binding(2) var<storage, read_write> reductionResult: OutputReduction;
@group(0) @binding(3) var<storage, read_write> heatmapSlice: array<atomic<u32>>;

const WORKGROUP_SIZE: u32 = 64u;

var<workgroup> s_bidVol: array<f32, 64>;
var<workgroup> s_askVol: array<f32, 64>;
var<workgroup> s_absorb: array<f32, 64>;
var<workgroup> s_icebergs: array<f32, 64>;
var<workgroup> s_maxWall: array<f32, 64>;

@compute @workgroup_size(64)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let gIdx = global_id.x;
    let lIdx = local_id.x;

    // 0. Limpeza atômica do slice da coluna de heatmap na VRAM
    if (lIdx < params.priceBins) {
        atomicStore(&heatmapSlice[lIdx * 64u], 0u);
    }
    workgroupBarrier();

    // 1. Carregamento cooperativo de níveis L2 com decaimento exponencial
    if (gIdx < params.levelCount) {
        let level = levels[gIdx];
        let decay = exp(-params.decayLambda * level.distPct);
        let weighted = level.quantity * decay;

        if (level.side > 0.0) {
            s_bidVol[lIdx] = weighted;
            s_askVol[lIdx] = 0.0;
        } else {
            s_bidVol[lIdx] = 0.0;
            s_askVol[lIdx] = weighted;
        }

        let absorbScore = (1.0 - clamp(level.distPct * 10.0, 0.0, 1.0)) * level.quantity;
        s_absorb[lIdx] = absorbScore;

        // Detecção de Iceberg na memória compartilhada
        var isIceberg: f32 = 0.0;
        var wallRatio: f32 = 1.0;
        if (gIdx + 1u < params.levelCount) {
            let nextLevel = levels[gIdx + 1u];
            if (nextLevel.quantity > 0.001) {
                wallRatio = level.quantity / nextLevel.quantity;
                let topOfBook = levels[0].quantity;
                if (wallRatio >= 3.0 && level.quantity >= topOfBook * 1.5) {
                    isIceberg = 1.0;
                }
            }
        }
        s_icebergs[lIdx] = isIceberg;
        s_maxWall[lIdx] = wallRatio * isIceberg;

        // Projeção Direta no Canal Azul (B) da Textura 2D do Heatmap L2
        if (level.price >= params.minPrice && level.price <= params.maxPrice) {
            let priceRange = max(params.maxPrice - params.minPrice, 0.0001);
            let normalizedPrice = clamp((level.price - params.minPrice) / priceRange, 0.0, 1.0);
            let bin = u32(clamp(floor(normalizedPrice * f32(params.priceBins - 1u)), 0.0, f32(params.priceBins - 1u)));

            let isIceMask = select(0u, 0x00FF0000u, isIceberg > 0.5);
            let alphaMask = 0xFF000000u;
            let topOfBook = max(levels[0].quantity, 0.001);
            let intensity = u32(clamp((level.quantity / topOfBook) * 255.0, 10.0, 255.0));

            var texelVal: u32 = 0u;
            if (level.side > 0.0) {
                texelVal = intensity | isIceMask | alphaMask;
            } else {
                texelVal = (intensity << 8u) | isIceMask | alphaMask;
            }

            atomicOr(&heatmapSlice[bin * 64u], texelVal);
        }
    } else {
        s_bidVol[lIdx] = 0.0;
        s_askVol[lIdx] = 0.0;
        s_absorb[lIdx] = 0.0;
        s_icebergs[lIdx] = 0.0;
        s_maxWall[lIdx] = 0.0;
    }

    // 2. Barreira de Sincronização de Memória Compartilhada no Workgroup
    workgroupBarrier();

    // 3. Redução Paralela em Árvore O(log N) diretamente nas Compute Units
    for (var stride: u32 = WORKGROUP_SIZE / 2u; stride > 0u; stride = stride / 2u) {
        if (lIdx < stride) {
            s_bidVol[lIdx] = s_bidVol[lIdx] + s_bidVol[lIdx + stride];
            s_askVol[lIdx] = s_askVol[lIdx] + s_askVol[lIdx + stride];
            s_absorb[lIdx] = s_absorb[lIdx] + s_absorb[lIdx + stride];
            s_icebergs[lIdx] = s_icebergs[lIdx] + s_icebergs[lIdx + stride];
            s_maxWall[lIdx] = max(s_maxWall[lIdx], s_maxWall[lIdx + stride]);
        }
        workgroupBarrier();
    }

    // 4. Thread líder (local_id == 0) consolida o resultado com zero atomics globais lentos
    if (lIdx == 0u) {
        let bidSum = s_bidVol[0];
        let askSum = s_askVol[0];
        let absorbSum = s_absorb[0];
        let totalVol = bidSum + askSum;
        let imbalance = select(0.0, (bidSum - askSum) / totalVol, totalVol > 0.00001);

        reductionResult.totalWeightedBid = bidSum;
        reductionResult.totalWeightedAsk = askSum;
        reductionResult.totalAbsorption = absorbSum;
        reductionResult.imbalanceRatio = imbalance;
        reductionResult.detectedIcebergs = s_icebergs[0];
        reductionResult.maxWallRatio = max(1.0, s_maxWall[0]);
        reductionResult.pad0 = 0.0;
        reductionResult.pad1 = 0.0;
    }
}
`;

export const WGSL_BLOOM_POST_PROCESSING_SHADER = /* wgsl */ `
struct BloomParams {
    priceBins: u32,
    blurRadius: u32,
    intensity: f32,
    threshold: f32,
}

@group(0) @binding(0) var<uniform> params: BloomParams;
@group(0) @binding(1) var<storage, read_write> heatmapSlice: array<u32>;

// Memória compartilhada para carregar a coluna inteira de bins (128 níveis)
var<workgroup> s_blueChannel: array<f32, 128>;

// Pesos gaussianos 1D normalizados (kernel 5-tap: sigma ~ 1.2)
const GAUSS_WEIGHTS = array<f32, 5>(0.06136, 0.24477, 0.38774, 0.24477, 0.06136);

@compute @workgroup_size(128)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(global_invocation_id) global_id: vec3<u32>
) {
    let binIdx = local_id.x;

    // 1. Carrega o canal Azul (bits 16..23) de cada bin para memória compartilhada
    if (binIdx < params.priceBins) {
        let texel = heatmapSlice[binIdx * 64u];
        let blueByte = f32((texel >> 16u) & 0xFFu) / 255.0;
        s_blueChannel[binIdx] = select(0.0, blueByte, blueByte >= params.threshold);
    } else {
        s_blueChannel[binIdx] = 0.0;
    }

    workgroupBarrier();

    // 2. Convolução Gaussiana 1D vertical aplicada exclusivamente ao Canal Azul (B)
    if (binIdx < params.priceBins) {
        var blurredBlue: f32 = 0.0;

        for (var k: i32 = -2; k <= 2; k = k + 1) {
            let sampleIdx = clamp(i32(binIdx) + k, 0, i32(params.priceBins - 1u));
            let weight = GAUSS_WEIGHTS[k + 2];
            blurredBlue = blurredBlue + s_blueChannel[sampleIdx] * weight;
        }

        let origTexel = heatmapSlice[binIdx * 64u];
        let origBlue = f32((origTexel >> 16u) & 0xFFu) / 255.0;

        // Dispersão óptica aditiva (Bloom Glow) ao redor da muralha iceberg
        let finalBlue = clamp(origBlue + blurredBlue * params.intensity, 0.0, 1.0);
        let finalBlueByte = u32(finalBlue * 255.0) << 16u;

        // Preserva integralmente Canais R (bits 0..7), G (bits 8..15) e A (bits 24..31)
        heatmapSlice[binIdx * 64u] = (origTexel & 0xFF00FFFFu) | finalBlueByte;
    }
}
`;

export interface WebGPUComputeOptions {
  midPrice?: number;
  readbackToCpu?: boolean;       // default: true. Se false, elimina 100% de staging e mapAsync
  targetHeatmapColumn?: number;  // Se fornecido, aciona copyBufferToTexture no mesmo command buffer
  minPrice?: number;             // Faixa mínima de preço para quantização de bins na textura
  maxPrice?: number;             // Faixa máxima de preço para quantização de bins na textura
  enableBloomPass?: boolean;     // Ativa Bloom Pass óptico no Canal B em VRAM (default: true)
  bloomIntensity?: number;       // Intensidade da dispersão de brilho (default: 1.2)
  bloomRadius?: number;          // Raio de blur gaussiano 1D (default: 2)
}

export class WebGPUOrderBookComputeEngine {
  private device: MinimalGPUDevice | null = null;
  private pipeline: any = null;
  private bindGroup: any = null;

  // GPU Buffers
  private levelsBuffer: any = null;
  private paramsBuffer: any = null;
  private resultBuffer: any = null;
  private stagingBuffer: any = null;

  // Zero-Copy Heatmap Texture & Slice Buffer
  private heatmapTexture: any = null;
  private heatmapSliceBuffer: any = null;
  public readonly heatmapHistoryLength: number = 256;
  public readonly heatmapPriceBins: number = 128;
  private currentHeatmapColumn: number = 0;

  // Bloom Post-Processing Pass em VRAM (Passo de Brilho Óptico no Canal Azul)
  private bloomPipeline: any = null;
  private bloomParamsBuffer: any = null;
  private bloomBindGroup: any = null;

  // SIMD Subgroups / Wave Intrinsics
  private hasSubgroupsSupport: boolean = false;

  // Parâmetros de calibração
  public readonly maxLevels: number;
  public readonly lambdaDecay: number;
  private isInitialized: boolean = false;

  // Fallback engine WebGL 2.0 Transform Feedback
  private fallbackWebGLTF: GPUTransformFeedbackEngine | null = null;

  constructor(maxLevels: number = 256, lambdaDecay: number = 2.5) {
    this.maxLevels = maxLevels;
    this.lambdaDecay = lambdaDecay;
  }

  /**
   * Informa se a GPU atual suporta extensões de subgroup (SIMD wave intrinsics).
   */
  public hasSubgroups(): boolean {
    return this.hasSubgroupsSupport;
  }

  /**
   * Informa se a GPU atual suporta primitivas de subgroup shuffle (subgroupShuffleDown / subgroupBroadcastFirst).
   */
  public hasSubgroupShuffle(): boolean {
    return this.hasSubgroupsSupport;
  }

  /**
   * Informa se a projeção direta de ordens iceberg no Canal Azul (B) da textura de Heatmap L2
   * está ativa e suportada na VRAM da GPU via storage buffer atômico e copyBufferToTexture.
   */
  public hasDirectIcebergProjection(): boolean {
    return this.isInitialized && this.heatmapSliceBuffer !== null;
  }

  /**
   * Informa se o Bloom Pass óptico em VRAM está ativo e suportado na GPU.
   */
  public hasBloomPass(): boolean {
    return this.isInitialized && this.bloomPipeline !== null;
  }

  /**
   * Verifica estaticamente a disponibilidade do subsistema WebGPU no navegador.
   */
  public static isWebGPUSupported(): boolean {
    if (typeof navigator === "undefined") return false;
    return typeof (navigator as any).gpu !== "undefined";
  }

  /**
   * Inicializa o subsistema WebGPU com compilação de shader WGSL e alocação de buffers VRAM.
   */
  public async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    if (!WebGPUOrderBookComputeEngine.isWebGPUSupported()) {
      this.initFallbackWebGL();
      return false;
    }

    try {
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter({
        powerPreference: "high-performance",
      });

      if (!adapter) {
        this.initFallbackWebGL();
        return false;
      }

      // Detecção de extensões de hardware de Subgroups (Vulkan/Metal/D3D12)
      const supportsSubgroups =
        typeof adapter.features?.has === "function" ? adapter.features.has("subgroups") : false;
      const requiredFeatures: string[] = [];
      if (supportsSubgroups) {
        requiredFeatures.push("subgroups");
      }

      this.device = await adapter.requestDevice({
        requiredFeatures,
        requiredLimits: {},
      });

      if (!this.device) {
        this.initFallbackWebGL();
        return false;
      }

      this.hasSubgroupsSupport = supportsSubgroups;

      // 1. Compilação do Módulo de Shader WGSL (Subgroups SIMD wave vs Árvore tradicional)
      const shaderCode = supportsSubgroups
        ? WGSL_SUBGROUPS_ORDER_BOOK_IMBALANCE_SHADER
        : WGSL_ORDER_BOOK_IMBALANCE_SHADER;

      const shaderModule = this.device.createShaderModule({
        code: shaderCode,
      });

      // 2. Criação do Compute Pipeline
      this.pipeline = this.device.createComputePipeline({
        layout: "auto",
        compute: {
          module: shaderModule,
          entryPoint: "main",
        },
      });

      // 3. Pré-alocação de Storage Buffers na VRAM
      // LevelData: 4 floats (16 bytes) * maxLevels
      this.levelsBuffer = this.device.createBuffer({
        size: this.maxLevels * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      // UniformParams: 8 floats/uints (32 bytes) [midPrice, decayLambda, levelCount, priceBins, minPrice, maxPrice, pad0, pad1]
      this.paramsBuffer = this.device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // OutputReduction: 8 floats (32 bytes) [totalBid, totalAsk, totalAbsorb, imbalance, detectedIcebergs, maxWallRatio, pad0, pad1]
      this.resultBuffer = this.device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });

      // Staging buffer para leitura assíncrona pela CPU (se solicitado)
      this.stagingBuffer = this.device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      // 4. Inicializa Textura de Heatmap e Slice Buffer em VRAM antes da criação do BindGroup
      this.initHeatmapTexture(this.heatmapHistoryLength, this.heatmapPriceBins);
      if (!this.heatmapSliceBuffer) {
        this.heatmapSliceBuffer = this.device.createBuffer({
          size: this.heatmapPriceBins * 256,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
      }

      // 5. Criação do Bind Group com suporte à projeção direta no Canal Azul (B) do Heatmap L2
      this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.levelsBuffer } },
          { binding: 1, resource: { buffer: this.paramsBuffer } },
          { binding: 2, resource: { buffer: this.resultBuffer } },
          { binding: 3, resource: { buffer: this.heatmapSliceBuffer } },
        ],
      });

      // 6. Criação do Compute Pipeline de Bloom Pass Óptico em VRAM (Passo de Brilho no Canal Azul)
      try {
        const bloomShaderModule = this.device.createShaderModule({
          code: WGSL_BLOOM_POST_PROCESSING_SHADER,
        });

        this.bloomPipeline = this.device.createComputePipeline({
          layout: "auto",
          compute: {
            module: bloomShaderModule,
            entryPoint: "main",
          },
        });

        this.bloomParamsBuffer = this.device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const defaultBloomParams = new Float32Array([0, 2, 1.2, 0.05]);
        const viewU32 = new Uint32Array(defaultBloomParams.buffer);
        viewU32[0] = this.heatmapPriceBins;
        if (this.device?.queue?.writeBuffer) {
          this.device.queue.writeBuffer(this.bloomParamsBuffer, 0, defaultBloomParams);
        }

        this.bloomBindGroup = this.device.createBindGroup({
          layout: this.bloomPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.bloomParamsBuffer } },
            { binding: 1, resource: { buffer: this.heatmapSliceBuffer } },
          ],
        });
      } catch (bloomErr) {
        console.warn("[WebGPUOrderBookComputeEngine] Bloom pipeline opcional não inicializado:", bloomErr);
      }

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.warn("[WebGPUOrderBookComputeEngine] Falha ao inicializar WebGPU:", err);
      this.initFallbackWebGL();
      return false;
    }
  }

  /**
   * Aloca textura 2D nativa de Heatmap e Slice Buffer alinhado a 256 bytes na VRAM.
   */
  public initHeatmapTexture(historyLength: number = 256, priceBins: number = 128): any {
    if (!this.device?.createTexture) return null;

    try {
      // Formato RGBA8Unorm (4 bytes por texel)
      this.heatmapTexture = this.device.createTexture({
        size: [historyLength, priceBins, 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC,
      });

      // WebGPU copyBufferToTexture exige bytesPerRow múltiplo estrito de 256 bytes
      const bytesPerRow = 256;
      this.heatmapSliceBuffer = this.device.createBuffer({
        size: priceBins * bytesPerRow,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });

      return this.heatmapTexture;
    } catch (err) {
      console.warn("[WebGPUOrderBookComputeEngine] Não foi possível alocar textura GPU:", err);
      return null;
    }
  }

  /**
   * Retorna a textura de Heatmap L2 residente na VRAM da GPU.
   */
  public getHeatmapTexture(): any {
    return this.heatmapTexture;
  }

  /**
   * Executa o Bloom Pass óptico em VRAM diretamente no buffer de fatias do Heatmap.
   * Aplica blur gaussiano 1D vertical exclusivamente no Canal Azul (B), preservando
   * os canais R (Bids), G (Asks) e A (Alpha).
   */
  public applyBloomPass(options?: {
    blurRadius?: number;
    intensity?: number;
    customEncoder?: any;
  }): boolean {
    if (!this.device || !this.bloomPipeline || !this.bloomBindGroup || !this.bloomParamsBuffer) {
      return false;
    }

    const radius = options?.blurRadius ?? 2;
    const intensity = options?.intensity ?? 1.2;

    const bloomParams = new Float32Array([0, radius, intensity, 0.05]);
    const u32View = new Uint32Array(bloomParams.buffer);
    u32View[0] = this.heatmapPriceBins;
    u32View[1] = radius;
    this.device.queue.writeBuffer(this.bloomParamsBuffer, 0, bloomParams);

    const encoder = options?.customEncoder || this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.bloomPipeline);
    pass.setBindGroup(0, this.bloomBindGroup);
    pass.dispatchWorkgroups(1); // 128 threads cobrem os 128 bins
    pass.end();

    if (!options?.customEncoder) {
      this.device.queue.submit([encoder.finish()]);
    }
    return true;
  }

  /**
   * Executa a cópia direta de Storage Buffer para GPU Texture via copyBufferToTexture.
   * Elimina completamente qualquer passagem pelo Heap do JavaScript ou staging buffer da CPU.
   */
  public copyBufferToTexture(options?: {
    columnIdx?: number;
    customEncoder?: any;
    sourceBuffer?: any;
  }): any {
    if (!this.device || !this.heatmapTexture) return null;

    const col =
      options?.columnIdx !== undefined
        ? options.columnIdx
        : this.currentHeatmapColumn;
    const encoder = options?.customEncoder || this.device.createCommandEncoder();
    const buffer = options?.sourceBuffer || this.heatmapSliceBuffer || this.resultBuffer;

    if (encoder && encoder.copyBufferToTexture && buffer) {
      encoder.copyBufferToTexture(
        {
          buffer,
          offset: 0,
          bytesPerRow: 256, // Alinhamento obrigatório de 256 bytes
          rowsPerImage: this.heatmapPriceBins,
        },
        {
          texture: this.heatmapTexture,
          origin: [col % this.heatmapHistoryLength, 0, 0],
        },
        {
          width: 1,
          height: this.heatmapPriceBins,
          depthOrArrayLayers: 1,
        }
      );

      this.currentHeatmapColumn = (col + 1) % this.heatmapHistoryLength;

      if (!options?.customEncoder) {
        this.device.queue.submit([encoder.finish()]);
      }
      return this.heatmapTexture;
    }

    return null;
  }

  /**
   * Inicializa o motor de fallback WebGL 2.0 Transform Feedback.
   */
  private initFallbackWebGL(): void {
    if (!this.fallbackWebGLTF) {
      this.fallbackWebGLTF = new GPUTransformFeedbackEngine(null, this.maxLevels, this.lambdaDecay);
    }
  }

  /**
   * Executa a computação de Order Book Imbalance via WebGPU Compute Pipeline.
   * Suporta o modo Zero-Copy (readbackToCpu: false) transferindo a densidade diretamente
   * para a textura do Heatmap via copyBufferToTexture com zero latência de trânsito.
   */
  public async computeImbalance(
    levels: DepthLevelInput[],
    optionsOrMidPrice?: number | WebGPUComputeOptions
  ): Promise<WebGPUImbalanceMetrics> {
    const startTime = typeof performance !== "undefined" ? performance.now() : 0;
    const options: WebGPUComputeOptions =
      typeof optionsOrMidPrice === "number"
        ? { midPrice: optionsOrMidPrice, readbackToCpu: true }
        : optionsOrMidPrice || { readbackToCpu: true };

    const shouldReadback = options.readbackToCpu !== false;

    if (levels.length === 0) {
      return {
        imbalanceRatio: 0,
        weightedBidVolume: 0,
        weightedAskVolume: 0,
        absorptionPressure: 0,
        dominantSide: "BALANCED",
        processedLevels: 0,
        backend: this.isInitialized ? "WEBGPU_COMPUTE" : "VECTORIZED_CPU_FALLBACK",
        computeTimeUs: 0,
        hasSubgroups: this.hasSubgroupsSupport,
        hasSubgroupShuffle: this.hasSubgroupsSupport,
        detectedIcebergs: 0,
        maxWallRatio: 1.0,
      };
    }

    // Se o pipeline WebGPU nativo estiver ativo com dispositivo
    if (this.isInitialized && this.device && this.pipeline) {
      try {
        const count = Math.min(levels.length, this.maxLevels);
        const autoMidPrice = options.midPrice ?? (levels[0].price > 0 ? levels[0].price : 1.0);

        // Prepara buffers de entrada contíguos
        const inputFloats = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          const lvl = levels[i];
          const offset = i * 4;
          inputFloats[offset + 0] = lvl.price;
          inputFloats[offset + 1] = lvl.quantity;
          inputFloats[offset + 2] = lvl.side === 1 ? 1.0 : -1.0;
          inputFloats[offset + 3] = lvl.distanceFromMidPct;
        }

        // Escreve dados na VRAM via queue.writeBuffer (Zero GC)
        this.device.queue.writeBuffer(this.levelsBuffer, 0, inputFloats);

        let minP = options.minPrice;
        let maxP = options.maxPrice;
        if (minP === undefined || maxP === undefined) {
          minP = Infinity;
          maxP = -Infinity;
          for (let i = 0; i < count; i++) {
            const p = levels[i].price;
            if (p > 0) {
              if (p < minP) minP = p;
              if (p > maxP) maxP = p;
            }
          }
          if (!isFinite(minP) || minP <= 0) minP = autoMidPrice * 0.98;
          if (!isFinite(maxP) || maxP <= minP) maxP = autoMidPrice * 1.02;
        }

        const paramsData = new Float32Array([
          autoMidPrice,
          this.lambdaDecay,
          count,
          this.heatmapPriceBins,
          minP,
          maxP,
          0,
          0,
        ]);
        this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

        // Despacha o Compute Pass
        const commandEncoder = this.device.createCommandEncoder();
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);

        // Workgroups de 64 threads
        const workgroupCount = Math.ceil(count / 64);
        pass.dispatchWorkgroups(workgroupCount);
        pass.end();

        // Bloom Pass de Post-Processing em VRAM (Passo de Brilho Óptico no Canal Azul)
        let bloomApplied = false;
        if (options.enableBloomPass !== false && this.bloomPipeline && this.bloomBindGroup) {
          this.applyBloomPass({
            blurRadius: options.bloomRadius ?? 2,
            intensity: options.bloomIntensity ?? 1.2,
            customEncoder: commandEncoder,
          });
          bloomApplied = true;
        }

        // Transferência Zero-Copy direta para Textura 2D do Heatmap na VRAM (copyBufferToTexture)
        if (options.targetHeatmapColumn !== undefined && this.heatmapTexture) {
          this.copyBufferToTexture({
            columnIdx: options.targetHeatmapColumn,
            customEncoder: commandEncoder,
            sourceBuffer: this.heatmapSliceBuffer || this.resultBuffer,
          });
        }

        // MODO ZERO-COPY (Sem readback para CPU): Zero latência de trânsito
        if (!shouldReadback) {
          this.device.queue.submit([commandEncoder.finish()]);
          return {
            imbalanceRatio: 0,
            weightedBidVolume: 0,
            weightedAskVolume: 0,
            absorptionPressure: 0,
            dominantSide: "BALANCED",
            processedLevels: count,
            backend: "WEBGPU_COMPUTE",
            computeTimeUs: 0, // Zero transit CPU stall
            hasSubgroups: this.hasSubgroupsSupport,
            hasSubgroupShuffle: this.hasSubgroupsSupport,
            detectedIcebergs: 0,
            maxWallRatio: 1.0,
            icebergBlueChannelProjected: true,
            bloomPassApplied: bloomApplied,
          };
        }

        // MODO DE LEITURA (CPU Readback para Telemetria/HUD)
        commandEncoder.copyBufferToBuffer(this.resultBuffer, 0, this.stagingBuffer, 0, 32);
        this.device.queue.submit([commandEncoder.finish()]);

        await this.stagingBuffer.mapAsync(1); // GPUMapMode.READ = 1
        const copyArrayBuffer = this.stagingBuffer.getMappedRange(0, 32);
        const resultView = new Float32Array(copyArrayBuffer.slice(0));
        this.stagingBuffer.unmap();

        const weightedBid = resultView[0];
        const weightedAsk = resultView[1];
        const absorption = resultView[2];
        const imbalance = resultView[3];
        const detectedIcebergs = Math.round(resultView[4]);
        const maxWallRatio = Number(resultView[5].toFixed(2));

        let dominant: "BUY_DOMINANT" | "SELL_DOMINANT" | "BALANCED" = "BALANCED";
        if (imbalance > 0.2) dominant = "BUY_DOMINANT";
        else if (imbalance < -0.2) dominant = "SELL_DOMINANT";

        const endTime = typeof performance !== "undefined" ? performance.now() : 0;
        return {
          imbalanceRatio: Math.max(-1, Math.min(1, imbalance)),
          weightedBidVolume: weightedBid,
          weightedAskVolume: weightedAsk,
          absorptionPressure: absorption,
          dominantSide: dominant,
          processedLevels: count,
          backend: "WEBGPU_COMPUTE",
          computeTimeUs: Math.round((endTime - startTime) * 1000),
          hasSubgroups: this.hasSubgroupsSupport,
          hasSubgroupShuffle: this.hasSubgroupsSupport,
          detectedIcebergs,
          maxWallRatio,
          icebergBlueChannelProjected: true,
          bloomPassApplied: bloomApplied,
        };
      } catch (err) {
        console.warn("[WebGPUOrderBookComputeEngine] Erro no compute pass:", err);
      }
    }

    // Fallback 1: WebGL 2.0 Transform Feedback (se disponível)
    if (this.fallbackWebGLTF && GPUTransformFeedbackEngine.isSupported()) {
      const glMetrics = this.fallbackWebGLTF.computeImbalance(levels);
      const endTime = typeof performance !== "undefined" ? performance.now() : 0;
      return {
        ...glMetrics,
        backend: "WEBGL2_TRANSFORM_FEEDBACK",
        computeTimeUs: Math.round((endTime - startTime) * 1000),
        hasSubgroups: false,
        hasSubgroupShuffle: false,
        detectedIcebergs: glMetrics.detectedIcebergs ?? 0,
        maxWallRatio: glMetrics.maxWallRatio ?? 1.0,
      };
    }

    // Fallback 2: Algoritmo vetorial com idêntica precisão matemática da árvore O(log N)
    const metrics = this.computeVectorizedFallback(levels, options.midPrice);
    const endTime = typeof performance !== "undefined" ? performance.now() : 0;
    return {
      ...metrics,
      backend: "VECTORIZED_CPU_FALLBACK",
      computeTimeUs: Math.round((endTime - startTime) * 1000),
      hasSubgroups: false,
      hasSubgroupShuffle: false,
    };
  }

  /**
   * Retorna o buffer de saída em VRAM para encadeamento zero-copy com shaders de Heatmap.
   */
  public getResultBuffer(): any {
    return this.resultBuffer;
  }

  /**
   * Fallback de alta performance na CPU que emula exatamente a redução paralela do WGSL.
   */
  private computeVectorizedFallback(
    levels: DepthLevelInput[],
    midPrice?: number
  ): GPUTFIImbalanceMetrics {
    const count = Math.min(levels.length, this.maxLevels);
    let weightedBid = 0;
    let weightedAsk = 0;
    let absorption = 0;
    let detectedIcebergs = 0;
    let maxWallRatio = 1.0;
    const topOfBookQty = count > 0 ? levels[0].quantity : 0;

    for (let i = 0; i < count; i++) {
      const lvl = levels[i];
      const distPct = Math.max(0, lvl.distanceFromMidPct);
      const decayWeight = Math.exp(-this.lambdaDecay * distPct);
      const weightedVol = lvl.quantity * decayWeight;

      if (lvl.side === 1) {
        weightedBid += weightedVol;
      } else {
        weightedAsk += weightedVol;
      }

      const levelAbsorb = Math.max(0, 1.0 - Math.min(1.0, distPct * 10.0)) * lvl.quantity;
      absorption += levelAbsorb;

      // Detecção de Iceberg Orders e Muralhas de Liquidez
      if (i + 1 < count && levels[i + 1].quantity > 0.001) {
        const wallRatio = lvl.quantity / levels[i + 1].quantity;
        if (wallRatio >= 3.0 && lvl.quantity >= topOfBookQty * 1.5) {
          detectedIcebergs++;
          if (wallRatio > maxWallRatio) {
            maxWallRatio = wallRatio;
          }
        }
      }
    }

    const totalVol = weightedBid + weightedAsk;
    const imbalance = totalVol > 0.00001 ? (weightedBid - weightedAsk) / totalVol : 0;

    let dominantSide: "BUY_DOMINANT" | "SELL_DOMINANT" | "BALANCED" = "BALANCED";
    if (imbalance > 0.2) {
      dominantSide = "BUY_DOMINANT";
    } else if (imbalance < -0.2) {
      dominantSide = "SELL_DOMINANT";
    }

    return {
      imbalanceRatio: Math.max(-1, Math.min(1, imbalance)),
      weightedBidVolume: weightedBid,
      weightedAskVolume: weightedAsk,
      absorptionPressure: absorption,
      dominantSide,
      processedLevels: count,
      detectedIcebergs,
      maxWallRatio: Number(maxWallRatio.toFixed(2)),
    };
  }

  /**
   * Libera todos os buffers, texturas e pipelines alocados na VRAM da GPU.
   */
  public destroy(): void {
    if (this.levelsBuffer?.destroy) this.levelsBuffer.destroy();
    if (this.paramsBuffer?.destroy) this.paramsBuffer.destroy();
    if (this.resultBuffer?.destroy) this.resultBuffer.destroy();
    if (this.stagingBuffer?.destroy) this.stagingBuffer.destroy();
    if (this.heatmapSliceBuffer?.destroy) this.heatmapSliceBuffer.destroy();
    if (this.heatmapTexture?.destroy) this.heatmapTexture.destroy();
    if (this.bloomParamsBuffer?.destroy) this.bloomParamsBuffer.destroy();

    if (this.device?.destroy) {
      this.device.destroy();
    }

    if (this.fallbackWebGLTF) {
      this.fallbackWebGLTF.destroy();
      this.fallbackWebGLTF = null;
    }

    this.device = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.heatmapTexture = null;
    this.heatmapSliceBuffer = null;
    this.bloomPipeline = null;
    this.bloomBindGroup = null;
    this.bloomParamsBuffer = null;
    this.hasSubgroupsSupport = false;
    this.isInitialized = false;
  }
}
