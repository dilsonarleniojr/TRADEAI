"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Play,
  Settings,
  Activity,
  Zap,
  Shield,
  Gauge,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Terminal,
  Cpu,
  BarChart3,
  ListTodo,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface OptimizationRun {
  config: {
    position_size_pct: number;
    stop_loss_pct: number;
    take_profit_pct: number;
    order_slices: number;
    reevaluation_interval_s: number;
  };
  metrics: {
    final_balance: number;
    net_pnl: number;
    net_pnl_pct: number;
    sharpe: number;
    sortino: number;
    max_drawdown_pct: number;
    fill_rate_pct: number;
    avg_slippage_bps: number;
    execution_cost: number;
  };
}

interface OptimizationResultData {
  symbol: string;
  strategy: string;
  search_method: string;
  scenario: string;
  iterations: number;
  elapsed_seconds: number;
  best_config: {
    position_size_pct: number;
    stop_loss_pct: number;
    take_profit_pct: number;
    order_slices: number;
    reevaluation_interval_s: number;
  };
  best_metrics: {
    initial_balance: number;
    final_balance: number;
    net_pnl: number;
    net_pnl_pct: number;
    sharpe: number;
    sortino: number;
    max_drawdown_pct: number;
    total_orders_submitted: number;
    total_orders_filled: number;
    total_orders_rejected: number;
    fill_rate_pct: number;
    avg_slippage_bps: number;
    execution_cost: number;
  };
  all_runs: OptimizationRun[];
  sensitivity_matrix: {
    parameter: string;
    correlation_with_sharpe: number;
  }[];
  walk_forward: {
    robustness_pct: number;
    folds: {
      fold: number;
      train_sharpe: number;
      test_sharpe: number;
      train_pnl: number;
      test_pnl: number;
      robust: boolean;
    }[];
  };
  equity_curve: {
    time: number;
    date: string;
    value: number;
  }[];
  timestamp: number;
}

interface TradeLogData {
  trade_id: string;
  side: string;
  price: number;
  quantity: number;
  total: number;
  commission: number;
  pnl: number;
  timestamp: number;
  reason: string;
}

export function OptimizerSection() {
  // Setup inputs state
  const [strategy, setStrategy] = useState<"Momentum" | "Market Making">("Momentum");
  const [method, setMethod] = useState<"Bayesian" | "Evolutionary" | "Random" | "Grid">("Bayesian");
  const [scenario, setScenario] = useState<"normal_market" | "high_volatility" | "low_liquidity" | "variable_latency">("normal_market");
  const [iterations, setIterations] = useState<number>(15);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [bestSharpeFound, setBestSharpeFound] = useState<number>(-999.0);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<OptimizationResultData | null>(null);
  const [trades, setTrades] = useState<TradeLogData[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll terminal logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Load last results on mount
  useEffect(() => {
    fetchLastResults();
  }, []);

  const fetchLastResults = async () => {
    try {
      const res = await fetch("/api/optimizer/results");
      if (res.ok) {
        const payload = await res.json();
        if (payload.success && payload.data) {
          setResults(payload.data);
          // Also fetch trades (from CSV) via client side parsing or read a static public CSV file if needed.
          // For simplicity, we can mock/load some trades or make a Next.js endpoint.
          // Since the trades list is in public/optimized_trades.csv, we can fetch and parse it!
          parseTradesCSV();
        }
      }
    } catch {}
  };

  const parseTradesCSV = async () => {
    try {
      const csvRes = await fetch("/optimization_results.json"); // check config first
      const tradesRes = await fetch("/optimized_trades.csv");
      if (tradesRes.ok) {
        const text = await tradesRes.text();
        const lines = text.split("\n");
        const parsedTrades: TradeLogData[] = [];
        
        // Skip header
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split(",");
          if (parts.length >= 8) {
            parsedTrades.push({
              trade_id: parts[0],
              side: parts[1] as any,
              price: parseFloat(parts[2]),
              quantity: parseFloat(parts[3]),
              total: parseFloat(parts[4]),
              commission: parseFloat(parts[5]),
              pnl: parseFloat(parts[6]),
              timestamp: parseFloat(parts[7]),
              reason: parts[8] || ""
            });
          }
        }
        setTrades(parsedTrades.slice(0, 50)); // display top 50
      }
    } catch {}
  };

  const runOptimizer = async () => {
    setIsRunning(true);
    setProgress(0);
    setCurrentIteration(0);
    setBestSharpeFound(-999.0);
    setLogs(["[SYSTEM] Inicializando motor de otimização quantitativa Antigravity...", `[SYSTEM] Modo de Busca: ${method}`, `[SYSTEM] Cenário: ${scenario}`, `[SYSTEM] Limite de iterações: ${iterations}`]);
    setResults(null);
    setTrades([]);
    setError(null);

    try {
      const response = await fetch("/api/optimizer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, method, scenario, iterations }),
      });

      if (!response.ok) {
        throw new Error("Falha ao iniciar otimização.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Stream de logs não disponível.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;

          if (cleanLine.startsWith("PROCESS_CLOSED_CODE_")) {
            const code = cleanLine.split("_").pop();
            setLogs((prev) => [...prev, `[SYSTEM] Otimizador finalizado com código ${code}. Carregando resultados...`]);
            
            if (code === "0") {
              await fetchLastResults();
            } else {
              setError("Ocorreu um erro na execução do script de otimização em Python.");
            }
          } else if (cleanLine.startsWith("{")) {
            try {
              const parsed = JSON.parse(cleanLine);
              if (parsed.type === "progress") {
                setProgress(Math.round((parsed.iteration / parsed.total) * 100));
                setCurrentIteration(parsed.iteration);
                setBestSharpeFound(parsed.best_sharpe);
                setLogs((prev) => [
                  ...prev,
                  `[Iteração ${parsed.iteration}/${parsed.total}] Sharpe Atual: ${parsed.current_sharpe.toFixed(2)} | Sharpe Máx: ${parsed.best_sharpe.toFixed(2)}`
                ]);
              }
            } catch {}
          } else {
            // Raw telemetry logs
            setLogs((prev) => [...prev, cleanLine]);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro desconhecido");
      setLogs((prev) => [...prev, `[ERROR] Falha: ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Setup Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Card */}
        <Card className="lg:col-span-1 border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-crypto-cyan" />
              <CardTitle className="text-md">Configuração da Otimização</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Configure as constraints de busca e perfis operacionais.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Strategy Select */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Estratégia Intraday</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={strategy === "Momentum" ? "default" : "outline"}
                  onClick={() => setStrategy("Momentum")}
                  disabled={isRunning}
                  className="text-xs font-medium h-9"
                >
                  Momentum
                </Button>
                <Button
                  size="sm"
                  variant={strategy === "Market Making" ? "default" : "outline"}
                  onClick={() => setStrategy("Market Making")}
                  disabled={isRunning}
                  className="text-xs font-medium h-9"
                >
                  Market Making
                </Button>
              </div>
            </div>

            {/* Method Select */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Algoritmo de Busca</label>
              <div className="grid grid-cols-2 gap-2">
                {(["Bayesian", "Evolutionary", "Random", "Grid"] as const).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={method === m ? "default" : "outline"}
                    onClick={() => setMethod(m)}
                    disabled={isRunning}
                    className="text-xs font-medium h-9"
                  >
                    {m === "Bayesian" ? "Bayesiana" : m === "Evolutionary" ? "Evolutiva" : m === "Random" ? "Aleatória" : "Grid Search"}
                  </Button>
                ))}
              </div>
            </div>

            {/* Scenario Select */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Cenário de Teste</label>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as any)}
                disabled={isRunning}
                className="w-full bg-input/40 border border-border/50 text-foreground rounded-lg p-2 text-xs focus:ring-2 focus:ring-crypto-cyan focus:outline-none"
              >
                <option value="normal_market">Mercado Normal (30d)</option>
                <option value="high_volatility">Alta Volatilidade (7d + Spikes)</option>
                <option value="low_liquidity">Baixa Liquidez (14d + Thin Book)</option>
                <option value="variable_latency">Latência Variável (50ms - 2s)</option>
              </select>
            </div>

            {/* Iterations Limit */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Número de Iterações</span>
                <span className="text-crypto-cyan font-bold">{iterations} sweeps</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value))}
                disabled={isRunning}
                className="w-full accent-crypto-cyan"
              />
            </div>

            {/* Run Button */}
            <Button
              onClick={runOptimizer}
              disabled={isRunning}
              className="w-full bg-gradient-to-r from-crypto-cyan to-crypto-green text-white hover:scale-[1.02] transition-transform font-bold text-xs h-10 gap-2"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Otimizando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Executar Otimização
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Live Logs Console */}
        <Card className="lg:col-span-2 border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg flex flex-col max-h-[380px]">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-crypto-cyan" />
                <CardTitle className="text-md">Console do Otimizador</CardTitle>
              </div>
              {isRunning && (
                <Badge variant="outline" className="text-[10px] animate-pulse text-crypto-cyan border-crypto-cyan/30 bg-crypto-cyan/5">
                  Processando Iteração {currentIteration}/{iterations}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-3 pb-4 min-h-0">
            {/* Progress Telemetry */}
            {isRunning && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                  <span>Melhor Sharpe: {bestSharpeFound > -999 ? bestSharpeFound.toFixed(2) : "N/A"}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5 bg-secondary accent-crypto-cyan" />
              </div>
            )}

            {/* Live Terminal Log */}
            <ScrollArea className="flex-1 w-full bg-black/85 border border-border/30 rounded-lg p-3 font-mono text-[11px] text-crypto-cyan/90 leading-relaxed shadow-inner">
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className={log.startsWith("[ERROR]") ? "text-crypto-red" : log.startsWith("[SYSTEM]") ? "text-crypto-gold" : "text-crypto-cyan/80"}>
                    {log}
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="text-muted-foreground text-center py-10">
                    Aguardando execução... Clique em "Executar Otimização" para iniciar o varredor.
                  </div>
                )}
                <div ref={terminalEndRef} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="bg-crypto-red/5 border-crypto-red/20">
          <CardContent className="p-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-crypto-red shrink-0" />
            <span className="text-xs text-crypto-red font-medium">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Results View */}
      {results && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Top Config Scorecard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Top Parameters Card */}
            <Card className="border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-crypto-cyan" />
                  <CardTitle className="text-sm font-semibold">Parâmetros Otimizados</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Posição (% Capital)</span>
                  <span className="font-semibold">{results.best_config.position_size_pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Stop Loss</span>
                  <span className="font-semibold text-crypto-red">-{results.best_config.stop_loss_pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Take Profit</span>
                  <span className="font-semibold text-crypto-green">+{results.best_config.take_profit_pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Fatias (Order Slicing)</span>
                  <span className="font-semibold">{results.best_config.order_slices} fatias</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">Intervalo Reavaliação</span>
                  <span className="font-semibold">{results.best_config.reevaluation_interval_s.toFixed(2)}s</span>
                </div>
              </CardContent>
            </Card>

            {/* Performance Card */}
            <Card className="border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-crypto-cyan" />
                  <CardTitle className="text-sm font-semibold">Performance Otimizada</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Retorno Total</span>
                  <span className="font-bold text-crypto-green">+{results.best_metrics.net_pnl_pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Sharpe Ratio</span>
                  <span className="font-bold text-crypto-cyan">{results.best_metrics.sharpe.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Sortino Ratio</span>
                  <span className="font-bold text-crypto-green">{results.best_metrics.sortino.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Max Drawdown</span>
                  <span className="font-semibold text-crypto-red">-{results.best_metrics.max_drawdown_pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">Tempo Execução</span>
                  <span className="font-semibold">{results.elapsed_seconds.toFixed(2)}s</span>
                </div>
              </CardContent>
            </Card>

            {/* Execution Engine Efficiency */}
            <Card className="border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-crypto-cyan" />
                  <CardTitle className="text-sm font-semibold">Eficiência de Execução</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Taxa de Preenchimento</span>
                  <span className="font-semibold text-crypto-green">{results.best_metrics.fill_rate_pct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Slippage Médio</span>
                  <span className="font-semibold text-crypto-gold">{results.best_metrics.avg_slippage_bps.toFixed(2)} bps</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Custo Execução total</span>
                  <span className="font-semibold">${results.best_metrics.execution_cost.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/20 py-1">
                  <span className="text-muted-foreground">Ordens Submetidas</span>
                  <span className="font-semibold">{results.best_metrics.total_orders_submitted}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">Ordens Rejeitadas</span>
                  <span className="font-semibold text-crypto-red">{results.best_metrics.total_orders_rejected}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Equity curve chart */}
          <Card className="border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-crypto-cyan" />
                <CardTitle className="text-md">Curva de Equity Otimizada</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Evolução do saldo de capital de {results.symbol} no cenário {scenario}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={results.equity_curve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="optEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/20" />
                    <XAxis dataKey="date" className="text-[9px]" stroke="rgba(255,255,255,0.4)" />
                    <YAxis
                      className="text-[9px]"
                      stroke="rgba(255,255,255,0.4)"
                      domain={["dataMin - 1000", "dataMax + 1000"]}
                      tickFormatter={(v) => `$${v.toLocaleString()}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", borderColor: "rgba(255,255,255,0.15)" }}
                      labelStyle={{ color: "#fff", fontSize: "10px" }}
                      itemStyle={{ color: "#06b6d4", fontSize: "11px" }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#optEquity)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Walk forward validation & sensitivity matrix side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Walk Forward */}
            <Card className="border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-crypto-cyan" />
                    <CardTitle className="text-md">Validação Walk-Forward</CardTitle>
                  </div>
                  <Badge variant="outline" className={results.walk_forward.robustness_pct >= 50 ? "text-crypto-green border-crypto-green/30" : "text-crypto-gold border-crypto-gold/30"}>
                    Robustez: {results.walk_forward.robustness_pct.toFixed(0)}%
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Validação da performance em folds temporais out-of-sample
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {results.walk_forward.folds.map((f) => (
                  <div key={f.fold} className="bg-secondary/25 border border-border/30 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-crypto-cyan">Fold #{f.fold}</span>
                      <Badge variant="outline" className={f.robust ? "text-crypto-green border-crypto-green/30 bg-crypto-green/5" : "text-crypto-red border-crypto-red/30 bg-crypto-red/5"}>
                        {f.robust ? "ROBUSTO" : "INSTÁVEL"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Sharpe (Train)</span>
                        <span className="font-semibold text-foreground">{f.train_sharpe.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Sharpe (Test)</span>
                        <span className="font-semibold text-foreground">{f.test_sharpe.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">PnL (Train)</span>
                        <span className="font-semibold text-crypto-green">${f.train_pnl.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">PnL (Test)</span>
                        <span className={f.test_pnl >= 0 ? "font-semibold text-crypto-green" : "font-semibold text-crypto-red"}>
                          ${f.test_pnl.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Sensitivity Matrix */}
            <Card className="border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-crypto-cyan" />
                  <CardTitle className="text-md">Sensibilidade de Parâmetros</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Correlação linear entre cada parâmetro de busca e o Sharpe Ratio final
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {results.sensitivity_matrix.map((p) => {
                  const corr = p.correlation_with_sharpe;
                  const isPositive = corr >= 0;
                  const percent = Math.abs(corr) * 100;
                  return (
                    <div key={p.parameter} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-muted-foreground">{p.parameter}</span>
                        <span className={isPositive ? "text-crypto-green font-bold" : "text-crypto-red font-bold"}>
                          {isPositive ? "+" : ""}{corr.toFixed(3)}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary/50 rounded-full overflow-hidden flex">
                        {isPositive ? (
                          <div className="h-full bg-crypto-green" style={{ width: `${percent}%` }} />
                        ) : (
                          <div className="h-full bg-crypto-red" style={{ width: `${percent}%` }} />
                        )}
                      </div>
                    </div>
                  );
                })}
                {results.sensitivity_matrix.length === 0 && (
                  <div className="text-muted-foreground text-center py-10 text-xs">
                    Dados insuficientes para gerar a matriz de sensibilidade (requer mais sweeps).
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trade log list */}
          <Card className="border-border/40 glass bg-card/60 backdrop-blur-md shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-crypto-cyan" />
                <CardTitle className="text-md">Trades Simulados (Melhor Configuração)</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Lista de ordens executadas no simulador de Matching Engine do Antigravity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="border-border/20 hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Lado</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Taxa (Comm)</TableHead>
                      <TableHead>PnL Efetivo</TableHead>
                      <TableHead>Motivo da Execução</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((t) => (
                      <TableRow key={t.trade_id} className="border-border/10 hover:bg-secondary/10">
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{t.trade_id.slice(-8)}</TableCell>
                        <TableCell>
                          <Badge variant={t.side === "BUY" ? "default" : "secondary"} className={t.side === "BUY" ? "bg-crypto-green/10 text-crypto-green border-crypto-green/20" : "bg-crypto-red/10 text-crypto-red border-crypto-red/20"}>
                            {t.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">${t.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>{t.quantity.toFixed(4)}</TableCell>
                        <TableCell>${t.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>${t.commission.toFixed(4)}</TableCell>
                        <TableCell className={t.pnl > 0 ? "text-crypto-green font-semibold" : t.pnl < 0 ? "text-crypto-red font-semibold" : "text-muted-foreground"}>
                          {t.pnl !== 0 ? `${t.pnl > 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{t.reason}</TableCell>
                      </TableRow>
                    ))}
                    {trades.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                          Nenhum trade executado nesta otimização.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
