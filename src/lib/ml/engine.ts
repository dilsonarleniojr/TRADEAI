// ============================================================
// ML Engine - Feature Engineering, Models, and Evaluation
// ============================================================
// Implements a complete ML pipeline for crypto trading signals:
// - Feature Engineering: RSI, EMA_9, EMA_21, MACD, Volume, etc.
// - Target: y = 1 if Close[t+1] > Close[t], else 0
// - Models: Logistic Regression (gradient descent), Decision Tree (CART)
// - Evaluation: Accuracy, Precision, Recall, F1, Confusion Matrix
// ============================================================

// ========================
// Types
// ========================

export interface KlinePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FeatureRow {
  /** RSI(14) */
  rsi: number;
  /** EMA 9 */
  ema9: number;
  /** EMA 21 */
  ema21: number;
  /** MACD line */
  macdLine: number;
  /** MACD signal */
  macdSignal: number;
  /** MACD histogram */
  macdHistogram: number;
  /** Volume change % (vs previous candle) */
  volumeChange: number;
  /** Price change % (vs previous candle) */
  priceChange: number;
  /** High-Low range % */
  hlRange: number;
  /** Close position within candle range (0=low, 1=high) */
  closePosition: number;
  /** EMA 9 - EMA 21 (trend direction) */
  emaSpread: number;
  /** Target: 1 if next close > current close, else 0 */
  target: number;
}

export interface TrainingConfig {
  /** Train/test split ratio (0-1), default 0.8 */
  trainRatio: number;
  /** Learning rate for logistic regression, default 0.01 */
  learningRate: number;
  /** Number of epochs for logistic regression, default 200 */
  epochs: number;
  /** Max depth for decision tree, default 5 */
  maxDepth: number;
  /** Min samples to split for decision tree, default 10 */
  minSamplesSplit: number;
  /** Which features to include */
  features: string[];
}

export const DEFAULT_CONFIG: TrainingConfig = {
  trainRatio: 0.8,
  learningRate: 0.05,
  epochs: 300,
  maxDepth: 5,
  minSamplesSplit: 10,
  features: ["rsi", "ema9", "ema21", "macdHistogram", "volumeChange", "priceChange", "hlRange", "closePosition", "emaSpread"],
};

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusionMatrix: ConfusionMatrix;
  auc: number;
}

export interface TrainingResult {
  modelType: string;
  metrics: ModelMetrics;
  trainLoss: number[];
  featureImportance: Record<string, number>;
  predictions: { actual: number; predicted: number; probability: number }[];
}

export interface MLPipelineResult {
  features: FeatureRow[];
  normalizedFeatures: FeatureRow[];
  trainSize: number;
  testSize: number;
  logRegResult: TrainingResult;
  decisionTreeResult: TrainingResult;
  randomForestResult: TrainingResult;
  bestModel: "logistic" | "decision-tree" | "random-forest";
  currentSignal: {
    action: "COMPRA" | "VENDA" | "NEUTRO";
    confidence: number;
    logRegProb: number;
    dtProb: number;
    rfProb: number;
    features: Record<string, number>;
  };
}

// ========================
// Indicator Calculations
// ========================

function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  if (closes.length < period + 1) return new Array(closes.length).fill(50);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  while (rsi.length < closes.length) rsi.unshift(50);
  return rsi;
}

function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }
  return ema;
}

function calculateMACD(closes: number[]): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

// ========================
// Feature Engineering
// ========================

function sanitizeValue(v: number): number {
  if (isNaN(v) || !isFinite(v)) return 0;
  return v;
}

export function extractFeatures(klines: KlinePoint[]): FeatureRow[] {
  if (klines.length < 30) return [];

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);

  const rsiValues = calculateRSI(closes, 14);
  const ema9Values = calculateEMA(closes, 9);
  const ema21Values = calculateEMA(closes, 21);
  const macdData = calculateMACD(closes);

  const features: FeatureRow[] = [];

  // Start from index 26 to ensure all indicators have valid data
  for (let i = 26; i < klines.length - 1; i++) {
    const hlRange = highs[i] - lows[i];
    const referencePrice = closes[i] || 1;

    // Convert raw price-dependent indicators into stationary percentage returns/distances
    const rawEma9 = ema9Values[i] ?? closes[i];
    const rawEma21 = ema21Values[i] ?? closes[i];
    const rawMacdLine = macdData.macdLine[i] ?? 0;
    const rawMacdSignal = macdData.signalLine[i] ?? 0;
    const rawMacdHistogram = macdData.histogram[i] ?? 0;

    const ema9Pct = ((rawEma9 - closes[i]) / referencePrice) * 100;
    const ema21Pct = ((rawEma21 - closes[i]) / referencePrice) * 100;
    const macdLinePct = (rawMacdLine / referencePrice) * 100;
    const macdSignalPct = (rawMacdSignal / referencePrice) * 100;
    const macdHistogramPct = (rawMacdHistogram / referencePrice) * 100;
    const emaSpreadPct = ((rawEma9 - rawEma21) / rawEma21) * 100;

    features.push({
      rsi: sanitizeValue(rsiValues[i] ?? 50),
      ema9: sanitizeValue(ema9Pct),
      ema21: sanitizeValue(ema21Pct),
      macdLine: sanitizeValue(macdLinePct),
      macdSignal: sanitizeValue(macdSignalPct),
      macdHistogram: sanitizeValue(macdHistogramPct),
      volumeChange: sanitizeValue(i > 0 && volumes[i - 1] > 0 ? ((volumes[i] - volumes[i - 1]) / volumes[i - 1]) * 100 : 0),
      priceChange: sanitizeValue(i > 0 && closes[i - 1] > 0 ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : 0),
      hlRange: sanitizeValue(referencePrice > 0 ? (hlRange / referencePrice) * 100 : 0),
      closePosition: sanitizeValue(hlRange > 0 ? (closes[i] - lows[i]) / hlRange : 0.5),
      emaSpread: sanitizeValue(emaSpreadPct),
      target: closes[i + 1] > closes[i] ? 1 : 0,
    });
  }

  return features;
}

// ========================
// Standardization (Z-Score) — better for gradient descent
// ========================

export function normalizeFeatures(features: FeatureRow[]): FeatureRow[] {
  if (features.length === 0) return [];

  const keys = Object.keys(features[0]).filter((k) => k !== "target") as (keyof Omit<FeatureRow, "target">)[];
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};

  for (const key of keys) {
    const vals = features.map((f) => f[key]);
    const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
    const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
    means[key] = mean;
    stds[key] = Math.sqrt(variance) || 1; // Avoid division by zero
  }

  return features.map((f) => {
    const normalized = { ...f };
    for (const key of keys) {
      normalized[key] = (f[key] - means[key]) / stds[key];
      // Clip extreme values to [-5, 5] for stability
      normalized[key] = Math.max(-5, Math.min(5, normalized[key]));
    }
    return normalized;
  });
}

// ========================
// Feature Vector Extraction
// ========================

function getFeatureVector(row: FeatureRow, featureNames: string[]): number[] {
  return featureNames.map((name) => {
    const key = name as keyof FeatureRow;
    const val = row[key];
    return typeof val === "number" ? val : 0;
  });
}

// ========================
// Logistic Regression
// ========================

function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

function trainLogisticRegression(
  X: number[][],
  y: number[],
  learningRate: number,
  epochs: number
): { weights: number[]; bias: number; lossHistory: number[] } {
  const n = X.length;
  const d = X[0].length;

  // Xavier initialization for better convergence
  const scale = Math.sqrt(2 / (d + 1));
  const weights = Array.from({ length: d }, () => (Math.random() - 0.5) * scale);
  let bias = 0;
  const lossHistory: number[] = [];

  // Class-balanced sample weights
  const posCount = y.filter((v) => v === 1).length;
  const negCount = n - posCount;
  const posWeight = n / (2 * Math.max(posCount, 1));
  const negWeight = n / (2 * Math.max(negCount, 1));

  // L2 regularization lambda
  const lambda = 0.001;

  // Adam optimizer parameters
  const mW = new Array(d).fill(0);
  const vW = new Array(d).fill(0);
  let mB = 0, vB = 0;
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Forward pass
    const predictions = X.map((xi) => sigmoid(weights.reduce((sum, w, j) => sum + w * xi[j], 0) + bias));

    // Weighted binary cross-entropy loss + L2 regularization
    const l2Penalty = weights.reduce((sum, w) => sum + w * w, 0) * lambda;
    const loss =
      predictions.reduce((sum, p, i) => {
        const clipped = Math.max(1e-7, Math.min(1 - 1e-7, p));
        const w = y[i] === 1 ? posWeight : negWeight;
        return sum - w * (y[i] * Math.log(clipped) + (1 - y[i]) * Math.log(1 - clipped));
      }, 0) / n + l2Penalty;
    lossHistory.push(loss);

    // Gradients with class weights and L2
    const dw = new Array(d).fill(0);
    let db = 0;

    for (let i = 0; i < n; i++) {
      const w = y[i] === 1 ? posWeight : negWeight;
      const error = (predictions[i] - y[i]) * w;
      for (let j = 0; j < d; j++) {
        dw[j] += error * X[i][j];
      }
      db += error;
    }

    // Add L2 gradient
    for (let j = 0; j < d; j++) {
      dw[j] = dw[j] / n + lambda * weights[j];
    }
    db /= n;

    // Adam optimizer update
    const t = epoch + 1;
    for (let j = 0; j < d; j++) {
      mW[j] = beta1 * mW[j] + (1 - beta1) * dw[j];
      vW[j] = beta2 * vW[j] + (1 - beta2) * dw[j] * dw[j];
      const mHat = mW[j] / (1 - Math.pow(beta1, t));
      const vHat = vW[j] / (1 - Math.pow(beta2, t));
      weights[j] -= learningRate * mHat / (Math.sqrt(vHat) + eps);
    }
    mB = beta1 * mB + (1 - beta1) * db;
    vB = beta2 * vB + (1 - beta2) * db * db;
    const mBHat = mB / (1 - Math.pow(beta1, t));
    const vBHat = vB / (1 - Math.pow(beta2, t));
    bias -= learningRate * mBHat / (Math.sqrt(vBHat) + eps);
  }

  return { weights, bias, lossHistory };
}

function predictLogisticRegression(X: number[][], weights: number[], bias: number): number[] {
  return X.map((xi) => sigmoid(weights.reduce((sum, w, j) => sum + w * xi[j], 0) + bias));
}

// ========================
// Decision Tree (CART)
// ========================

interface TreeNode {
  isLeaf: boolean;
  prediction?: number;
  probability?: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  samples?: number;
}

function giniImpurity(labels: number[]): number {
  if (labels.length === 0) return 0;
  const p1 = labels.filter((l) => l === 1).length / labels.length;
  const p0 = 1 - p1;
  return 1 - p1 * p1 - p0 * p0;
}

function buildDecisionTree(
  X: number[][],
  y: number[],
  maxDepth: number,
  minSamplesSplit: number,
  depth = 0
): TreeNode {
  const n = y.length;
  const posCount = y.filter((l) => l === 1).length;
  const negCount = n - posCount;

  // Leaf conditions
  if (depth >= maxDepth || n < minSamplesSplit || posCount === 0 || negCount === 0) {
    return {
      isLeaf: true,
      prediction: posCount >= negCount ? 1 : 0,
      probability: n > 0 ? posCount / n : 0.5,
      samples: n,
    };
  }

  const numFeatures = X[0].length;
  let bestGini = Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;
  let bestLeftIdx: number[] = [];
  let bestRightIdx: number[] = [];

  // Try each feature
  for (let f = 0; f < numFeatures; f++) {
    // Get unique sorted values for this feature
    const uniqueValues = [...new Set(X.map((xi) => xi[f]))].sort((a, b) => a - b);

    // Try midpoints between consecutive values (limit candidates for performance)
    const step = Math.max(1, Math.floor(uniqueValues.length / 50));
    for (let v = 0; v < uniqueValues.length - 1; v += step) {
      const threshold = (uniqueValues[v] + uniqueValues[Math.min(v + step, uniqueValues.length - 1)]) / 2;

      const leftIdx: number[] = [];
      const rightIdx: number[] = [];

      for (let i = 0; i < n; i++) {
        if (X[i][f] <= threshold) leftIdx.push(i);
        else rightIdx.push(i);
      }

      if (leftIdx.length === 0 || rightIdx.length === 0) continue;

      const leftLabels = leftIdx.map((i) => y[i]);
      const rightLabels = rightIdx.map((i) => y[i]);

      const gini =
        (leftIdx.length / n) * giniImpurity(leftLabels) +
        (rightIdx.length / n) * giniImpurity(rightLabels);

      if (gini < bestGini) {
        bestGini = gini;
        bestFeature = f;
        bestThreshold = threshold;
        bestLeftIdx = leftIdx;
        bestRightIdx = rightIdx;
      }
    }
  }

  // If no good split found
  if (bestGini === Infinity || bestLeftIdx.length === 0 || bestRightIdx.length === 0) {
    return {
      isLeaf: true,
      prediction: posCount >= negCount ? 1 : 0,
      probability: n > 0 ? posCount / n : 0.5,
      samples: n,
    };
  }

  const leftX = bestLeftIdx.map((i) => X[i]);
  const leftY = bestLeftIdx.map((i) => y[i]);
  const rightX = bestRightIdx.map((i) => X[i]);
  const rightY = bestRightIdx.map((i) => y[i]);

  return {
    isLeaf: false,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    samples: n,
    left: buildDecisionTree(leftX, leftY, maxDepth, minSamplesSplit, depth + 1),
    right: buildDecisionTree(rightX, rightY, maxDepth, minSamplesSplit, depth + 1),
  };
}

function predictDecisionTree(tree: TreeNode, x: number[]): { prediction: number; probability: number } {
  if (tree.isLeaf) {
    return { prediction: tree.prediction ?? 0, probability: tree.probability ?? 0.5 };
  }

  if (x[tree.featureIndex!] <= tree.threshold!) {
    return predictDecisionTree(tree.left!, x);
  }
  return predictDecisionTree(tree.right!, x);
}

// Feature importance for decision tree (based on how often each feature is used for splits)
function computeTreeFeatureImportance(tree: TreeNode, numFeatures: number): Record<number, number> {
  const importance: Record<number, number> = {};
  for (let i = 0; i < numFeatures; i++) importance[i] = 0;

  function traverse(node: TreeNode, depth: number) {
    if (node.isLeaf) return;
    if (node.featureIndex !== undefined) {
      importance[node.featureIndex] = (importance[node.featureIndex] || 0) + (node.samples || 0) / (depth + 1);
    }
    if (node.left) traverse(node.left, depth + 1);
    if (node.right) traverse(node.right, depth + 1);
  }

  traverse(tree, 0);
  return importance;
}

// ========================
// Random Forest (Ensemble of Decision Trees)
// ========================

function buildRandomForest(
  X: number[][],
  y: number[],
  numTrees: number,
  maxDepth: number,
  minSamplesSplit: number
): TreeNode[] {
  const n = X.length;
  const numFeatures = X[0].length;
  const trees: TreeNode[] = [];

  for (let t = 0; t < numTrees; t++) {
    // Bootstrap sample (random with replacement)
    const sampleIndices = Array.from({ length: n }, () => Math.floor(Math.random() * n));
    const sampleX = sampleIndices.map((i) => X[i]);
    const sampleY = sampleIndices.map((i) => y[i]);

    // Random feature subsampling (√numFeatures per split) — done in tree building
    // We'll use a modified tree builder that only considers a subset of features
    const tree = buildDecisionTreeWithFeatureSubsampling(
      sampleX, sampleY, maxDepth, minSamplesSplit, numFeatures
    );
    trees.push(tree);
  }

  return trees;
}

function buildDecisionTreeWithFeatureSubsampling(
  X: number[][],
  y: number[],
  maxDepth: number,
  minSamplesSplit: number,
  totalFeatures: number,
  depth = 0
): TreeNode {
  const n = y.length;
  const posCount = y.filter((l) => l === 1).length;
  const negCount = n - posCount;

  if (depth >= maxDepth || n < minSamplesSplit || posCount === 0 || negCount === 0) {
    return {
      isLeaf: true,
      prediction: posCount >= negCount ? 1 : 0,
      probability: n > 0 ? posCount / n : 0.5,
      samples: n,
    };
  }

  // Random feature subsampling: consider √totalFeatures features
  const numFeaturesToConsider = Math.max(2, Math.floor(Math.sqrt(totalFeatures)));
  const allFeatureIndices = Array.from({ length: X[0].length }, (_, i) => i);
  // Fisher-Yates shuffle and take first numFeaturesToConsider
  for (let i = allFeatureIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allFeatureIndices[i], allFeatureIndices[j]] = [allFeatureIndices[j], allFeatureIndices[i]];
  }
  const featuresToConsider = allFeatureIndices.slice(0, numFeaturesToConsider);

  let bestGini = Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;
  let bestLeftIdx: number[] = [];
  let bestRightIdx: number[] = [];

  for (const f of featuresToConsider) {
    const uniqueValues = [...new Set(X.map((xi) => xi[f]))].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(uniqueValues.length / 30));

    for (let v = 0; v < uniqueValues.length - 1; v += step) {
      const threshold = (uniqueValues[v] + uniqueValues[Math.min(v + step, uniqueValues.length - 1)]) / 2;

      const leftIdx: number[] = [];
      const rightIdx: number[] = [];

      for (let i = 0; i < n; i++) {
        if (X[i][f] <= threshold) leftIdx.push(i);
        else rightIdx.push(i);
      }

      if (leftIdx.length === 0 || rightIdx.length === 0) continue;

      const leftLabels = leftIdx.map((i) => y[i]);
      const rightLabels = rightIdx.map((i) => y[i]);

      const gini =
        (leftIdx.length / n) * giniImpurity(leftLabels) +
        (rightIdx.length / n) * giniImpurity(rightLabels);

      if (gini < bestGini) {
        bestGini = gini;
        bestFeature = f;
        bestThreshold = threshold;
        bestLeftIdx = leftIdx;
        bestRightIdx = rightIdx;
      }
    }
  }

  if (bestGini === Infinity || bestLeftIdx.length === 0 || bestRightIdx.length === 0) {
    return {
      isLeaf: true,
      prediction: posCount >= negCount ? 1 : 0,
      probability: n > 0 ? posCount / n : 0.5,
      samples: n,
    };
  }

  return {
    isLeaf: false,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    samples: n,
    left: buildDecisionTreeWithFeatureSubsampling(
      bestLeftIdx.map((i) => X[i]), bestLeftIdx.map((i) => y[i]),
      maxDepth, minSamplesSplit, totalFeatures, depth + 1
    ),
    right: buildDecisionTreeWithFeatureSubsampling(
      bestRightIdx.map((i) => X[i]), bestRightIdx.map((i) => y[i]),
      maxDepth, minSamplesSplit, totalFeatures, depth + 1
    ),
  };
}

function predictRandomForest(trees: TreeNode[], x: number[]): { prediction: number; probability: number } {
  const results = trees.map((tree) => predictDecisionTree(tree, x));
  const avgProb = results.reduce((sum, r) => sum + r.probability, 0) / results.length;
  return { prediction: avgProb >= 0.5 ? 1 : 0, probability: avgProb };
}

// ========================
// Evaluation Metrics
// ========================

function computeConfusionMatrix(actual: number[], predicted: number[]): ConfusionMatrix {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 1 && predicted[i] === 1) tp++;
    else if (actual[i] === 0 && predicted[i] === 1) fp++;
    else if (actual[i] === 0 && predicted[i] === 0) tn++;
    else fn++;
  }
  return { tp, fp, tn, fn };
}

function computeAUC(actual: number[], probabilities: number[]): number {
  // Simple trapezoidal AUC approximation
  const pairs = actual.map((a, i) => ({ actual: a, prob: probabilities[i] }));
  pairs.sort((a, b) => b.prob - a.prob);

  let tp = 0, fp = 0;
  const totalPos = actual.filter((a) => a === 1).length;
  const totalNeg = actual.filter((a) => a === 0).length;

  if (totalPos === 0 || totalNeg === 0) return 0.5;

  let auc = 0;
  let prevFpr = 0;
  let prevTpr = 0;

  for (const pair of pairs) {
    if (pair.actual === 1) tp++;
    else fp++;

    const tpr = tp / totalPos;
    const fpr = fp / totalNeg;

    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevFpr = fpr;
    prevTpr = tpr;
  }

  return auc;
}

function evaluateModel(actual: number[], predicted: number[], probabilities: number[]): ModelMetrics {
  const cm = computeConfusionMatrix(actual, predicted);
  const accuracy = (cm.tp + cm.tn) / (cm.tp + cm.tn + cm.fp + cm.fn);
  const precision = cm.tp + cm.fp > 0 ? cm.tp / (cm.tp + cm.fp) : 0;
  const recall = cm.tp + cm.fn > 0 ? cm.tp / (cm.tp + cm.fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const auc = computeAUC(actual, probabilities);

  return { accuracy, precision, recall, f1, confusionMatrix: cm, auc };
}

// ========================
// Full Pipeline
// ========================

export function runMLPipeline(
  klines: KlinePoint[],
  config: TrainingConfig = DEFAULT_CONFIG
): MLPipelineResult {
  // Step 1: Extract features
  const features = extractFeatures(klines);
  if (features.length < 50) {
    throw new Error("Dados insuficientes para treinar o modelo. Mínimo 50 amostras após engenharia de features.");
  }

  // Step 2: Normalize features
  const normalizedFeatures = normalizeFeatures(features);

  // Step 3: Split train/test
  const splitIdx = Math.floor(normalizedFeatures.length * config.trainRatio);
  const trainData = normalizedFeatures.slice(0, splitIdx);
  const testData = normalizedFeatures.slice(splitIdx);

  const featureNames = config.features;

  const trainX = trainData.map((f) => getFeatureVector(f, featureNames));
  const trainY = trainData.map((f) => f.target);
  const testX = testData.map((f) => getFeatureVector(f, featureNames));
  const testY = testData.map((f) => f.target);

  // Step 4: Train Logistic Regression
  const logRegModel = trainLogisticRegression(trainX, trainY, config.learningRate, config.epochs);
  const logRegProbs = predictLogisticRegression(testX, logRegModel.weights, logRegModel.bias);
  const logRegPredictions = logRegProbs.map((p) => (p >= 0.5 ? 1 : 0));
  const logRegMetrics = evaluateModel(testY, logRegPredictions, logRegProbs);

  // Feature importance for logistic regression (absolute weights)
  const logRegImportance: Record<string, number> = {};
  const maxWeight = Math.max(...logRegModel.weights.map((w) => Math.abs(w)), 0.001);
  featureNames.forEach((name, i) => {
    logRegImportance[name] = Math.abs(logRegModel.weights[i]) / maxWeight;
  });

  // Step 5: Train Decision Tree
  const dtTree = buildDecisionTree(trainX, trainY, config.maxDepth, config.minSamplesSplit);
  const dtResults = testX.map((xi) => predictDecisionTree(dtTree, xi));
  const dtPredictions = dtResults.map((r) => r.prediction);
  const dtProbabilities = dtResults.map((r) => r.probability);
  const dtMetrics = evaluateModel(testY, dtPredictions, dtProbabilities);

  // Feature importance for decision tree
  const rawDtImportance = computeTreeFeatureImportance(dtTree, featureNames.length);
  const maxDtImportance = Math.max(...Object.values(rawDtImportance), 0.001);
  const dtImportance: Record<string, number> = {};
  featureNames.forEach((name, i) => {
    dtImportance[name] = (rawDtImportance[i] || 0) / maxDtImportance;
  });

  // Step 6: Train Random Forest (15 trees)
  const NUM_RF_TREES = 15;
  const rfTrees = buildRandomForest(trainX, trainY, NUM_RF_TREES, config.maxDepth, config.minSamplesSplit);
  const rfResults = testX.map((xi) => predictRandomForest(rfTrees, xi));
  const rfPredictions = rfResults.map((r) => r.prediction);
  const rfProbabilities = rfResults.map((r) => r.probability);
  const rfMetrics = evaluateModel(testY, rfPredictions, rfProbabilities);

  // Feature importance for random forest (average across all trees)
  const rfImportanceAccum: Record<number, number> = {};
  for (let i = 0; i < featureNames.length; i++) rfImportanceAccum[i] = 0;
  for (const tree of rfTrees) {
    const treeImportance = computeTreeFeatureImportance(tree, featureNames.length);
    for (let i = 0; i < featureNames.length; i++) {
      rfImportanceAccum[i] += treeImportance[i] || 0;
    }
  }
  const maxRfImportance = Math.max(...Object.values(rfImportanceAccum), 0.001);
  const rfImportance: Record<string, number> = {};
  featureNames.forEach((name, i) => {
    rfImportance[name] = (rfImportanceAccum[i] || 0) / maxRfImportance;
  });

  // Step 7: Determine best model by F1 score
  const modelScores = [
    { name: "logistic" as const, f1: logRegMetrics.f1 },
    { name: "decision-tree" as const, f1: dtMetrics.f1 },
    { name: "random-forest" as const, f1: rfMetrics.f1 },
  ];
  modelScores.sort((a, b) => b.f1 - a.f1);
  const bestModel = modelScores[0].name;

  // Step 8: Generate current signal using the last data point
  const lastFeature = normalizedFeatures[normalizedFeatures.length - 1];
  const lastRawFeature = features[features.length - 1];
  const lastX = getFeatureVector(lastFeature, featureNames);

  const logRegProb = sigmoid(logRegModel.weights.reduce((sum, w, j) => sum + w * lastX[j], 0) + logRegModel.bias);
  const dtResult = predictDecisionTree(dtTree, lastX);
  const dtProb = dtResult.probability;
  const rfResult = predictRandomForest(rfTrees, lastX);
  const rfProb = rfResult.probability;

  // 1. Calculate ADX and ATR for dynamic thresholding
  const { relATR, adx } = calculateTrendAndVolatility(klines);
  const dynamicThreshold = getDynamicThreshold(adx, relATR);

  // 2. Voting Classifier / Confluency Check
  const getDirection = (p: number) => (p > 0.5 + (dynamicThreshold - 0.5) ? "COMPRA" : p < 0.5 - (dynamicThreshold - 0.5) ? "VENDA" : "NEUTRO");
  
  const dirLR = getDirection(logRegProb);
  const dirDT = getDirection(dtProb);
  const dirRF = getDirection(rfProb);

  // Confluency: Random Forest (stability) and the best model must agree
  const bestModelName = bestModel === "logistic" ? "logistic" : bestModel === "decision-tree" ? "dt" : "rf";
  const bestModelDir = bestModelName === "logistic" ? dirLR : bestModelName === "dt" ? dirDT : dirRF;

  let action: "COMPRA" | "VENDA" | "NEUTRO" = "NEUTRO";
  if (dirRF === bestModelDir && dirRF !== "NEUTRO") {
    action = dirRF;
  }
  
  const totalF1 = logRegMetrics.f1 + dtMetrics.f1 + rfMetrics.f1 || 1;
  const avgProb = (logRegProb * logRegMetrics.f1 + dtProb * dtMetrics.f1 + rfProb * rfMetrics.f1) / totalF1;
  const confidence = Math.abs(avgProb - 0.5) * 2; // 0-1 scale

  // Current feature values (raw, not normalized)
  const currentFeatures: Record<string, number> = {};
  featureNames.forEach((name) => {
    const key = name as keyof FeatureRow;
    currentFeatures[name] = typeof lastRawFeature[key] === "number" ? (lastRawFeature[key] as number) : 0;
  });

  return {
    features,
    normalizedFeatures,
    trainSize: trainData.length,
    testSize: testData.length,
    logRegResult: {
      modelType: "Regressão Logística",
      metrics: logRegMetrics,
      trainLoss: logRegModel.lossHistory,
      featureImportance: logRegImportance,
      predictions: testY.map((actual, i) => ({
        actual,
        predicted: logRegPredictions[i],
        probability: logRegProbs[i],
      })),
    },
    decisionTreeResult: {
      modelType: "Árvore de Decisão",
      metrics: dtMetrics,
      trainLoss: [], // Decision tree doesn't have a loss curve
      featureImportance: dtImportance,
      predictions: testY.map((actual, i) => ({
        actual,
        predicted: dtPredictions[i],
        probability: dtProbabilities[i],
      })),
    },
    randomForestResult: {
      modelType: "Random Forest (15 árvores)",
      metrics: rfMetrics,
      trainLoss: [],
      featureImportance: rfImportance,
      predictions: testY.map((actual, i) => ({
        actual,
        predicted: rfPredictions[i],
        probability: rfProbabilities[i],
      })),
    },
    bestModel,
    currentSignal: {
      action,
      confidence,
      logRegProb,
      dtProb,
      rfProb,
      features: currentFeatures,
    },
  };
}

// ==========================================
// HFT Quant Helper Functions
// ==========================================

function calculateTrendAndVolatility(klines: KlinePoint[]): { relATR: number; adx: number } {
  const period = 14;
  if (klines.length < period + 1) {
    return { relATR: 0.02, adx: 25 };
  }

  let trSum = 0;
  let plusDM = 0;
  let minusDM = 0;

  for (let i = 1; i < klines.length; i++) {
    const k = klines[i];
    const prev = klines[i - 1];
    
    const tr = Math.max(
      k.high - k.low,
      Math.abs(k.high - prev.close),
      Math.abs(k.low - prev.close)
    );
    trSum += tr;

    const upMove = k.high - prev.high;
    const downMove = prev.low - k.low;

    if (upMove > downMove && upMove > 0) {
      plusDM += upMove;
    } else if (downMove > upMove && downMove > 0) {
      minusDM += downMove;
    }
  }

  const avgTR = trSum / (klines.length - 1);
  const relATR = avgTR / klines[klines.length - 1].close; 

  const plusDI = trSum > 0 ? (plusDM / trSum) * 100 : 50;
  const minusDI = trSum > 0 ? (minusDM / trSum) * 100 : 50;
  const sumDI = plusDI + minusDI;
  const dx = sumDI > 0 ? (Math.abs(plusDI - minusDI) / sumDI) * 100 : 0;
  
  return { relATR, adx: dx };
}

function getDynamicThreshold(adx: number, relATR: number): number {
  let baseThreshold = 0.65;
  
  if (adx < 20) {
    baseThreshold = 0.75;
  } else if (adx > 25) {
    baseThreshold = 0.55; 
  } else {
    const pct = (adx - 20) / 5;
    baseThreshold = 0.75 - pct * 0.20; 
  }

  if (relATR > 0.04) {
    baseThreshold += 0.05; 
  }
  
  return Math.min(0.85, Math.max(0.50, baseThreshold));
}
