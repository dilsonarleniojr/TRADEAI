'use client';

import { useState } from 'react';
import { useCryptoStore } from '@/lib/store';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SignalResult {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
}

const ACTION_CONFIG = {
  BUY: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    badge: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    label: 'Buy Signal',
  },
  SELL: {
    icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
    badge: 'bg-red-400/10 text-red-400 border-red-400/20',
    label: 'Sell Signal',
  },
  HOLD: {
    icon: Minus,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    badge: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    label: 'Hold Signal',
  },
};

export function SignalGenerator() {
  const { selectedSymbol, tickers, addAiSignal } = useCryptoStore();
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const ticker = tickers[selectedSymbol];

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
            : 'No reasoning provided.';

        const newSignal: SignalResult = { action, confidence, reasoning };
        setSignal(newSignal);

        // Also add to store signals
        addAiSignal({
          id: `sig-${Date.now()}`,
          symbol: selectedSymbol,
          action,
          confidence,
          reasoning,
          priceAtSignal: ticker?.price ?? 0,
          createdAt: new Date().toISOString(),
        });
      } else {
        setSignal({
          action: 'HOLD',
          confidence: 0.5,
          reasoning: 'Unable to generate analysis at this time.',
        });
      }
    } catch {
      setSignal({
        action: 'HOLD',
        confidence: 0.5,
        reasoning: 'Network error. Please try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const actionConfig = signal ? ACTION_CONFIG[signal.action] : null;
  const ActionIcon = actionConfig?.icon ?? Minus;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">AI Signal Generator</CardTitle>
          </div>
          {signal && (
            <Badge variant="outline" className={actionConfig?.badge}>
              <ActionIcon className="w-3 h-3 mr-1" />
              {actionConfig?.label}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Generate AI-powered signal for {selectedSymbol}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
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
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Signal
            </>
          )}
        </Button>

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
                        : 'No data'}
                    </p>
                  </div>
                </div>

                {/* Confidence Meter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">
                      Confidence
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

              <Separator className="bg-border" />

              {/* Reasoning */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Reasoning
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
              Click generate to get an AI trading signal
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
