"use client";

import { useState, useCallback, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Target,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  Layers,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  LineChart,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart as RechartsPie,
  Pie,
  Legend,
} from "recharts";
import {
  runMLPipeline,
  extractFeatures,
  normalizeFeatures,
  DEFAULT_CONFIG,
  type TrainingConfig,
  type MLPipelineResult,
  type KlinePoint,
} from "@/lib/ml/engine";

const FEATURE_LABELS: Record<string, string> = {
  rsi: "RSI (14)",
  ema9: "EMA 9",
  ema21: "EMA 21",
  macdLine: "MACD",
  macdSignal: "Sinal MACD",
  macdHistogram: "Histograma MACD",
  volumeChange: "Variação Volume",
  priceChange: "Variação Preço",
  hlRange: "Range H-L",
  closePosition: "Posição Close",
  emaSpread: "Spread EMA",
};

const ALL_FEATURES = Object.keys(FEATURE_LABELS);

interface KlineRaw {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export function MLPipeline() {
  const { selectedSymbol, tickers } = useCryptoStore();
  const [config, setConfig] = useState<TrainingConfig>({
    ...DEFAULT_CONFIG,
    features: [...DEFAULT_CONFIG.features],
    learningRate: 0.05,
    epochs: 300,
  });
  const [isTraining, setIsTraining] = useState(false);
  const [result, setResult] = useState<MLPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(true);
  const [activeModelTab, setActiveModelTab] = useState<"logistic" | "dt" | "rf">("logistic");
  const [progressStep, setProgressStep] = useState(0);

  const ticker = tickers[selectedSymbol];

  const runTraining = useCallback(async () => {
    setIsTraining(true);
    setError(null);
    setResult(null);
    setProgressStep(0);

    try {
      // Step 1: Fetch data
      setProgressStep(1);
      const res = await fetch(
        `/api/market/klines?symbol=${selectedSymbol}&interval=1d&limit=365`
      );
      if (!res.ok) throw new Error("Falha ao buscar dados históricos");
      const json = await res.json();
      const rawData: KlineRaw[] = json.data || [];
      if (rawData.length < 50) throw new Error("Dados históricos insuficientes (mínimo 50 candles)");

      const klines: KlinePoint[] = rawData.map((k) => ({
        time: k.openTime,
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
      }));

      // Step 2: Feature Engineering
      setProgressStep(2);
      await new Promise((r) => setTimeout(r, 300)); // Small delay for UX

      // Step 3: Training
      setProgressStep(3);
      await new Promise((r) => setTimeout(r, 200));

      const pipelineResult = runMLPipeline(klines, config);

      // Step 4: Done
      setProgressStep(4);
      setResult(pipelineResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsTraining(false);
    }
  }, [selectedSymbol, config]);

  const toggleFeature = (feature: string) => {
    setConfig((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  };

  // Feature importance data for chart
  const featureImportanceData = useMemo(() => {
    if (!result) return [];
    const modelResult = activeModelTab === "logistic" ? result.logRegResult : activeModelTab === "dt" ? result.decisionTreeResult : result.randomForestResult;
    return Object.entries(modelResult.featureImportance)
      .map(([key, value]) => ({
        name: FEATURE_LABELS[key] || key,
        key,
        value: Math.round(value * 100),
      }))
      .sort((a, b) => b.value - a.value);
  }, [result, activeModelTab]);

  // Confusion matrix data
  const confusionMatrixData = useMemo(() => {
    if (!result) return null;
    const modelResult = activeModelTab === "logistic" ? result.logRegResult : activeModelTab === "dt" ? result.decisionTreeResult : result.randomForestResult;
    return modelResult.metrics.confusionMatrix;
  }, [result, activeModelTab]);

  // Loss history data for logistic regression
  const lossHistoryData = useMemo(() => {
    if (!result || result.logRegResult.trainLoss.length === 0) return [];
    const loss = result.logRegResult.trainLoss;
    // Sample every N points to avoid too many data points
    const step = Math.max(1, Math.floor(loss.length / 50));
    return loss
      .filter((_, i) => i % step === 0 || i === loss.length - 1)
      .map((l, i) => ({ epoch: i * step, loss: Math.round(l * 1000) / 1000 }));
  }, [result]);

  // Target distribution
  const targetDistribution = useMemo(() => {
    if (!result) return [];
    const up = result.features.filter((f) => f.target === 1).length;
    const down = result.features.length - up;
    return [
      { name: "Alta (1)", value: up, fill: "#22c55e" },
      { name: "Baixa (0)", value: down, fill: "#ef4444" },
    ];
  }, [result]);

  const getSignalStyle = (action: string) => {
    switch (action) {
      case "COMPRA": return "bg-crypto-green/15 text-crypto-green border-crypto-green/40";
      case "VENDA": return "bg-crypto-red/15 text-crypto-red border-crypto-red/40";
      default: return "bg-amber-500/15 text-amber-400 border-amber-500/40";
    }
  };

  const getSignalIcon = (action: string) => {
    switch (action) {
      case "COMPRA": return <TrendingUp className="w-5 h-5" />;
      case "VENDA": return <TrendingDown className="w-5 h-5" />;
      default: return <Minus className="w-5 h-5" />;
    }
  };

  const getMetricColor = (value: number, thresholds: [number, number] = [0.5, 0.7]) => {
    if (value >= thresholds[1]) return "text-crypto-green";
    if (value >= thresholds[0]) return "text-amber-400";
    return "text-crypto-red";
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card className="glass-card card-accent-cyan">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-crypto-cyan" />
              Pipeline de Machine Learning
              <Badge variant="outline" className="text-[10px] border-crypto-cyan/30 text-crypto-cyan ml-1">
                {selectedSymbol.replace("USDT", "")}
              </Badge>
              {result && (
                <Badge className={cn("text-[10px] border ml-1", getSignalStyle(result.currentSignal.action))}>
                  {getSignalIcon(result.currentSignal.action)}
                  <span className="ml-1">{result.currentSignal.action}</span>
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-crypto-cyan"
                onClick={() => setShowConfig(!showConfig)}
              >
                {showConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span className="text-[10px] ml-1">Config</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Configuration Panel */}
          <AnimatePresence>
            {showConfig && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="bg-secondary/20 rounded-lg p-3 space-y-3">
                  {/* Training Parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <label className="text-[10px] text-muted-foreground font-medium">Taxa de Aprendizado</label>
                        <span className="text-[10px] font-mono text-crypto-cyan">{config.learningRate}</span>
                      </div>
                      <Slider
                        value={[config.learningRate]}
                        onValueChange={([v]) => setConfig((p) => ({ ...p, learningRate: v }))}
                        min={0.001}
                        max={0.1}
                        step={0.001}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <label className="text-[10px] text-muted-foreground font-medium">Épocas</label>
                        <span className="text-[10px] font-mono text-crypto-cyan">{config.epochs}</span>
                      </div>
                      <Slider
                        value={[config.epochs]}
                        onValueChange={([v]) => setConfig((p) => ({ ...p, epochs: v }))}
                        min={50}
                        max={500}
                        step={10}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <label className="text-[10px] text-muted-foreground font-medium">Profundidade Árvore</label>
                        <span className="text-[10px] font-mono text-crypto-cyan">{config.maxDepth}</span>
                      </div>
                      <Slider
                        value={[config.maxDepth]}
                        onValueChange={([v]) => setConfig((p) => ({ ...p, maxDepth: v }))}
                        min={2}
                        max={10}
                        step={1}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <label className="text-[10px] text-muted-foreground font-medium">Split Treino/Teste</label>
                        <span className="text-[10px] font-mono text-crypto-cyan">{Math.round(config.trainRatio * 100)}%</span>
                      </div>
                      <Slider
                        value={[config.trainRatio]}
                        onValueChange={([v]) => setConfig((p) => ({ ...p, trainRatio: v }))}
                        min={0.6}
                        max={0.9}
                        step={0.05}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Feature Selection */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground font-medium">Features (Entradas X)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_FEATURES.map((feature) => (
                        <button
                          key={feature}
                          onClick={() => toggleFeature(feature)}
                          className={cn(
                            "text-[10px] px-2 py-1 rounded-md border transition-all",
                            config.features.includes(feature)
                              ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                              : "bg-secondary/30 text-muted-foreground border-border/50 hover:border-crypto-cyan/20"
                          )}
                        >
                          {FEATURE_LABELS[feature]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Formula Explanation */}
                  <div className="bg-crypto-cyan/5 border border-crypto-cyan/15 rounded-lg p-2.5">
                    <div className="flex items-start gap-1.5">
                      <Target className="w-3 h-3 text-crypto-cyan mt-0.5 shrink-0" />
                      <div className="text-[10px] text-muted-foreground leading-relaxed">
                        <span className="text-crypto-cyan font-semibold">Target (y):</span>{" "}
                        y = 1 se Fechamento[t+1] &gt; Fechamento[t], senão y = 0
                        <br />
                        <span className="text-crypto-cyan font-semibold">Features (X):</span>{" "}
                        {config.features.map((f) => FEATURE_LABELS[f] || f).join(", ")}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Training Button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={runTraining}
              disabled={isTraining || config.features.length < 2}
              className={cn(
                "flex-1 h-10 text-xs font-semibold gap-2 transition-all",
                isTraining
                  ? "bg-crypto-cyan/20 text-crypto-cyan"
                  : "btn-gradient-cyan"
              )}
            >
              {isTraining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {progressStep === 1 && "Buscando dados..."}
                    {progressStep === 2 && "Engenharia de features..."}
                    {progressStep === 3 && "Treinando modelos..."}
                    {progressStep === 4 && "Finalizando..."}
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Treinar Pipeline ML
                </>
              )}
            </Button>
            {result && (
              <Button
                variant="outline"
                size="sm"
                className="h-10 text-xs gap-1 border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/10"
                onClick={runTraining}
                disabled={isTraining}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isTraining && "animate-spin")} />
                Retreinar
              </Button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-crypto-red/5 border border-crypto-red/20 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-crypto-red shrink-0" />
              <span className="text-xs text-crypto-red">{error}</span>
            </div>
          )}

          {/* Results */}
          {result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Current Signal Banner */}
              <div className={cn(
                "rounded-xl p-4 border",
                result.currentSignal.action === "COMPRA"
                  ? "bg-crypto-green/5 border-crypto-green/20"
                  : result.currentSignal.action === "VENDA"
                  ? "bg-crypto-red/5 border-crypto-red/20"
                  : "bg-amber-500/5 border-amber-500/20"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      result.currentSignal.action === "COMPRA" && "bg-crypto-green/15",
                      result.currentSignal.action === "VENDA" && "bg-crypto-red/15",
                      result.currentSignal.action === "NEUTRO" && "bg-amber-500/15"
                    )}>
                      {getSignalIcon(result.currentSignal.action)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">
                          Sinal: {result.currentSignal.action}
                        </span>
                        <Badge className={cn("text-[10px] border", getSignalStyle(result.currentSignal.action))}>
                          Confiança: {(result.currentSignal.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Ensemble de {result.logRegResult.modelType} + {result.decisionTreeResult.modelType} + {result.randomForestResult.modelType}
                        {" "}&middot; Melhor modelo: {result.bestModel === "logistic" ? "Reg. Logística" : result.bestModel === "decision-tree" ? "Árvore Decisão" : "Random Forest"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div className="text-[10px] text-muted-foreground">Reg. Logística</div>
                      <div className="text-xs font-mono font-bold text-crypto-cyan">
                        {(result.currentSignal.logRegProb * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">Árvore Decisão</div>
                      <div className="text-xs font-mono font-bold text-amber-400">
                        {(result.currentSignal.dtProb * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">Random Forest</div>
                      <div className="text-xs font-mono font-bold text-crypto-green">
                        {(result.currentSignal.rfProb * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dataset Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-secondary/20 rounded-lg p-2.5 text-center">
                  <Database className="w-3.5 h-3.5 mx-auto mb-1 text-crypto-cyan" />
                  <p className="text-[9px] text-muted-foreground">Total Amostras</p>
                  <p className="text-sm font-mono font-bold number-animate">{result.features.length}</p>
                </div>
                <div className="bg-secondary/20 rounded-lg p-2.5 text-center">
                  <Cpu className="w-3.5 h-3.5 mx-auto mb-1 text-crypto-green" />
                  <p className="text-[9px] text-muted-foreground">Treino</p>
                  <p className="text-sm font-mono font-bold text-crypto-green number-animate">{result.trainSize}</p>
                </div>
                <div className="bg-secondary/20 rounded-lg p-2.5 text-center">
                  <Zap className="w-3.5 h-3.5 mx-auto mb-1 text-amber-400" />
                  <p className="text-[9px] text-muted-foreground">Teste</p>
                  <p className="text-sm font-mono font-bold text-amber-400 number-animate">{result.testSize}</p>
                </div>
                <div className="bg-secondary/20 rounded-lg p-2.5 text-center">
                  <Layers className="w-3.5 h-3.5 mx-auto mb-1 text-crypto-cyan" />
                  <p className="text-[9px] text-muted-foreground">Features</p>
                  <p className="text-sm font-mono font-bold number-animate">{config.features.length}</p>
                </div>
              </div>

              {/* Model Tabs */}
              <Tabs value={activeModelTab} onValueChange={(v) => setActiveModelTab(v as "logistic" | "dt" | "rf")}>
                <TabsList className="w-full h-8 bg-secondary/30">
                  <TabsTrigger
                    value="logistic"
                    className="text-[10px] flex-1 data-[state=active]:bg-crypto-cyan/15 data-[state=active]:text-crypto-cyan"
                  >
                    <LineChart className="w-3 h-3 mr-1" />
                    Reg. Logística
                    {result.bestModel === "logistic" && (
                      <CheckCircle2 className="w-3 h-3 ml-1 text-crypto-green" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="dt"
                    className="text-[10px] flex-1 data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400"
                  >
                    <GitBranch className="w-3 h-3 mr-1" />
                    Árvore Decisão
                    {result.bestModel === "decision-tree" && (
                      <CheckCircle2 className="w-3 h-3 ml-1 text-crypto-green" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="rf"
                    className="text-[10px] flex-1 data-[state=active]:bg-crypto-green/15 data-[state=active]:text-crypto-green"
                  >
                    <Layers className="w-3 h-3 mr-1" />
                    Random Forest
                    {result.bestModel === "random-forest" && (
                      <CheckCircle2 className="w-3 h-3 ml-1 text-crypto-green" />
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="logistic" className="mt-3 space-y-3">
                  {/* LR Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { label: "Acurácia", value: result.logRegResult.metrics.accuracy, pct: true },
                      { label: "Precisão", value: result.logRegResult.metrics.precision, pct: true },
                      { label: "Recall", value: result.logRegResult.metrics.recall, pct: true },
                      { label: "F1-Score", value: result.logRegResult.metrics.f1, pct: true },
                      { label: "AUC-ROC", value: result.logRegResult.metrics.auc, pct: true },
                    ].map((m) => (
                      <div key={m.label} className="bg-secondary/20 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-muted-foreground">{m.label}</p>
                        <p className={cn("text-sm font-mono font-bold", getMetricColor(m.value))}>
                          {(m.value * 100).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Loss Curve */}
                  {lossHistoryData.length > 0 && (
                    <div className="bg-secondary/10 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Activity className="w-3 h-3 text-crypto-cyan" />
                        <span className="text-[10px] font-medium">Curva de Loss (Treino)</span>
                      </div>
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={lossHistoryData}>
                          <defs>
                            <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                          <XAxis dataKey="epoch" tick={{ fontSize: 8 }} stroke="oklch(0.5 0 0)" />
                          <YAxis tick={{ fontSize: 8 }} stroke="oklch(0.5 0 0)" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "oklch(0.14 0.012 260)",
                              border: "1px solid oklch(0.3 0 0)",
                              borderRadius: 8,
                              fontSize: 10,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="loss"
                            stroke="#06b6d4"
                            fill="url(#lossGrad)"
                            strokeWidth={1.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="dt" className="mt-3 space-y-3">
                  {/* DT Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { label: "Acurácia", value: result.decisionTreeResult.metrics.accuracy, pct: true },
                      { label: "Precisão", value: result.decisionTreeResult.metrics.precision, pct: true },
                      { label: "Recall", value: result.decisionTreeResult.metrics.recall, pct: true },
                      { label: "F1-Score", value: result.decisionTreeResult.metrics.f1, pct: true },
                      { label: "AUC-ROC", value: result.decisionTreeResult.metrics.auc, pct: true },
                    ].map((m) => (
                      <div key={m.label} className="bg-secondary/20 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-muted-foreground">{m.label}</p>
                        <p className={cn("text-sm font-mono font-bold", getMetricColor(m.value))}>
                          {(m.value * 100).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Tree info */}
                  <div className="bg-secondary/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <GitBranch className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-medium">Configuração da Árvore</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-[8px] text-muted-foreground">Profundidade Máx.</p>
                        <p className="text-xs font-mono font-bold text-amber-400">{config.maxDepth}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] text-muted-foreground">Min Samples Split</p>
                        <p className="text-xs font-mono font-bold text-amber-400">{config.minSamplesSplit}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] text-muted-foreground">Critério</p>
                        <p className="text-xs font-mono font-bold text-amber-400">Gini</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="rf" className="mt-3 space-y-3">
                  {/* RF Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { label: "Acurácia", value: result.randomForestResult.metrics.accuracy, pct: true },
                      { label: "Precisão", value: result.randomForestResult.metrics.precision, pct: true },
                      { label: "Recall", value: result.randomForestResult.metrics.recall, pct: true },
                      { label: "F1-Score", value: result.randomForestResult.metrics.f1, pct: true },
                      { label: "AUC-ROC", value: result.randomForestResult.metrics.auc, pct: true },
                    ].map((m) => (
                      <div key={m.label} className="bg-secondary/20 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-muted-foreground">{m.label}</p>
                        <p className={cn("text-sm font-mono font-bold", getMetricColor(m.value))}>
                          {(m.value * 100).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* RF info */}
                  <div className="bg-secondary/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Layers className="w-3 h-3 text-crypto-green" />
                      <span className="text-[10px] font-medium">Configuração do Random Forest</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <p className="text-[8px] text-muted-foreground">Árvores</p>
                        <p className="text-xs font-mono font-bold text-crypto-green">15</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] text-muted-foreground">Profundidade Máx.</p>
                        <p className="text-xs font-mono font-bold text-crypto-green">{config.maxDepth}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] text-muted-foreground">Bootstrap</p>
                        <p className="text-xs font-mono font-bold text-crypto-green">Sim</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] text-muted-foreground">Features/Split</p>
                        <p className="text-xs font-mono font-bold text-crypto-green">&radic;n</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              {featureImportanceData.length > 0 && (
                <div className="bg-secondary/10 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BarChart3 className="w-3 h-3 text-crypto-cyan" />
                    <span className="text-[10px] font-medium">
                      Importância das Features — {activeModelTab === "logistic" ? "Reg. Logística (|pesos|)" : activeModelTab === "dt" ? "Árvore Decisão (splits)" : "Random Forest (média)"}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={featureImportanceData} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 8 }}
                        stroke="oklch(0.5 0 0)"
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 9 }}
                        stroke="oklch(0.5 0 0)"
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "oklch(0.14 0.012 260)",
                          border: "1px solid oklch(0.3 0 0)",
                          borderRadius: 8,
                          fontSize: 10,
                        }}
                        formatter={(value: number) => [`${value}%`, "Importância"]}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {featureImportanceData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index === 0 ? "#06b6d4" : index === 1 ? "#22c55e" : index < 3 ? "#f59e0b" : "#64748b"}
                            fillOpacity={Math.max(0.4, 1 - index * 0.12)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Confusion Matrix + Target Distribution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Confusion Matrix */}
                {confusionMatrixData && (
                  <div className="bg-secondary/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Target className="w-3 h-3 text-crypto-cyan" />
                      <span className="text-[10px] font-medium">Matriz de Confusão</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      {/* Header row */}
                      <div />
                      <div className="text-[8px] text-muted-foreground font-medium">Pred: Alta</div>
                      <div className="text-[8px] text-muted-foreground font-medium">Pred: Baixa</div>
                      {/* Real Alta row */}
                      <div className="text-[8px] text-muted-foreground font-medium flex items-center justify-end pr-1">Real Alta</div>
                      <div className="bg-crypto-green/20 rounded-md p-2">
                        <p className="text-[8px] text-crypto-green/70">TP</p>
                        <p className="text-sm font-mono font-bold text-crypto-green">{confusionMatrixData.tp}</p>
                      </div>
                      <div className="bg-crypto-red/10 rounded-md p-2">
                        <p className="text-[8px] text-crypto-red/70">FN</p>
                        <p className="text-sm font-mono font-bold text-crypto-red">{confusionMatrixData.fn}</p>
                      </div>
                      {/* Real Baixa row */}
                      <div className="text-[8px] text-muted-foreground font-medium flex items-center justify-end pr-1">Real Baixa</div>
                      <div className="bg-crypto-red/10 rounded-md p-2">
                        <p className="text-[8px] text-crypto-red/70">FP</p>
                        <p className="text-sm font-mono font-bold text-crypto-red">{confusionMatrixData.fp}</p>
                      </div>
                      <div className="bg-crypto-cyan/20 rounded-md p-2">
                        <p className="text-[8px] text-crypto-cyan/70">TN</p>
                        <p className="text-sm font-mono font-bold text-crypto-cyan">{confusionMatrixData.tn}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Target Distribution */}
                {targetDistribution.length > 0 && (
                  <div className="bg-secondary/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <PieChart className="w-3 h-3 text-crypto-cyan" />
                      <span className="text-[10px] font-medium">Distribuição do Target (y)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={130}>
                      <RechartsPie>
                        <Pie
                          data={targetDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={45}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {targetDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.7} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "oklch(0.14 0.012 260)",
                            border: "1px solid oklch(0.3 0 0)",
                            borderRadius: 8,
                            fontSize: 10,
                          }}
                        />
                      </RechartsPie>
                    </ResponsiveContainer>
                    <div className="text-center text-[9px] text-muted-foreground mt-1">
                      y = 1: Preço sobe &middot; y = 0: Preço desce
                    </div>
                  </div>
                )}
              </div>

              {/* Model Comparison Table */}
              <div className="bg-secondary/10 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3 h-3 text-crypto-cyan" />
                  <span className="text-[10px] font-medium">Comparação de Modelos</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Modelo</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">Acurácia</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">Precisão</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">Recall</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">F1</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">AUC</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={cn("border-b border-border/10", result.bestModel === "logistic" && "bg-crypto-green/5")}>
                        <td className="py-1.5 px-2 font-medium flex items-center gap-1">
                          <LineChart className="w-3 h-3 text-crypto-cyan" />
                          Reg. Logística
                        </td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.logRegResult.metrics.accuracy * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.logRegResult.metrics.precision * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.logRegResult.metrics.recall * 100).toFixed(1)}%</td>
                        <td className={cn("text-center py-1.5 px-2 font-mono font-bold", getMetricColor(result.logRegResult.metrics.f1))}>
                          {(result.logRegResult.metrics.f1 * 100).toFixed(1)}%
                        </td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.logRegResult.metrics.auc * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2">
                          {result.bestModel === "logistic" && (
                            <Badge className="text-[8px] bg-crypto-green/10 text-crypto-green border-crypto-green/30">Melhor</Badge>
                          )}
                        </td>
                      </tr>
                      <tr className={cn("border-b border-border/10", result.bestModel === "decision-tree" && "bg-crypto-green/5")}>
                        <td className="py-1.5 px-2 font-medium flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-amber-400" />
                          Árvore Decisão
                        </td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.decisionTreeResult.metrics.accuracy * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.decisionTreeResult.metrics.precision * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.decisionTreeResult.metrics.recall * 100).toFixed(1)}%</td>
                        <td className={cn("text-center py-1.5 px-2 font-mono font-bold", getMetricColor(result.decisionTreeResult.metrics.f1))}>
                          {(result.decisionTreeResult.metrics.f1 * 100).toFixed(1)}%
                        </td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.decisionTreeResult.metrics.auc * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2">
                          {result.bestModel === "decision-tree" && (
                            <Badge className="text-[8px] bg-crypto-green/10 text-crypto-green border-crypto-green/30">Melhor</Badge>
                          )}
                        </td>
                      </tr>
                      <tr className={cn(result.bestModel === "random-forest" && "bg-crypto-green/5")}>
                        <td className="py-1.5 px-2 font-medium flex items-center gap-1">
                          <Layers className="w-3 h-3 text-crypto-green" />
                          Random Forest
                        </td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.randomForestResult.metrics.accuracy * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.randomForestResult.metrics.precision * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.randomForestResult.metrics.recall * 100).toFixed(1)}%</td>
                        <td className={cn("text-center py-1.5 px-2 font-mono font-bold", getMetricColor(result.randomForestResult.metrics.f1))}>
                          {(result.randomForestResult.metrics.f1 * 100).toFixed(1)}%
                        </td>
                        <td className="text-center py-1.5 px-2 font-mono">{(result.randomForestResult.metrics.auc * 100).toFixed(1)}%</td>
                        <td className="text-center py-1.5 px-2">
                          {result.bestModel === "random-forest" && (
                            <Badge className="text-[8px] bg-crypto-green/10 text-crypto-green border-crypto-green/30">Melhor</Badge>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Current Feature Values */}
              <div className="bg-secondary/10 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3 h-3 text-crypto-cyan" />
                  <span className="text-[10px] font-medium">Features Atuais (último candle)</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {Object.entries(result.currentSignal.features).map(([key, value]) => (
                    <div key={key} className="bg-secondary/30 rounded-md p-1.5 text-center">
                      <p className="text-[7px] text-muted-foreground">{FEATURE_LABELS[key] || key}</p>
                      <p className={cn(
                        "text-[11px] font-mono font-bold",
                        key === "rsi" && (value > 70 ? "text-crypto-red" : value < 30 ? "text-crypto-green" : "text-crypto-cyan"),
                        key === "emaSpread" && (value > 0 ? "text-crypto-green" : value < 0 ? "text-crypto-red" : "text-muted-foreground"),
                        key === "macdHistogram" && (value > 0 ? "text-crypto-green" : value < 0 ? "text-crypto-red" : "text-muted-foreground"),
                        !["rsi", "emaSpread", "macdHistogram"].includes(key) && "text-foreground"
                      )}>
                        {typeof value === "number" ? (
                          key === "rsi" || key === "closePosition"
                            ? value.toFixed(1)
                            : key.includes("Change") || key === "hlRange"
                            ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
                            : value.toFixed(value > 100 ? 2 : 4)
                        ) : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pipeline Summary */}
              <div className="bg-crypto-cyan/5 border border-crypto-cyan/15 rounded-lg p-2.5">
                <div className="flex items-start gap-1.5">
                  <Brain className="w-3 h-3 text-crypto-cyan mt-0.5 shrink-0" />
                  <div className="text-[10px] text-muted-foreground leading-relaxed">
                    <span className="text-crypto-cyan font-semibold">Pipeline ML:</span>{" "}
                    Dados históricos (365 candles) → Engenharia de Features (RSI, EMA_9, EMA_21, MACD, Volume) →
                    Target (direção do próximo candle) → Padronização Z-Score → Split Treino/Teste →
                    Treinamento (Regressão Logística + Árvore de Decisão + Random Forest) → Avaliação (Acurácia, Precisão, Recall, F1, AUC) →
                    Ensemble Ponderado por F1 → Sinal Final
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Empty State */}
          {!result && !isTraining && !error && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-crypto-cyan/10 flex items-center justify-center mx-auto mb-3">
                <Brain className="w-7 h-7 text-crypto-cyan" />
              </div>
              <h3 className="text-sm font-medium mb-1">Pipeline de ML Pronto</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Configure as features e parâmetros, depois clique em &quot;Treinar Pipeline ML&quot; para treinar
                3 modelos (Regressão Logística, Árvore de Decisão, Random Forest) que prevêem a direção do próximo candle.
              </p>
              <div className="mt-3 flex items-center justify-center gap-3 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-1"><LineChart className="w-3 h-3 text-crypto-cyan" /> Reg. Logística</span>
                <span className="flex items-center gap-1"><GitBranch className="w-3 h-3 text-amber-400" /> Árvore Decisão</span>
                <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-crypto-green" /> Random Forest</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> Ensemble</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
