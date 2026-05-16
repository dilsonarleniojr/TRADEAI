"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Settings, Play, Loader2 } from "lucide-react";

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

export interface BacktestConfig {
  symbol: string;
  strategy: "RSI" | "MACD" | "AI";
  startDate: string;
  endDate: string;
  initialBalance: number;
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

interface BacktestConfigProps {
  config: BacktestConfig;
  setConfig: (config: BacktestConfig) => void;
  onRun: () => void;
  isRunning: boolean;
}

export function BacktestConfig({
  config,
  setConfig,
  onRun,
  isRunning,
}: BacktestConfigProps) {
  const updateConfig = (key: keyof BacktestConfig, value: string | number) => {
    setConfig({ ...config, [key]: value });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4 text-crypto-cyan" />
          Backtest Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Symbol */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Symbol</Label>
          <Select
            value={config.symbol}
            onValueChange={(val) => updateConfig("symbol", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
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

        {/* Strategy */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Strategy</Label>
          <Select
            value={config.strategy}
            onValueChange={(val) =>
              updateConfig("strategy", val as "RSI" | "MACD" | "AI")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RSI">RSI</SelectItem>
              <SelectItem value="MACD">MACD</SelectItem>
              <SelectItem value="AI">AI (Simulated)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Start Date</Label>
            <Input
              type="date"
              value={config.startDate}
              onChange={(e) => updateConfig("startDate", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">End Date</Label>
            <Input
              type="date"
              value={config.endDate}
              onChange={(e) => updateConfig("endDate", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Initial Balance */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Initial Balance</Label>
          <Input
            type="number"
            min={100}
            step={1000}
            value={config.initialBalance}
            onChange={(e) =>
              updateConfig(
                "initialBalance",
                Math.max(100, parseFloat(e.target.value) || 100)
              )
            }
            className="h-8 text-xs"
          />
        </div>

        {/* Strategy-specific parameters */}
        {config.strategy === "RSI" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <span className="text-[10px] text-crypto-cyan uppercase tracking-wider font-medium">
              RSI Parameters
            </span>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">RSI Period</Label>
              <Input
                type="number"
                min={2}
                max={100}
                value={config.rsiPeriod}
                onChange={(e) =>
                  updateConfig(
                    "rsiPeriod",
                    Math.max(2, parseInt(e.target.value) || 14)
                  )
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Buy Below</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={config.rsiBuyThreshold}
                  onChange={(e) =>
                    updateConfig("rsiBuyThreshold", parseFloat(e.target.value) || 30)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Sell Above</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={config.rsiSellThreshold}
                  onChange={(e) =>
                    updateConfig("rsiSellThreshold", parseFloat(e.target.value) || 70)
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {config.strategy === "MACD" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <span className="text-[10px] text-crypto-cyan uppercase tracking-wider font-medium">
              MACD Parameters
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Fast</Label>
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={config.macdFast}
                  onChange={(e) =>
                    updateConfig("macdFast", parseInt(e.target.value) || 12)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Slow</Label>
                <Input
                  type="number"
                  min={2}
                  max={100}
                  value={config.macdSlow}
                  onChange={(e) =>
                    updateConfig("macdSlow", parseInt(e.target.value) || 26)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Signal</Label>
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={config.macdSignal}
                  onChange={(e) =>
                    updateConfig("macdSignal", parseInt(e.target.value) || 9)
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {config.strategy === "AI" && (
          <div className="text-xs text-crypto-cyan bg-crypto-cyan/5 border border-crypto-cyan/20 rounded-md p-2.5 pt-2 border-t border-border mt-2">
            AI strategy uses simulated signals for backtesting. Real AI would analyze patterns, sentiment, and multiple indicators.
          </div>
        )}

        {/* Run Backtest Button */}
        <Button
          onClick={onRun}
          disabled={isRunning}
          className="w-full bg-crypto-cyan hover:bg-crypto-cyan/90 text-white font-semibold h-10"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Backtest
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
