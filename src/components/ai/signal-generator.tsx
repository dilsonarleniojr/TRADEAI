'use client';

import { useState, useEffect } from 'react';
import { useCryptoStore, type AgentTelemetryData } from '@/lib/store';
import { formatPrice } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Zap,
  Loader2,
  AlertTriangle,
  DollarSign,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Target,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { AIBrainActivityWidget } from "@/components/ai/ai-brain-activity-widget";

interface SignalResult {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  stopLoss: number;
  takeProfit: number;
  // Campos estritos HFT
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence_score: number;
  risk_reward_ratio: number;
  key_driver: string;
  risk_warning: string;
  vetoed?: boolean;
  veto_reason?: string;
  flow_context?: {
    vwap?: number;
    vwap_distance_percent?: number;
    order_flow_imbalance?: number;
    funding_rate_percent?: number;
    liquidity_controller?: string;
  };
  agent_error?: boolean;
  error_reason?: string;
  agent_telemetry?: AgentTelemetryData;
}

const ACTION_CONFIG = {
  BUY: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    label: 'COMPRA (BUY)',
    barColor: 'bg-emerald-500',
  },
  SELL: {
    icon: TrendingDown,
    color: 'text-rose-400',
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/30',
    badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    label: 'VENDA (SELL)',
    barColor: 'bg-rose-500',
  },
  HOLD: {
    icon: Minus,
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/15',
    border: 'border-zinc-500/30',
    badge: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    label: 'NEUTRO (HOLD)',
    barColor: 'bg-zinc-500',
  },
};

const PRIORITY_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
  "DOTUSDT", "LINKUSDT", "POLUSDT", "ATOMUSDT",
];

const TOP_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AVAXUSDT", "ADAUSDT",
  "DOTUSDT", "ATOMUSDT", "NEARUSDT", "ALGOUSDT", "SUIUSDT", "APTUSDT",
  "SEIUSDT", "TIAUSDT", "INJUSDT",
  "POLUSDT", "ARBUSDT", "OPUSDT", "MANTAUSDT", "STRKUSDT",
  "LINKUSDT", "UNIUSDT", "AAVEUSDT", "ENAUSDT", "COMPUSDT",
  "CRVUSDT", "SNXUSDT", "LDOUSDT", "DYDXUSDT", "PENDLEUSDT",
  "DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "FLOKIUSDT", "BONKUSDT", "WIFUSDT",
  "FETUSDT", "RENDERUSDT", "IOUSDT", "TAOUSDT",
  "IMXUSDT", "GALAUSDT", "RONINUSDT", "AXSUSDT",
  "FILUSDT", "ARUSDT", "ETHFIUSDT",
  "XRPUSDT", "LTCUSDT", "TRXUSDT", "XLMUSDT",
  "MOVRUSDT", "JUPUSDT", "ZROUSDT", "PUMPUSDT", "BERAUSDT",
  "PHAUSDT", "NIGHTUSDT", "INITUSDT", "OGUSDT", "QNTUSDT",
];

function getEstimateSeconds(symbol: string, uptime: number): number {
  if (PRIORITY_SYMBOLS.includes(symbol)) {
    return 0;
  }
  const idx = TOP_SYMBOLS.indexOf(symbol);
  if (idx === -1) return 10;
  
  const targetBatch = Math.floor(idx / 8);
  const totalBatches = Math.ceil(TOP_SYMBOLS.length / 8);
  
  const t = uptime - 5;
  if (t < 0) {
    return Math.max(1, Math.ceil(5 + targetBatch * 10 - uptime));
  }
  
  const currentCycle = Math.floor(t / 10);
  const currentBatchIndex = currentCycle % totalBatches;
  
  let cyclesAway = (targetBatch - currentBatchIndex + totalBatches) % totalBatches;
  if (cyclesAway === 0) {
    return Math.max(1, Math.ceil(10 - (t % 10)));
  }
  
  return Math.max(1, Math.ceil(cyclesAway * 10 - (t % 10)));
}

export function SignalGenerator() {
  const {
    selectedSymbol,
    tickers,
    portfolio,
    tradingMode,
    addAiSignal,
    addTrade,
    setAccount,
    addScheduledOrder,
    addBotLog,
  } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      tickers: s.tickers,
      portfolio: s.portfolio,
      tradingMode: s.tradingMode,
      addAiSignal: s.addAiSignal,
      addTrade: s.addTrade,
      setAccount: s.setAccount,
      addScheduledOrder: s.addScheduledOrder,
      addBotLog: s.addBotLog,
    }))
  );
  const { toast } = useToast();

  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [execAmount, setExecAmount] = useState<number>(50);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executedSuccess, setExecutedSuccess] = useState(false);

  const ticker = tickers[selectedSymbol];
  const isLoaded = !!ticker && ticker.price > 0;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    
    async function checkHealth() {
      if (!isLoaded) {
        try {
          const res = await fetch('/api/health');
          if (res.ok) {
            const data = await res.json();
            const uptime = data.uptime ?? 0;
            const remaining = getEstimateSeconds(selectedSymbol, uptime);
            if (remaining > 0) {
              setIsSyncing(true);
              setTimeRemaining(remaining);
              
              timer = setInterval(() => {
                setTimeRemaining((prev) => {
                  if (prev === null || prev <= 1) {
                    clearInterval(timer);
                    setIsSyncing(false);
                    return null;
                  }
                  return prev - 1;
                });
              }, 1000);
            } else {
              setIsSyncing(false);
              setTimeRemaining(null);
            }
          }
        } catch {
          // Ignore and fallback
        }
      } else {
        setIsSyncing(false);
        setTimeRemaining(null);
      }
    }

    checkHealth();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoaded, selectedSymbol]);

  const generateSignal = async () => {
    setIsGenerating(true);
    setSignal(null);

    try {
      const res = await fetch('/api/ai/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          price: ticker?.price ?? 0,
          priceChange24h: ticker?.priceChangePercent ?? 0,
          volume: ticker?.volume ?? 0,
          quoteVolume: ticker?.quoteVolume ?? 0,
          high24h: ticker?.high ?? 0,
          low24h: ticker?.low ?? 0,
        }),
      });

      const data = await res.json();

      if (data.success && data.signal) {
        const rawSig = data.signal.signal || data.signal.action || 'HOLD';
        const action = (['BUY', 'SELL', 'HOLD'].includes(rawSig) ? rawSig : 'HOLD') as SignalResult['action'];
        
        const confidence_score = typeof data.signal.confidence_score === 'number'
          ? Math.max(0, Math.min(100, Math.round(data.signal.confidence_score)))
          : typeof data.signal.confidence === 'number'
          ? Math.round(data.signal.confidence * 100)
          : 50;
        const confidence = confidence_score / 100;

        const risk_reward_ratio = typeof data.signal.risk_reward_ratio === 'number'
          ? Math.round(data.signal.risk_reward_ratio * 100) / 100
          : 1.5;

        const key_driver = typeof data.signal.key_driver === 'string' && data.signal.key_driver.trim().length > 0
          ? data.signal.key_driver
          : typeof data.signal.reasoning === 'string'
          ? data.signal.reasoning
          : 'Gatilho de fluxo institucional';

        const risk_warning = typeof data.signal.risk_warning === 'string' && data.signal.risk_warning.trim().length > 0
          ? data.signal.risk_warning
          : 'Volatilidade elevada no book';

        const vetoed = Boolean(data.signal.vetoed);
        const veto_reason = data.signal.veto_reason;

        const stopLoss =
          typeof data.signal.stop_loss === 'number' && data.signal.stop_loss > 0
            ? data.signal.stop_loss
            : typeof data.signal.stopLoss === 'number' && data.signal.stopLoss > 0
            ? data.signal.stopLoss
            : ticker?.price ?? 0;

        const takeProfit =
          typeof data.signal.take_profit === 'number' && data.signal.take_profit > 0
            ? data.signal.take_profit
            : typeof data.signal.takeProfit === 'number' && data.signal.takeProfit > 0
            ? data.signal.takeProfit
            : ticker?.price ?? 0;

        const newSignal: SignalResult = {
          action,
          signal: action,
          confidence,
          confidence_score,
          risk_reward_ratio,
          key_driver,
          risk_warning,
          reasoning: key_driver,
          stopLoss,
          takeProfit,
          vetoed,
          veto_reason,
          flow_context: data.signal.flow_context,
          agent_error: Boolean(data.signal.agent_error),
          error_reason: data.signal.error_reason,
          agent_telemetry: data.signal.agent_telemetry,
        };
        setSignal(newSignal);

        // Also add to store signals
        addAiSignal({
          id: `sig-${Date.now()}`,
          symbol: selectedSymbol,
          action,
          signal: action,
          confidence,
          confidence_score,
          risk_reward_ratio,
          key_driver,
          risk_warning,
          vetoed,
          veto_reason,
          reasoning: key_driver,
          priceAtSignal: ticker?.price ?? 0,
          stopLoss,
          takeProfit,
          flow_context: data.signal.flow_context,
          agent_error: Boolean(data.signal.agent_error),
          error_reason: data.signal.error_reason,
          agent_telemetry: data.signal.agent_telemetry,
          createdAt: new Date().toISOString(),
        });
      } else {
        setSignal({
          action: 'HOLD',
          signal: 'HOLD',
          confidence: 0,
          confidence_score: 0,
          risk_reward_ratio: 0,
          key_driver: 'Falha do servidor: sinal bloqueado',
          risk_warning: 'Nenhuma decisão de mercado foi gerada',
          reasoning: 'Falha do servidor: sinal bloqueado',
          stopLoss: ticker?.price ?? 0,
          takeProfit: ticker?.price ?? 0,
          agent_error: true,
          error_reason: typeof data?.details === 'string' ? data.details : `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      setSignal({
        action: 'HOLD',
        signal: 'HOLD',
        confidence: 0,
        confidence_score: 0,
        risk_reward_ratio: 0,
        key_driver: 'Erro de comunicação de rede',
        risk_warning: 'Nenhuma decisão de mercado foi gerada',
        reasoning: 'Erro de rede. Por favor, tente novamente.',
        stopLoss: ticker?.price ?? 0,
        takeProfit: ticker?.price ?? 0,
        agent_error: true,
        error_reason: err instanceof Error ? err.message : 'Erro de rede',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const actionConfig = signal ? ACTION_CONFIG[signal.action] : null;
  const ActionIcon = actionConfig?.icon ?? Minus;

  const currentPos = portfolio.positions?.find((p) => p.symbol === selectedSymbol);
  const currentHoldingQty = currentPos?.quantity ?? (portfolio.assetQuantity > 0 && selectedSymbol === "BTCUSDT" ? portfolio.assetQuantity : 0);

  const formatSlTpPercent = (entryPrice: number, targetPrice: number) => {
    if (!entryPrice || entryPrice === 0) return '0%';
    const pct = ((targetPrice - entryPrice) / entryPrice) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  const handleExecuteSignal = async () => {
    if (!signal || !ticker || ticker.price <= 0) return;

    const currentPrice = ticker.price;
    const cleanSym = selectedSymbol.replace('USDT', '');
    let qty = 0;
    let total = 0;

    if (signal.action === 'BUY') {
      total = execAmount;
      if (total <= 0) {
        toast({
          title: "Valor Inválido",
          description: "Defina um valor em USDT para compra.",
          variant: "destructive",
        });
        return;
      }
      if (total > portfolio.cashBalance && tradingMode === "live") {
        toast({
          title: "Saldo Insuficiente",
          description: `Seu saldo em caixa é de $${portfolio.cashBalance.toFixed(2)} USDT.`,
          variant: "destructive",
        });
        return;
      }
      qty = Number((total / currentPrice).toFixed(6));
    } else if (signal.action === 'SELL') {
      qty = currentHoldingQty > 0 ? currentHoldingQty : Number((execAmount / currentPrice).toFixed(6));
      total = Number((qty * currentPrice).toFixed(2));
      if (qty <= 0) {
        toast({
          title: "Sem Moedas em Carteira",
          description: `Você não possui saldo de ${cleanSym} para vender.`,
          variant: "destructive",
        });
        return;
      }
    } else {
      return;
    }

    try {
      setIsExecuting(true);
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side: signal.action,
          price: currentPrice,
          quantity: qty,
          total,
          strategy: `Sinal IA (${Math.round(signal.confidence * 100)}% Confiança)`,
          mode: tradingMode,
          pnl: 0,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Falha ao registrar a ordem.");
      }

      // 1. Add to store
      addTrade({
        id: result.data.id || `trade-${Date.now()}`,
        symbol: result.data.symbol || selectedSymbol,
        side: result.data.side || signal.action,
        price: result.data.price || currentPrice,
        quantity: result.data.quantity || qty,
        total: result.data.total || total,
        strategy: result.data.strategy || `Sinal IA (${Math.round(signal.confidence * 100)}%)`,
        mode: result.data.mode || tradingMode,
        pnl: result.data.pnl || 0,
        timestamp: result.data.timestamp || new Date().toISOString(),
      });

      if (result.account) {
        setAccount(result.account);
      }

      // 2. Automatically register protective orders if BUY
      if (signal.action === 'BUY') {
        if (signal.takeProfit && signal.takeProfit > currentPrice) {
          addScheduledOrder({
            id: `tp-${Date.now()}`,
            symbol: selectedSymbol,
            side: "SELL",
            triggerPrice: signal.takeProfit,
            quantity: qty,
            direction: "above",
            isTriggered: false,
            createdAt: new Date().toISOString(),
          });
        }
        if (signal.stopLoss && signal.stopLoss > 0 && signal.stopLoss < currentPrice) {
          addScheduledOrder({
            id: `sl-${Date.now()}`,
            symbol: selectedSymbol,
            side: "SELL",
            triggerPrice: signal.stopLoss,
            quantity: qty,
            direction: "below",
            isTriggered: false,
            createdAt: new Date().toISOString(),
          });
        }
      }

      addBotLog({
        type: signal.action === 'BUY' ? 'buy' : 'sell',
        message: `⚡ Ordem disparada via Gerador de Sinais IA: ${signal.action} ${qty} ${cleanSym} @ $${formatPrice(currentPrice)} (Total: $${total.toFixed(2)} USDT)`,
      });

      setExecutedSuccess(true);
      setTimeout(() => setExecutedSuccess(false), 9000);

      toast({
        title: `🚀 Ordem de ${signal.action === 'BUY' ? 'Compra' : 'Venda'} Executada!`,
        description: `${qty} ${cleanSym} @ $${formatPrice(currentPrice)} — Total: $${total.toFixed(2)} USDT ${signal.takeProfit > 0 ? `(TP: $${formatPrice(signal.takeProfit)} | SL: $${formatPrice(signal.stopLoss)})` : ''}`,
      });
    } catch (err: any) {
      toast({
        title: "Erro na Execução da Ordem",
        description: err.message || "Não foi possível enviar a ordem.",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Gerador de Sinais IA</CardTitle>
          </div>
          {signal && (
            <Badge variant="outline" className={actionConfig?.badge}>
              <ActionIcon className="w-3 h-3 mr-1" />
              {actionConfig?.label}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Gerar sinal com IA para {selectedSymbol}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {isSyncing && timeRemaining !== null ? (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary">Sincronizando dados de mercado...</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                A IA precisa de dados históricos suficientes para analisar {selectedSymbol}.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-mono font-bold text-primary">
                Tempo restante estimado: {timeRemaining}s
              </span>
            </div>
          </div>
        ) : (!ticker || ticker.price === 0) ? (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-500">Dados insuficientes</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Aguardando cotação da Binance para {selectedSymbol}...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Generate Button */}
            <Button
              onClick={generateSignal}
              disabled={isGenerating}
              className="w-full gap-2 cursor-pointer font-bold"
              variant={signal ? 'outline' : 'default'}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar Sinal
                </>
              )}
            </Button>
          </>
        )}

        {/* Signal Result */}
        <AnimatePresence mode="wait">
          {signal && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {/* Alerta de Travamento Sistêmico (Risk Gatekeeper Circuit Breaker) */}
              {signal.vetoed && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-rose-300">
                      Operação vetada pela matriz de risco: Assimetria desfavorável
                    </p>
                    <p className="text-[11px] text-rose-200/80 mt-1">
                      O motor quantitativo detectou relação Risco/Retorno ({signal.risk_reward_ratio?.toFixed(2) ?? '0.00'}) inferior ao limiar mínimo de 2.0:1. A ação foi sobreposta autonomamente para <span className="font-bold underline">HOLD</span>.
                    </p>
                  </div>
                </div>
              )}

              {/* Indicador de Assimetria e Confiança (High Frequency HUD) */}
              <div
                className={`rounded-xl border p-4 space-y-3.5 ${actionConfig?.bg} ${actionConfig?.border}`}
              >
                {/* Header: Ação e Cotação */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl ${actionConfig?.bg} border ${actionConfig?.border} flex items-center justify-center`}
                    >
                      <ActionIcon className={`w-6 h-6 ${actionConfig?.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xl font-black tracking-tight ${actionConfig?.color}`}>
                          {actionConfig?.label}
                        </span>
                        {signal.vetoed && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-rose-500/20 text-rose-400 border-rose-500/40">
                            VETADO
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {selectedSymbol} • {ticker ? `$${formatPrice(ticker.price)}` : 'Sem dados'}
                      </p>
                    </div>
                  </div>

                  {/* Destaque Tipográfico Numérico: Risco/Retorno */}
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                      Relação R:R
                    </span>
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span className="text-2xl font-black font-mono tracking-tight text-foreground">
                        {signal.risk_reward_ratio ? signal.risk_reward_ratio.toFixed(2) : '1.50'}:1
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-bold px-1 py-0",
                        (signal.risk_reward_ratio ?? 0) >= 2.0
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      )}
                    >
                      {(signal.risk_reward_ratio ?? 0) >= 2.0 ? "≥ 2.0 (Aprovado)" : "< 2.0 (Vetado)"}
                    </Badge>
                  </div>
                </div>

                {/* Gauge de Confiança */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-crypto-cyan" />
                      Score de Convicção Estatística
                    </span>
                    <span className={`text-xs font-mono font-bold ${actionConfig?.color}`}>
                      {signal.confidence_score ?? Math.round(signal.confidence * 100)} / 100
                    </span>
                  </div>
                  <Progress
                    value={signal.confidence_score ?? signal.confidence * 100}
                    className="h-2 bg-secondary/80"
                  />
                </div>
              </div>

              {/* Telemetria do agente: ferramentas usadas e status de cada uma */}
              <AIBrainActivityWidget
                action={signal.action}
                vetoed={signal.vetoed}
                agent_error={signal.agent_error}
                error_reason={signal.error_reason}
                agent_telemetry={signal.agent_telemetry}
              />

              {/* Indicadores Visuais Rápidos (Pills / Badges - Sem Texto Livre) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded-lg border border-crypto-cyan/30 bg-crypto-cyan/10 p-2.5 flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 text-crypto-cyan shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold text-crypto-cyan uppercase tracking-wider block">
                      Gatilho Principal (Key Driver)
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate block">
                      {signal.key_driver || signal.reasoning}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider block">
                      Maior Ameaça (Risk Warning)
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate block">
                      {signal.risk_warning || "Volatilidade no book"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Métricas de Fluxo Institucional (Enriquecimento de Contexto) */}
              {signal.flow_context && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border/50 text-[10px] font-mono text-muted-foreground">
                  {signal.flow_context.vwap !== undefined && (
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-crypto-cyan" />
                      VWAP: ${formatPrice(signal.flow_context.vwap)} (
                      <span className={signal.flow_context.vwap_distance_percent && signal.flow_context.vwap_distance_percent >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {signal.flow_context.vwap_distance_percent && signal.flow_context.vwap_distance_percent >= 0 ? "+" : ""}
                        {signal.flow_context.vwap_distance_percent}%
                      </span>
                      )
                    </span>
                  )}
                  {signal.flow_context.order_flow_imbalance !== undefined && (
                    <span>
                      OFI: <strong className={signal.flow_context.order_flow_imbalance >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {signal.flow_context.order_flow_imbalance >= 0 ? "+" : ""}
                        {signal.flow_context.order_flow_imbalance}
                      </strong>
                    </span>
                  )}
                  {signal.flow_context.funding_rate_percent !== undefined && (
                    <span>
                      Funding: <strong className={signal.flow_context.funding_rate_percent >= 0 ? "text-amber-400" : "text-crypto-cyan"}>
                        {signal.flow_context.funding_rate_percent >= 0 ? "+" : ""}
                        {signal.flow_context.funding_rate_percent}%
                      </strong>
                    </span>
                  )}
                </div>
              )}

              {/* Stop Loss / Take Profit */}
              {(signal.stopLoss > 0 || signal.takeProfit > 0) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-[10px] text-rose-400 font-bold mb-1 flex items-center gap-1 uppercase tracking-wider">
                      🛑 Stop Loss
                    </p>
                    <p className="text-base font-black font-mono text-rose-400">
                      ${formatPrice(signal.stopLoss)}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formatSlTpPercent(ticker?.price ?? 0, signal.stopLoss)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-[10px] text-emerald-400 font-bold mb-1 flex items-center gap-1 uppercase tracking-wider">
                      ✅ Take Profit
                    </p>
                    <p className="text-base font-black font-mono text-emerald-400">
                      ${formatPrice(signal.takeProfit)}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formatSlTpPercent(ticker?.price ?? 0, signal.takeProfit)}
                    </p>
                  </div>
                </div>
              )}

              <Separator className="bg-border" />

              {/* Action Execution Panel */}
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-crypto-cyan" />
                    Executar Sugestão
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Saldo disponível: <strong className="text-emerald-400">${portfolio.cashBalance.toFixed(2)}</strong> USDT
                  </span>
                </div>

                {signal.action === 'BUY' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] text-muted-foreground">Valor em USDT:</span>
                      <div className="flex items-center gap-1">
                        {[25, 50, 100].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setExecAmount(preset)}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded border cursor-pointer transition-colors ${
                              execAmount === preset
                                ? 'bg-crypto-cyan/20 border-crypto-cyan text-crypto-cyan'
                                : 'border-border/60 hover:bg-secondary/60 text-muted-foreground'
                            }`}
                          >
                            ${preset}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setExecAmount(Math.max(10, Math.floor(portfolio.cashBalance)))}
                          className="px-2 py-0.5 text-[10px] font-bold rounded border border-border/60 hover:bg-secondary/60 text-muted-foreground cursor-pointer"
                        >
                          Máx
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        type="number"
                        min="5"
                        max={Math.max(10, portfolio.cashBalance)}
                        step="5"
                        value={execAmount}
                        onChange={(e) => setExecAmount(Math.max(1, parseFloat(e.target.value) || 0))}
                        className="h-8 pl-8 text-xs font-mono font-bold bg-background/50 border-border/70"
                      />
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      Quantidade calculada: <strong>{(execAmount / Math.max(0.000001, ticker?.price || 1)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</strong> {selectedSymbol.replace("USDT", "")}
                    </p>
                  </div>
                )}

                {signal.action === 'SELL' && (
                  <div className="text-xs text-muted-foreground">
                    Posição estimada em carteira: <strong className="text-foreground">{currentHoldingQty.toLocaleString(undefined, { maximumFractionDigits: 6 })}</strong> {selectedSymbol.replace("USDT", "")} (${(currentHoldingQty * (ticker?.price || 0)).toFixed(2)} USDT)
                  </div>
                )}

                {/* Primary Execution Button */}
                {signal.action === 'BUY' && (
                  <Button
                    type="button"
                    onClick={handleExecuteSignal}
                    disabled={isExecuting || !ticker || ticker.price <= 0 || execAmount <= 0}
                    className="w-full h-10 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Executando Compra...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-current" />
                        Executar Sugestão: Comprar ${execAmount} USDT
                      </>
                    )}
                  </Button>
                )}

                {signal.action === 'SELL' && (
                  <Button
                    type="button"
                    onClick={handleExecuteSignal}
                    disabled={isExecuting || !ticker || ticker.price <= 0}
                    className="w-full h-10 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-red-500/20 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Executando Venda...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-current" />
                        Executar Sugestão: Vender {selectedSymbol.replace("USDT", "")}
                      </>
                    )}
                  </Button>
                )}

                {signal.action === 'HOLD' && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                    <p className="text-xs text-amber-400 font-semibold">
                      ⏸️ A IA recomenda AGUARDAR neste momento (sem compra nem venda imediata).
                    </p>
                  </div>
                )}

                {executedSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Ordem executada com sucesso! Stop Loss e Take Profit programados.</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No signal state */}
        {!signal && !isGenerating && (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Clique em gerar para obter um sinal de trading com IA
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
