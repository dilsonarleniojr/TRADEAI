'use client';

import { useState, useEffect } from 'react';
import { useCryptoStore } from '@/lib/store';
import { formatPrice } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Zap,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SignalResult {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  stopLoss: number;
  takeProfit: number;
}

const ACTION_CONFIG = {
  BUY: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    badge: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    label: 'Sinal de Compra',
  },
  SELL: {
    icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
    badge: 'bg-red-400/10 text-red-400 border-red-400/20',
    label: 'Sinal de Venda',
  },
  HOLD: {
    icon: Minus,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    badge: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    label: 'Sinal de Espera',
  },
};

const PRIORITY_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
  "DOTUSDT", "LINKUSDT", "MATICUSDT", "ATOMUSDT",
];

const TOP_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AVAXUSDT", "ADAUSDT",
  "DOTUSDT", "ATOMUSDT", "NEARUSDT", "ALGOUSDT", "SUIUSDT", "APTUSDT",
  "SEIUSDT", "TIAUSDT", "INJUSDT",
  "MATICUSDT", "ARBUSDT", "OPUSDT", "MANTAUSDT", "STRKUSDT",
  "LINKUSDT", "UNIUSDT", "AAVEUSDT", "MKRUSDT", "COMPUSDT",
  "CRVUSDT", "SNXUSDT", "LDOUSDT", "DYDXUSDT", "PENDLEUSDT",
  "DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "FLOKIUSDT", "BONKUSDT", "WIFUSDT",
  "FETUSDT", "RENDERUSDT", "AKTUSDT", "TAOUSDT",
  "IMXUSDT", "GALAUSDT", "RONINUSDT", "AXSUSDT",
  "FILUSDT", "ARUSDT", "ETHFIUSDT",
  "XRPUSDT", "LTCUSDT", "TRXUSDT", "XLMUSDT",
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
  const { selectedSymbol, tickers, addAiSignal } = useCryptoStore();
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

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
          volume: ticker?.quoteVolume ?? 0,
          high24h: ticker?.high ?? 0,
          low24h: ticker?.low ?? 0,
        }),
      });

      const data = await res.json();

      if (data.success && data.signal) {
        const action = (['BUY', 'SELL', 'HOLD'].includes(data.signal.action)
          ? data.signal.action
          : 'HOLD') as SignalResult['action'];
        const confidence =
          typeof data.signal.confidence === 'number'
            ? Math.min(1, Math.max(0, data.signal.confidence))
            : 0.5;
        const reasoning =
          typeof data.signal.reasoning === 'string'
            ? data.signal.reasoning
            : 'Nenhuma justificativa fornecida.';

        const stopLoss =
          typeof data.signal.stopLoss === 'number' && data.signal.stopLoss > 0
            ? data.signal.stopLoss
            : ticker?.price ?? 0;
        const takeProfit =
          typeof data.signal.takeProfit === 'number' && data.signal.takeProfit > 0
            ? data.signal.takeProfit
            : ticker?.price ?? 0;

        const newSignal: SignalResult = { action, confidence, reasoning, stopLoss, takeProfit };
        setSignal(newSignal);

        // Also add to store signals
        addAiSignal({
          id: `sig-${Date.now()}`,
          symbol: selectedSymbol,
          action,
          confidence,
          reasoning,
          priceAtSignal: ticker?.price ?? 0,
          stopLoss,
          takeProfit,
          createdAt: new Date().toISOString(),
        });
      } else {
        setSignal({
          action: 'HOLD',
          confidence: 0.5,
          reasoning: 'Não foi possível gerar análise no momento.',
          stopLoss: ticker?.price ?? 0,
          takeProfit: ticker?.price ?? 0,
        });
      }
    } catch {
      setSignal({
        action: 'HOLD',
        confidence: 0.5,
        reasoning: 'Erro de rede. Por favor, tente novamente.',
        stopLoss: ticker?.price ?? 0,
        takeProfit: ticker?.price ?? 0,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const actionConfig = signal ? ACTION_CONFIG[signal.action] : null;
  const ActionIcon = actionConfig?.icon ?? Minus;

  const formatSlTpPercent = (entryPrice: number, targetPrice: number) => {
    if (!entryPrice || entryPrice === 0) return '0%';
    const pct = ((targetPrice - entryPrice) / entryPrice) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
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
              className="w-full gap-2"
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
              {/* Action & Confidence */}
              <div
                className={`rounded-xl border p-4 ${actionConfig?.bg} ${actionConfig?.border}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${actionConfig?.bg} flex items-center justify-center`}
                  >
                    <ActionIcon className={`w-5 h-5 ${actionConfig?.color}`} />
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${actionConfig?.color}`}>
                      {signal.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSymbol} •{' '}
                      {ticker
                        ? `$${ticker.price.toLocaleString()}`
                        : 'Sem dados'}
                    </p>
                  </div>
                </div>

                {/* Confidence Meter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">
                      Confiança
                    </span>
                    <span
                      className={`text-xs font-semibold ${actionConfig?.color}`}
                    >
                      {Math.round(signal.confidence * 100)}%
                    </span>
                  </div>
                  <Progress
                    value={signal.confidence * 100}
                    className="h-2"
                  />
                </div>
              </div>

              {/* Stop Loss / Take Profit */}
              {(signal.stopLoss > 0 || signal.takeProfit > 0) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3">
                    <p className="text-[10px] text-red-400 font-medium mb-1 flex items-center gap-1">
                      🛑 Stop Loss
                    </p>
                    <p className="text-sm font-bold text-red-400">
                      ${formatPrice(signal.stopLoss)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatSlTpPercent(ticker?.price ?? 0, signal.stopLoss)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
                    <p className="text-[10px] text-emerald-400 font-medium mb-1 flex items-center gap-1">
                      ✅ Take Profit
                    </p>
                    <p className="text-sm font-bold text-emerald-400">
                      ${formatPrice(signal.takeProfit)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatSlTpPercent(ticker?.price ?? 0, signal.takeProfit)}
                    </p>
                  </div>
                </div>
              )}

              <Separator className="bg-border" />

              {/* Reasoning */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Justificativa
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {signal.reasoning}
                </p>
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
