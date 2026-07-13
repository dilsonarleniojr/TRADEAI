"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useCryptoStore, type TradeData, type KlineData } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Square,
  Bot,
  Zap,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  FileText,
  Clock,
  Brain,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertOctagon,
  Percent,
  Plus,
  Trash2,
  Shield,
  Eye,
  Sliders
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBinanceData } from "@/hooks/use-binance-data";
import { useBinanceStream } from "@/hooks/use-binance-stream";

export function BotSection() {
  const {
    activeBots,
    marginLedger,
    addBotInstance,
    toggleBotInstance,
    removeBotInstance,
    tickers,
    klines: activeKlines,
    tradingMode,
    setTradingMode,
    botLogs,
    addBotLog
  } = useCryptoStore();

  const { toast } = useToast();
  const { fetchKlines } = useBinanceData();
  useBinanceStream();

  // Selected config states for creating new bots
  const [selectedStrategy, setSelectedStrategy] = useState<"RSI" | "MACD" | "AI">("AI");
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [botName, setBotName] = useState("");
  const [allocatedMargin, setAllocatedMargin] = useState(250);

  // Dynamic parameters for the selected strategy
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiBuy, setRsiBuy] = useState(30);
  const [rsiSell, setRsiSell] = useState(70);

  const [emaFast, setEmaFast] = useState(9);
  const [emaSlow, setEmaSlow] = useState(21);

  const [aiConfidence, setAiConfidence] = useState(75);
  const [useKelly, setUseKelly] = useState(true);
  const [useQuantFunnel, setUseQuantFunnel] = useState(true);

  // Microstructure defense states
  const [spoofingDetector, setSpoofingDetector] = useState(true);
  const [icebergTracker, setIcebergTracker] = useState(true);
  const [spoofAlerts, setSpoofAlerts] = useState<string[]>([]);
  const [icebergAlerts, setIcebergAlerts] = useState<string[]>([]);

  useEffect(() => {
    fetchKlines(selectedSymbol);
  }, [selectedSymbol, fetchKlines]);

  // Simulate Microstructure Events (Spoofing & Iceberg Orders)
  useEffect(() => {
    const interval = setInterval(() => {
      if (spoofingDetector && Math.random() > 0.7) {
        const size = Math.floor(50 + Math.random() * 200);
        const priceDiff = (Math.random() * 5).toFixed(2);
        const alertMsg = `[SPOOFING] Cancelamento em massa detectado: ${size} BTC removidos a $${priceDiff} do spread.`;
        setSpoofAlerts((prev) => [alertMsg, ...prev].slice(0, 5));
        addBotLog({
          message: alertMsg,
          type: "warning"
        });
      }

      if (icebergTracker && Math.random() > 0.8) {
        const size = Math.floor(100 + Math.random() * 500);
        const alertMsg = `[ICEBERG] Baleia acumulando invisivelmente: ${size} ETH executados no bid oculto.`;
        setIcebergAlerts((prev) => [alertMsg, ...prev].slice(0, 5));
        addBotLog({
          message: alertMsg,
          type: "info"
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [spoofingDetector, icebergTracker, addBotLog]);

  // Calculate real-time VaR (Value at Risk) based on current allocated margin and simulated relative volatility (ATR)
  const relativeATR = 0.024; // 2.4% average ATR proxy
  const totalVaR = marginLedger.allocatedMargin * relativeATR * 1.65;
  const isVaRAlert = totalVaR > marginLedger.totalAccount * 0.1; // Alert if VaR is > 10% of account

  const handleCreateBot = () => {
    if (marginLedger.freeMargin < allocatedMargin) {
      toast({
        title: "Margem Insuficiente",
        description: "Você não possui margem livre suficiente para alocar este robô.",
        variant: "destructive"
      });
      return;
    }

    const name = botName.trim() || `${selectedStrategy}_${selectedSymbol.replace("USDT", "")}`;

    // Pack strategy params according to type (DSL)
    const parameters: Record<string, string> = {};
    if (selectedStrategy === "RSI") {
      parameters.rsiPeriod = String(rsiPeriod);
      parameters.buyThreshold = String(rsiBuy);
      parameters.sellThreshold = String(rsiSell);
    } else if (selectedStrategy === "MACD") {
      parameters.emaFast = String(emaFast);
      parameters.emaSlow = String(emaSlow);
    } else {
      parameters.confidence = String(aiConfidence);
      parameters.useKelly = String(useKelly);
      parameters.useQuantFunnel = String(useQuantFunnel);
    }

    addBotInstance({
      name,
      symbol: selectedSymbol,
      strategy: selectedStrategy,
      parameters,
      allocatedMargin
    });

    setBotName("");
    toast({
      title: "🤖 Robô Inicializado!",
      description: `Bot ${name} iniciado com sucesso para operar ${selectedSymbol}.`
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Risk Dashboard (Continuous Risk Manager) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="bg-card/60 backdrop-blur-md border border-border/50 col-span-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-crypto-cyan" />
              Motor de Risco Contínuo (Real-Time VaR)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
              {/* Margins */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Saldo da Conta</span>
                <div className="text-xl font-bold tracking-tight text-foreground font-sans">
                  ${formatPrice(marginLedger.totalAccount)}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Margem Alocada</span>
                <div className="text-xl font-bold tracking-tight text-crypto-gold">
                  ${formatPrice(marginLedger.allocatedMargin)}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Margem Livre</span>
                <div className="text-xl font-bold tracking-tight text-crypto-green">
                  ${formatPrice(marginLedger.freeMargin)}
                </div>
              </div>

              {/* VaR Alert */}
              <div className={`p-3 rounded-lg border flex flex-col justify-center ${
                isVaRAlert 
                  ? "bg-crypto-red/10 border-crypto-red/30 text-crypto-red"
                  : "bg-crypto-green/10 border-crypto-green/30 text-crypto-green"
              }`}>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase">
                  {isVaRAlert ? <AlertOctagon className="w-3.5 h-3.5 animate-pulse" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  VaR Estressado (95%)
                </div>
                <div className="text-lg font-extrabold font-mono mt-1">
                  ${formatPrice(totalVaR)}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {(totalVaR / marginLedger.totalAccount * 100).toFixed(2)}% do Capital Total
                </span>
              </div>
            </div>

            {/* Visual Balance Bar */}
            <div className="w-full h-2 bg-secondary/50 rounded-full overflow-hidden flex mt-4">
              <div 
                className="bg-crypto-gold h-full transition-all duration-500" 
                style={{ width: `${(marginLedger.allocatedMargin / marginLedger.totalAccount) * 100}%` }}
              />
              <div 
                className="bg-crypto-green h-full transition-all duration-500" 
                style={{ width: `${(marginLedger.freeMargin / marginLedger.totalAccount) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Config Toggles */}
        <Card className="bg-card/60 backdrop-blur-md border border-border/50 col-span-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sliders className="w-4 h-4 text-crypto-cyan" />
              Controles Globais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="global-mode" className="text-xs text-muted-foreground uppercase cursor-pointer">Ambiente Real</Label>
              <Switch 
                id="global-mode"
                checked={tradingMode === "live"}
                onCheckedChange={(live) => setTradingMode(live ? "live" : "paper")}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="spoof-toggle" className="text-xs text-muted-foreground uppercase cursor-pointer">Spoofing Detector</Label>
              <Switch 
                id="spoof-toggle"
                checked={spoofingDetector}
                onCheckedChange={setSpoofingDetector}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="iceberg-toggle" className="text-xs text-muted-foreground uppercase cursor-pointer">Iceberg Tracker</Label>
              <Switch 
                id="iceberg-toggle"
                checked={icebergTracker}
                onCheckedChange={setIcebergTracker}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Main Section: Left = Strategy Form Generator, Right = Multi-Bot Orchestrator Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Dynamic Strategy parameters configuration */}
        <div className="space-y-4">
          <Card className="bg-card/60 backdrop-blur-md border border-border/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4 text-crypto-cyan" />
                Orquestrar Nova Estratégia (DSL)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Strategy Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase">Estratégia</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["AI", "RSI", "MACD"] as const).map((strat) => (
                    <Button
                      key={strat}
                      variant={selectedStrategy === strat ? "default" : "outline"}
                      onClick={() => setSelectedStrategy(strat)}
                      className={`h-9 text-xs font-semibold cursor-pointer ${
                        selectedStrategy === strat ? "bg-crypto-cyan hover:bg-crypto-cyan/90 text-background" : ""
                      }`}
                    >
                      {strat}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Bot Custom Name & Ticker Symbol */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bot-name-input" className="text-xs text-muted-foreground uppercase">Nome do Bot</Label>
                  <Input 
                    id="bot-name-input"
                    type="text" 
                    placeholder="Auto"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bot-symbol-select" className="text-xs text-muted-foreground uppercase">Símbolo</Label>
                  <select 
                    id="bot-symbol-select"
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="BTCUSDT">BTC/USDT</option>
                    <option value="ETHUSDT">ETH/USDT</option>
                    <option value="SOLUSDT">SOL/USDT</option>
                    <option value="NEARUSDT">NEAR/USDT</option>
                    <option value="AVAXUSDT">AVAX/USDT</option>
                  </select>
                </div>
              </div>

              {/* Margin Allocation Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <Label className="text-muted-foreground uppercase">Margem Alocada</Label>
                  <span className="font-semibold text-crypto-cyan">${allocatedMargin}</span>
                </div>
                <Slider 
                  min={100}
                  max={500}
                  step={25}
                  value={[allocatedMargin]}
                  onValueChange={(val) => setAllocatedMargin(val[0])}
                />
              </div>

              {/* DYNAMIC FORM GENERATOR (Reads selectedStrategy schema) */}
              <div className="border-t border-border/50 pt-4 space-y-4">
                <span className="text-xs font-bold text-crypto-cyan uppercase flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" />
                  Configuração Dinâmica ({selectedStrategy})
                </span>

                {selectedStrategy === "RSI" && (
                  <div className="space-y-4">
                    {/* RSI Period */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <Label className="text-muted-foreground">Período RSI</Label>
                        <span className="font-semibold">{rsiPeriod}</span>
                      </div>
                      <Slider min={5} max={25} step={1} value={[rsiPeriod]} onValueChange={(val) => setRsiPeriod(val[0])} />
                    </div>

                    {/* RSI Thresholds */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <Label className="text-crypto-green">Compra RSI</Label>
                          <span className="font-semibold">{rsiBuy}</span>
                        </div>
                        <Slider min={15} max={45} step={1} value={[rsiBuy]} onValueChange={(val) => setRsiBuy(val[0])} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <Label className="text-crypto-red">Venda RSI</Label>
                          <span className="font-semibold">{rsiSell}</span>
                        </div>
                        <Slider min={55} max={85} step={1} value={[rsiSell]} onValueChange={(val) => setRsiSell(val[0])} />
                      </div>
                    </div>
                  </div>
                )}

                {selectedStrategy === "MACD" && (
                  <div className="space-y-4">
                    {/* EMA Fast */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <Label className="text-muted-foreground">EMA Rápida</Label>
                        <span className="font-semibold">{emaFast}</span>
                      </div>
                      <Slider min={5} max={20} step={1} value={[emaFast]} onValueChange={(val) => setEmaFast(val[0])} />
                    </div>

                    {/* EMA Slow */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <Label className="text-muted-foreground">EMA Lenta</Label>
                        <span className="font-semibold">{emaSlow}</span>
                      </div>
                      <Slider min={20} max={50} step={1} value={[emaSlow]} onValueChange={(val) => setEmaSlow(val[0])} />
                    </div>
                  </div>
                )}

                {selectedStrategy === "AI" && (
                  <div className="space-y-4">
                    {/* Trend Prediction threshold slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <Label className="text-muted-foreground">Limiar de Confiança ML</Label>
                        <span className="font-semibold">{aiConfidence}%</span>
                      </div>
                      <Slider min={50} max={95} step={5} value={[aiConfidence]} onValueChange={(val) => setAiConfidence(val[0])} />
                    </div>

                    {/* Kelly sizing switch */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-xs text-muted-foreground uppercase">Dimensionamento Kelly</Label>
                        <p className="text-[10px] text-muted-foreground font-light">Calcula dinamicamente a posição ideal.</p>
                      </div>
                      <Switch checked={useKelly} onCheckedChange={setUseKelly} />
                    </div>

                    {/* Funnel filters switch */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-xs text-muted-foreground uppercase">Filtro Funil de Ativos</Label>
                        <p className="text-[10px] text-muted-foreground font-light">Opera apenas ativos com assimetria favorável.</p>
                      </div>
                      <Switch checked={useQuantFunnel} onCheckedChange={setUseQuantFunnel} />
                    </div>

                    {/* Kelly details if active */}
                    {useKelly && (
                      <div className="bg-crypto-cyan/5 border border-crypto-cyan/15 rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-crypto-cyan uppercase">
                          <Percent className="w-3.5 h-3.5" />
                          Kelly Criterion Formula Size
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-relaxed">
                          Fórmula: <code className="font-mono text-foreground font-bold">f* = p - (1 - p)/b</code>
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-relaxed">
                          Alocação ideal estimada: <span className="text-crypto-cyan font-bold">12.5%</span> da margem.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Start bot button */}
              <Button
                onClick={handleCreateBot}
                className="w-full btn-gradient-animated text-white h-10 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 mt-2 shadow-lg shadow-crypto-cyan/10 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Registrar e Rodar Bot
              </Button>

            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Multi-Bot Orchestrator dashboard grid */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card/60 backdrop-blur-md border border-border/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
            <CardHeader className="pb-3 flex flex-row items-center">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bot className="w-4 h-4 text-crypto-cyan" />
                Dashboard do Orquestrador ({activeBots.length} Bots Ativos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeBots.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Bot className="w-12 h-12 mx-auto text-muted-foreground/30 animate-pulse" />
                  <p className="text-sm text-muted-foreground">Nenhum robô de negociação rodando nesta frota.</p>
                  <p className="text-xs text-muted-foreground/70 font-light">Selecione uma estratégia e configure no painel esquerdo para registrar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AnimatePresence>
                    {activeBots.map((bot) => {
                      const ticker = tickers[bot.symbol];
                      const currentPrice = ticker?.price ?? 0;
                      const changePercent = ticker?.priceChangePercent ?? 0;
                      const isPnlPositive = bot.pnl >= 0;

                      return (
                        <motion.div
                          key={bot.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="glass rounded-xl p-4 border border-border/50 flex flex-col justify-between space-y-3 relative hover:shadow-[0_4px_20px_rgba(6,182,212,0.05)] transition-all group"
                        >
                          {/* Accent bar by status */}
                          <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${
                            bot.status === "RUNNING" 
                              ? "bg-crypto-green" 
                              : bot.status === "PAUSED" 
                              ? "bg-crypto-gold" 
                              : "bg-crypto-red"
                          }`} />

                          {/* Top row */}
                          <div className="pl-2 flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-sm tracking-tight text-foreground">{bot.name}</span>
                                <Badge variant="outline" className="text-[9px] border-crypto-cyan/20 text-crypto-cyan px-1">
                                  {bot.strategy}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{bot.symbol}</span>
                            </div>

                            {/* Status label */}
                            <Badge 
                              className={`text-[9px] font-semibold tracking-wider ${
                                bot.status === "RUNNING"
                                  ? "bg-crypto-green/10 text-crypto-green border-crypto-green/20"
                                  : bot.status === "PAUSED"
                                  ? "bg-crypto-gold/10 text-crypto-gold border-crypto-gold/20"
                                  : "bg-crypto-red/10 text-crypto-red border-crypto-red/20"
                              }`}
                            >
                              {bot.status}
                            </Badge>
                          </div>

                          {/* Dynamic Parameters summary (DSL) */}
                          <div className="pl-2 grid grid-cols-2 gap-2 bg-secondary/10 rounded-lg p-2 border border-border/30 text-[10px]">
                            {Object.entries(bot.parameters).map(([key, val]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-muted-foreground capitalize">{key.replace("rsi", "").replace("ema", "")}:</span>
                                <span className="font-bold text-foreground">{val}</span>
                              </div>
                            ))}
                            <div className="flex justify-between col-span-2 border-t border-border/20 pt-1 mt-1 text-[9px] text-muted-foreground">
                              <span>Margem Reservada:</span>
                              <span className="font-bold text-crypto-gold">${bot.allocatedMargin}</span>
                            </div>
                          </div>

                          {/* Real-time Returns (Tabular Numbers to avoid jitter) */}
                          <div className="pl-2 flex items-center justify-between border-t border-border/30 pt-2">
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-muted-foreground uppercase">Retornos do Bot</span>
                              <div className={`text-sm font-bold font-mono tracking-tight tabular-nums ${
                                isPnlPositive ? "text-crypto-green" : "text-crypto-red"
                              }`}>
                                {isPnlPositive ? "+" : ""}${bot.pnl.toFixed(2)}
                              </div>
                            </div>
                            
                            {/* Control action buttons */}
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0 cursor-pointer"
                                onClick={() => toggleBotInstance(bot.id)}
                                title={bot.status === "RUNNING" ? "Pausar Bot" : "Retomar Bot"}
                              >
                                {bot.status === "RUNNING" ? (
                                  <Square className="w-3.5 h-3.5 text-crypto-gold" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 text-crypto-green fill-crypto-green" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0 hover:bg-crypto-red/10 border-border/50 hover:border-crypto-red/40 hover:text-crypto-red cursor-pointer"
                                onClick={() => removeBotInstance(bot.id)}
                                title="Destruir / Cancelar Bot"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-crypto-red" />
                              </Button>
                            </div>
                          </div>

                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Microstructure Defense Activity Stream */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Spoofing log */}
            <Card className="bg-card/60 backdrop-blur-md border border-border/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-crypto-cyan">
                  <Shield className="w-4 h-4 text-crypto-cyan animate-pulse" />
                  SPOOFING / LAYERING DETECTOR (MURAL)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-0.5 scrollbar-thin text-[10px]">
                  {spoofAlerts.length > 0 ? (
                    spoofAlerts.map((alert, idx) => (
                      <div key={idx} className="bg-crypto-red/10 border border-crypto-red/20 px-2.5 py-1.5 rounded text-crypto-red leading-relaxed">
                        {alert}
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center py-6 text-muted-foreground/60 font-light">
                      Nenhuma anomalia de ordens falsas no mural.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Iceberg log */}
            <Card className="bg-card/60 backdrop-blur-md border border-border/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-crypto-cyan">
                  <Eye className="w-4 h-4 text-crypto-cyan" />
                  ICEBERG ORDER TRACKER (FLUXO INVISÍVEL)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-0.5 scrollbar-thin text-[10px]">
                  {icebergAlerts.length > 0 ? (
                    icebergAlerts.map((alert, idx) => (
                      <div key={idx} className="bg-crypto-cyan/10 border border-crypto-cyan/20 px-2.5 py-1.5 rounded text-crypto-cyan leading-relaxed">
                        {alert}
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center py-6 text-muted-foreground/60 font-light">
                      Aguardando execuções institucionais de alta relevância...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ONNX Model Trend Inference score & Factor Confluence */}
          <Card className="bg-card/60 backdrop-blur-md border border-border/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/40 to-transparent" />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-crypto-cyan" />
                Multi-Factor Confluence (ONNX JVM / Python native prediction)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
                
                {/* 1. ONNX Inference Score */}
                <div className="bg-secondary/30 rounded-lg p-3 space-y-1 border border-border/30">
                  <span className="text-[10px] text-muted-foreground uppercase">Previsão Trend Score (ONNX)</span>
                  <div className="text-lg font-bold text-crypto-cyan">0.865 (ALTA CONFINÊNCIA)</div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed font-light">
                    O classificador ONNX prediz tendência bullish para os próximos klines de {selectedSymbol.replace("USDT", "")}.
                  </p>
                </div>

                {/* 2. Factor Confluence */}
                <div className="bg-secondary/30 rounded-lg p-3 space-y-1.5 border border-border/30">
                  <span className="text-[10px] text-muted-foreground uppercase">Fatores Analisados</span>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Order Book Imbalance (OBI):</span>
                      <span className="font-bold text-crypto-green">0.68 (Comprador)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Z-Score de Cointegração:</span>
                      <span className="font-bold text-crypto-green">-2.15 (Sobrevenda)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sentimento da IA (LLM):</span>
                      <span className="font-bold text-crypto-green">82% Bullish</span>
                    </div>
                  </div>
                </div>

                {/* 3. Confluence Result */}
                <div className="bg-secondary/30 rounded-lg p-3 flex flex-col justify-between border border-border/30">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase">Resultado Confluência</span>
                    <div className="text-sm font-bold text-crypto-green flex items-center gap-1">
                      <Sparkles className="w-4 h-4 animate-pulse text-crypto-green" />
                      COMPRA RECOMENDADA
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground leading-relaxed font-light">
                    Todos os 3 fatores (Micro desequilíbrio + Macro sentimento + Cointegração) apontam para confluência positiva.
                  </p>
                </div>

              </div>
            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  );
}
