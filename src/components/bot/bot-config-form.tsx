"use client";

import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings, AlertTriangle, Brain, TrendingUp, BarChart3 } from "lucide-react";

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "DOTUSDT",
  "LINKUSDT",
  "MATICUSDT",
  "ATOMUSDT",
];

const STRATEGY_ICONS: Record<string, React.ElementType> = {
  RSI: TrendingUp,
  MACD: BarChart3,
  AI: Brain,
};

export function BotConfigForm() {
  const { botConfig, setBotConfig, tradingMode, botActive } = useCryptoStore();

  const updateConfig = (key: string, value: number | string) => {
    setBotConfig({ ...botConfig, [key]: value });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4 text-crypto-cyan" />
          Bot Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy Select */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Strategy</Label>
          <RadioGroup
            value={botConfig.strategy}
            onValueChange={(val) => {
              const strategy = val as "RSI" | "MACD" | "AI";
              const updates: Partial<typeof botConfig> = { strategy };
              if (strategy === "RSI") {
                updates.buyThreshold = 30;
                updates.sellThreshold = 70;
              } else if (strategy === "MACD") {
                updates.buyThreshold = 0;
                updates.sellThreshold = 0;
              }
              setBotConfig({ ...botConfig, ...updates });
            }}
            className="flex gap-2"
            disabled={botActive}
          >
            {(["RSI", "MACD", "AI"] as const).map((s) => {
              const Icon = STRATEGY_ICONS[s];
              return (
                <Label
                  key={s}
                  htmlFor={`strategy-${s}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                    botConfig.strategy === s
                      ? "border-crypto-cyan bg-crypto-cyan/10 text-crypto-cyan"
                      : "border-border bg-secondary/30 text-muted-foreground hover:border-muted-foreground/30"
                  } ${botActive ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <RadioGroupItem
                    value={s}
                    id={`strategy-${s}`}
                    className="sr-only"
                  />
                  <Icon className="w-3.5 h-3.5" />
                  {s}
                </Label>
              );
            })}
          </RadioGroup>
        </div>

        {/* Strategy-specific info */}
        {botConfig.strategy === "AI" && (
          <div className="text-xs text-crypto-cyan bg-crypto-cyan/5 border border-crypto-cyan/20 rounded-md p-2.5">
            AI strategy will analyze market conditions using advanced pattern recognition and sentiment analysis.
          </div>
        )}
        {botConfig.strategy === "RSI" && (
          <div className="text-xs text-muted-foreground bg-secondary/30 rounded-md p-2.5">
            RSI strategy buys when RSI drops below {botConfig.buyThreshold} and sells when RSI rises above {botConfig.sellThreshold}.
          </div>
        )}
        {botConfig.strategy === "MACD" && (
          <div className="text-xs text-muted-foreground bg-secondary/30 rounded-md p-2.5">
            MACD strategy buys on bullish crossover and sells on bearish crossover of the signal line.
          </div>
        )}

        {/* Symbol Select */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Trading Symbol</Label>
          <Select
            value={botConfig.symbol}
            onValueChange={(val) => updateConfig("symbol", val)}
            disabled={botActive}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select symbol" />
            </SelectTrigger>
            <SelectContent>
              {SYMBOLS.map((sym) => (
                <SelectItem key={sym} value={sym}>
                  {sym.replace("USDT", "/USDT")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stop Loss */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Stop Loss</Label>
            <span className="text-xs font-medium text-crypto-red">
              {botConfig.stopLoss}%
            </span>
          </div>
          <Slider
            value={[botConfig.stopLoss]}
            onValueChange={([val]) => updateConfig("stopLoss", val)}
            min={0.5}
            max={10}
            step={0.5}
            disabled={botActive}
            className="[&_[data-slot=slider-range]]:bg-crypto-red"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.5%</span>
            <span>10%</span>
          </div>
        </div>

        {/* Take Profit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Take Profit</Label>
            <span className="text-xs font-medium text-crypto-green">
              {botConfig.takeProfit}%
            </span>
          </div>
          <Slider
            value={[botConfig.takeProfit]}
            onValueChange={([val]) => updateConfig("takeProfit", val)}
            min={1}
            max={20}
            step={0.5}
            disabled={botActive}
            className="[&_[data-slot=slider-range]]:bg-crypto-green"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1%</span>
            <span>20%</span>
          </div>
        </div>

        {/* Max Daily Trades */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Max Daily Trades</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={botConfig.maxDailyTrades}
            onChange={(e) =>
              updateConfig("maxDailyTrades", Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))
            }
            disabled={botActive}
            className="h-8 text-xs"
          />
        </div>

        {/* Buy Threshold */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {botConfig.strategy === "RSI"
              ? "Buy Threshold (RSI below)"
              : botConfig.strategy === "MACD"
                ? "Buy Signal (Crossover)"
                : "Buy Threshold"}
          </Label>
          <Input
            type="number"
            value={botConfig.buyThreshold}
            onChange={(e) =>
              updateConfig("buyThreshold", parseFloat(e.target.value) || 0)
            }
            disabled={botActive || botConfig.strategy === "MACD"}
            className="h-8 text-xs"
            placeholder={
              botConfig.strategy === "RSI"
                ? "Below 30"
                : botConfig.strategy === "MACD"
                  ? "Signal crossover"
                  : "Threshold"
            }
          />
        </div>

        {/* Sell Threshold */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {botConfig.strategy === "RSI"
              ? "Sell Threshold (RSI above)"
              : botConfig.strategy === "MACD"
                ? "Sell Signal (Crossover)"
                : "Sell Threshold"}
          </Label>
          <Input
            type="number"
            value={botConfig.sellThreshold}
            onChange={(e) =>
              updateConfig("sellThreshold", parseFloat(e.target.value) || 0)
            }
            disabled={botActive || botConfig.strategy === "MACD"}
            className="h-8 text-xs"
            placeholder={
              botConfig.strategy === "RSI"
                ? "Above 70"
                : botConfig.strategy === "MACD"
                  ? "Signal crossover"
                  : "Threshold"
            }
          />
        </div>

        {/* Initial Balance */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Initial Balance (Paper)</Label>
          <Input
            type="number"
            min={100}
            step={1000}
            value={botConfig.initialBalance}
            onChange={(e) =>
              updateConfig("initialBalance", Math.max(100, parseFloat(e.target.value) || 100))
            }
            disabled={botActive}
            className="h-8 text-xs"
          />
        </div>

        {/* Live Trading API Keys */}
        {tradingMode === "live" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <Alert className="border-crypto-red/30 bg-crypto-red/5">
              <AlertTriangle className="w-4 h-4 text-crypto-red" />
              <AlertTitle className="text-crypto-red text-xs font-medium">
                Live Trading Risk Warning
              </AlertTitle>
              <AlertDescription className="text-xs text-crypto-red/80">
                Live trading uses real funds. Ensure your API keys have correct permissions and never share them.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <Input
                type="password"
                placeholder="Enter your API key"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">API Secret</Label>
              <Input
                type="password"
                placeholder="Enter your API secret"
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
