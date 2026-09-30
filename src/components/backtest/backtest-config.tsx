"use client";

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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Play, Loader2, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";

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

export type StrategyKey = "RSI" | "MACD" | "AI";

export interface BacktestConfig {
  symbol: string;
  strategy: StrategyKey;
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
  compareMode: boolean;
  setCompareMode: (val: boolean) => void;
  selectedStrategies: StrategyKey[];
  setSelectedStrategies: (val: StrategyKey[]) => void;
}

const STRATEGY_CHECKBOX_CONFIG: { key: StrategyKey; label: string; color: string }[] = [
  { key: "RSI", label: "RSI", color: "#facc15" },
  { key: "MACD", label: "MACD", color: "#a855f7" },
  { key: "AI", label: "AI (Simulated)", color: "#22d3ee" },
];

export function BacktestConfig({
  config,
  setConfig,
  onRun,
  isRunning,
  compareMode,
  setCompareMode,
  selectedStrategies,
  setSelectedStrategies,
}: BacktestConfigProps) {
  const updateConfig = (key: keyof BacktestConfig, value: string | number) => {
    setConfig({ ...config, [key]: value });
  };

  const toggleStrategy = (key: StrategyKey) => {
    if (selectedStrategies.includes(key)) {
      if (selectedStrategies.length > 1) {
        setSelectedStrategies(selectedStrategies.filter((s) => s !== key));
      }
    } else {
      if (selectedStrategies.length < 3) {
        setSelectedStrategies([...selectedStrategies, key]);
      }
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4 text-crypto-cyan" />
          Configuração do Backtest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Compare Mode Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-crypto-gold" />
            <div>
              <Label className="text-xs font-medium cursor-pointer">Modo Comparação</Label>
              <p className="text-[10px] text-muted-foreground">Execute múltiplas estratégias lado a lado</p>
            </div>
          </div>
          <Switch
            checked={compareMode}
            onCheckedChange={setCompareMode}
            className="focus-visible:ring-2 focus-visible:ring-crypto-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>

        {/* Strategy Selection for Compare Mode */}
        {compareMode && (
          <div className="space-y-2 p-3 rounded-lg border border-crypto-gold/20 bg-crypto-gold/5">
            <Label className="text-[10px] text-crypto-gold uppercase tracking-wider font-medium">
              Selecionar Estratégias (2-3)
            </Label>
            <div className="space-y-2">
              {STRATEGY_CHECKBOX_CONFIG.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => toggleStrategy(s.key)}
                >
                  <Checkbox
                    checked={selectedStrategies.includes(s.key)}
                    onCheckedChange={() => toggleStrategy(s.key)}
                    className="focus-visible:ring-2 focus-visible:ring-crypto-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    style={{
                      borderColor: selectedStrategies.includes(s.key) ? s.color : undefined,
                    }}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium transition-colors",
                      selectedStrategies.includes(s.key) ? "" : "text-muted-foreground"
                    )}
                    style={{
                      color: selectedStrategies.includes(s.key) ? s.color : undefined,
                    }}
                  >
                    {s.label}
                  </span>
                  {selectedStrategies.includes(s.key) && (
                    <div
                      className="w-2 h-2 rounded-full ml-auto"
                      style={{ backgroundColor: s.color }}
                    />
                  )}
                </div>
              ))}
            </div>
            {selectedStrategies.length < 2 && (
              <p className="text-[10px] text-crypto-gold/70">
                Selecione pelo menos 2 estratégias para comparar
              </p>
            )}
          </div>
        )}

        {/* Symbol */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Símbolo</Label>
          <Select
            value={config.symbol}
            onValueChange={(val) => updateConfig("symbol", val)}
          >
            <SelectTrigger className="w-full focus-visible:ring-2 focus-visible:ring-crypto-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
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

        {/* Strategy (only shown when not in compare mode) */}
        {!compareMode && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Estratégia</Label>
            <Select
              value={config.strategy}
              onValueChange={(val) =>
                updateConfig("strategy", val as StrategyKey)
              }
            >
              <SelectTrigger className="w-full focus-visible:ring-2 focus-visible:ring-crypto-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RSI">RSI</SelectItem>
                <SelectItem value="MACD">MACD</SelectItem>
                <SelectItem value="AI">AI (Simulated)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Data Início</Label>
            <Input
              type="date"
              value={config.startDate}
              onChange={(e) => updateConfig("startDate", e.target.value)}
              className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Data Fim</Label>
            <Input
              type="date"
              value={config.endDate}
              onChange={(e) => updateConfig("endDate", e.target.value)}
              className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
            />
          </div>
        </div>

        {/* Initial Balance */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Capital Inicial</Label>
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
            className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
          />
        </div>

        {/* Strategy-specific parameters (only when NOT in compare mode) */}
        {!compareMode && config.strategy === "RSI" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <span className="text-[10px] text-crypto-cyan uppercase tracking-wider font-medium">
              Parâmetros RSI
            </span>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Período RSI</Label>
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
                className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Comprar Abaixo</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={config.rsiBuyThreshold}
                  onChange={(e) =>
                    updateConfig("rsiBuyThreshold", parseFloat(e.target.value) || 30)
                  }
                  className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Vender Acima</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={config.rsiSellThreshold}
                  onChange={(e) =>
                    updateConfig("rsiSellThreshold", parseFloat(e.target.value) || 70)
                  }
                  className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
                />
              </div>
            </div>
          </div>
        )}

        {!compareMode && config.strategy === "MACD" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <span className="text-[10px] text-crypto-cyan uppercase tracking-wider font-medium">
              Parâmetros MACD
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Rápido</Label>
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={config.macdFast}
                  onChange={(e) =>
                    updateConfig("macdFast", parseInt(e.target.value) || 12)
                  }
                  className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Lento</Label>
                <Input
                  type="number"
                  min={2}
                  max={100}
                  value={config.macdSlow}
                  onChange={(e) =>
                    updateConfig("macdSlow", parseInt(e.target.value) || 26)
                  }
                  className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Sinal</Label>
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={config.macdSignal}
                  onChange={(e) =>
                    updateConfig("macdSignal", parseInt(e.target.value) || 9)
                  }
                  className="h-8 text-xs input-glow focus-visible:border-crypto-cyan/50 focus-visible:ring-2 focus-visible:ring-crypto-cyan/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
                />
              </div>
            </div>
          </div>
        )}

        {!compareMode && config.strategy === "AI" && (
          <div className="text-xs text-crypto-cyan bg-crypto-cyan/5 border border-crypto-cyan/20 rounded-md p-2.5 pt-2 border-t border-border mt-2">
            A estratégia de IA usa sinais simulados para backtesting. Uma IA real analisaria padrões, sentimento e múltiplos indicadores.
          </div>
        )}

        {/* Compare mode note */}
        {compareMode && (
          <div className="text-xs text-crypto-gold bg-crypto-gold/5 border border-crypto-gold/20 rounded-md p-2.5">
            Todas as estratégias usarão o mesmo símbolo, intervalo de datas e capital inicial. Parâmetros padrão são usados para cada estratégia.
          </div>
        )}

        {/* Run Backtest Button */}
        <Button
          onClick={onRun}
          disabled={isRunning || (compareMode && selectedStrategies.length < 2)}
          className="w-full bg-crypto-cyan hover:bg-crypto-cyan/90 text-white font-semibold h-10 focus-visible:ring-2 focus-visible:ring-crypto-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200 active:scale-[0.98]"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {compareMode ? "Comparando Estratégias..." : "Executando Backtest..."}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {compareMode ? "Comparar Estratégias" : "Executar Backtest"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
