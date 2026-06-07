"use client";

import { useEffect, useState, useMemo } from "react";
import { useCryptoStore, type PriceAlert } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Activity,
  Droplets,
  TrendingUp,
} from "lucide-react";
import { ALL_SYMBOLS } from "@/lib/crypto-meta";

export function PriceAlerts() {
  const { tickers, alerts, addAlert, removeAlert, updateAlertPrices } =
    useCryptoStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState("BTCUSDT");
  
  // Alert types: 'price', 'volatility', 'liquidity', 'sr_breakout'
  const [alertType, setAlertType] = useState<"price" | "volatility" | "liquidity" | "sr_breakout">("price");
  
  // Custom inputs based on alert type
  const [newTargetPrice, setNewTargetPrice] = useState("");
  const [newDirection, setNewDirection] = useState<"above" | "below">("above");
  const [newThreshold, setNewThreshold] = useState("");
  const [newSrLevel, setNewSrLevel] = useState<"support" | "resistance">("resistance");

  // Update alert prices when tickers change
  useEffect(() => {
    if (Object.keys(tickers).length > 0) {
      updateAlertPrices(tickers);
    }
  }, [tickers, updateAlertPrices]);

  const handleCreateAlert = () => {
    const currentPrice = tickers[newSymbol]?.price ?? 0;
    let targetVal = 0;
    let directionVal: "above" | "below" = newDirection;
    let thresholdVal = 0;

    if (alertType === "price") {
      targetVal = parseFloat(newTargetPrice);
      if (isNaN(targetVal) || targetVal <= 0) return;
    } else if (alertType === "volatility") {
      thresholdVal = parseFloat(newThreshold);
      if (isNaN(thresholdVal) || thresholdVal <= 0) return;
    } else if (alertType === "liquidity") {
      thresholdVal = parseFloat(newThreshold);
      if (isNaN(thresholdVal) || thresholdVal <= 0) return;
    }

    const alert: PriceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: newSymbol,
      targetPrice: alertType === "price" ? targetVal : undefined,
      direction: alertType === "price" ? directionVal : undefined,
      currentPrice,
      isTriggered: false,
      createdAt: new Date().toISOString(),
      type: alertType,
      threshold: (alertType === "volatility" || alertType === "liquidity") ? thresholdVal : undefined,
      srLevel: alertType === "sr_breakout" ? newSrLevel : undefined,
      message: "",
    };

    addAlert(alert);
    setNewTargetPrice("");
    setNewThreshold("");
    setDialogOpen(false);
  };

  const triggeredCount = alerts.filter((a) => a.isTriggered).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4 }}
    >
      <Card className="glass-card gradient-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-crypto-gold" />
            Alertas Inteligentes
            {triggeredCount > 0 && (
              <Badge className="bg-crypto-gold/20 text-crypto-gold border-crypto-gold/30 text-[9px] px-1.5 py-0">
                {triggeredCount} ativados
              </Badge>
            )}
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] font-bold gap-1 border-crypto-gold/30 text-crypto-gold hover:bg-crypto-gold/15 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Criar Alerta
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-background border-border sm:max-w-md glass">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-crypto-gold" />
                  Criar Alerta
                </DialogTitle>
                <DialogDescription>
                  Monitore condições de mercado e receba diagnósticos automáticos do seu assistente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2 text-xs">
                {/* Select Symbol */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Símbolo</label>
                  <Select value={newSymbol} onValueChange={(val) => {
                    setNewSymbol(val);
                    const ticker = tickers[val];
                    if (ticker) {
                      setNewTargetPrice(ticker.price.toFixed(2));
                    }
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecionar símbolo" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px] overflow-y-auto">
                      {ALL_SYMBOLS.map((sym) => (
                        <SelectItem key={sym} value={sym}>
                          {sym.replace("USDT", "")}/USDT
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Select Alert Type */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Tipo de Alerta</label>
                  <Select value={alertType} onValueChange={(val) => setAlertType(val as any)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price">💸 Preço Alvo</SelectItem>
                      <SelectItem value="volatility">⚡ Volatilidade Extrema</SelectItem>
                      <SelectItem value="liquidity">💧 Queda de Liquidez</SelectItem>
                      <SelectItem value="sr_breakout">🚪 Rompimento de Suporte/Resistência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Conditional fields based on type */}
                {alertType === "price" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">Direção</label>
                      <Select value={newDirection} onValueChange={(val) => setNewDirection(val as any)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="above">Acima de</SelectItem>
                          <SelectItem value="below">Abaixo de</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">Preço Alvo (USD)</label>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={newTargetPrice}
                        onChange={(e) => setNewTargetPrice(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                {alertType === "volatility" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Variação Mínima em 24h (%)</label>
                    <Input
                      type="number"
                      placeholder="Ex: 5"
                      value={newThreshold}
                      onChange={(e) => setNewThreshold(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Dispara se a variação absoluta do preço nas últimas 24h atingir esta porcentagem.
                    </p>
                  </div>
                )}

                {alertType === "liquidity" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Volume Mínimo em 24h (Qtd)</label>
                    <Input
                      type="number"
                      placeholder="Ex: 50000"
                      value={newThreshold}
                      onChange={(e) => setNewThreshold(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Dispara se o volume negociado em 24h cair abaixo deste valor absoluto.
                    </p>
                  </div>
                )}

                {alertType === "sr_breakout" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Nível de Rompimento</label>
                    <Select value={newSrLevel} onValueChange={(val) => setNewSrLevel(val as any)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resistance">🚪 Resistência (Rompe Máxima 24h)</SelectItem>
                        <SelectItem value="support">🛡️ Suporte (Rompe Mínima 24h)</SelectItem>
                      </SelectContent>
                    </Select>
                    {tickers[newSymbol] && (
                      <div className="grid grid-cols-2 gap-2 mt-2 p-2 bg-secondary/20 rounded-md text-[10px] font-mono text-muted-foreground">
                        <p>Máxima 24h: ${formatPrice(tickers[newSymbol].high)}</p>
                        <p>Mínima 24h: ${formatPrice(tickers[newSymbol].low)}</p>
                      </div>
                    )}
                  </div>
                )}

                {tickers[newSymbol] && alertType !== "sr_breakout" && (
                  <p className="text-[10px] text-muted-foreground">
                    Preço atual de {newSymbol.replace("USDT", "")}: <span className="font-mono text-foreground">${formatPrice(tickers[newSymbol].price)}</span>
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="cursor-pointer">
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateAlert}
                  className="bg-crypto-gold text-black hover:bg-crypto-gold/80 font-bold cursor-pointer"
                >
                  Criar Alerta
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="empty-state py-6">
              <div className="empty-state-icon bg-crypto-gold/10">
                <Bell className="w-6 h-6 text-crypto-gold/60 animate-swing" />
              </div>
              <p className="empty-state-title mt-2">Nenhum alerta ativo</p>
              <p className="empty-state-desc max-w-xs text-center">
                Configure alertas de preço, volatilidade ou liquidez para se antecipar aos movimentos de mercado.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1 cyan-scrollbar">
              <AnimatePresence>
                {alerts.map((alert) => {
                  const type = alert.type || "price";
                  const isTriggered = alert.isTriggered;
                  const cleanSym = alert.symbol.replace("USDT", "");
                  
                  // Pick icon based on type
                  let Icon = Bell;
                  let colorClass = "text-crypto-gold";
                  let bgClass = "bg-crypto-gold/10";
                  
                  if (type === "volatility") {
                    Icon = Activity;
                    colorClass = "text-crypto-cyan";
                    bgClass = "bg-crypto-cyan/10";
                  } else if (type === "liquidity") {
                    Icon = Droplets;
                    colorClass = "text-blue-400";
                    bgClass = "bg-blue-400/10";
                  } else if (type === "sr_breakout") {
                    Icon = TrendingUp;
                    colorClass = "text-purple-400";
                    bgClass = "bg-purple-400/10";
                  } else if (type === "price") {
                    Icon = alert.direction === "above" ? ArrowUp : ArrowDown;
                    colorClass = alert.direction === "above" ? "text-crypto-green" : "text-crypto-red";
                    bgClass = alert.direction === "above" ? "bg-crypto-green/10" : "bg-crypto-red/10";
                  }

                  return (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        "flex flex-col p-3 rounded-lg border transition-all duration-150 hover:shadow-sm",
                        isTriggered
                          ? "bg-crypto-gold/15 border-crypto-gold/45"
                          : "bg-secondary/20 border-border/40"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn("p-1.5 rounded-md shrink-0", isTriggered ? "bg-crypto-gold/25" : bgClass)}>
                            {isTriggered ? (
                              <BellRing className="w-3.5 h-3.5 text-crypto-gold animate-ring" />
                            ) : (
                              <Icon className={cn("w-3.5 h-3.5", colorClass)} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground font-mono">{cleanSym}</span>
                              <Badge variant="outline" className={cn(
                                "text-[8px] uppercase font-semibold border-none px-1.5",
                                isTriggered ? "bg-crypto-gold/20 text-crypto-gold" : "bg-secondary/80 text-muted-foreground"
                              )}>
                                {isTriggered ? "DISPARADO" : type === "sr_breakout" ? "S/R Breakout" : type}
                              </Badge>
                            </div>
                            
                            {/* Alert settings detail */}
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {type === "price" && (
                                <span>{alert.direction === "above" ? "Cruzar acima de" : "Cruzar abaixo de"} <span className="font-mono font-semibold text-foreground">${formatPrice(alert.targetPrice || 0)}</span></span>
                              )}
                              {type === "volatility" && (
                                <span>Volatilidade &gt;= <span className="font-mono font-semibold text-foreground">{alert.threshold}%</span></span>
                              )}
                              {type === "liquidity" && (
                                <span>Volume &lt;= <span className="font-mono font-semibold text-foreground">{(alert.threshold || 0).toLocaleString()}</span></span>
                              )}
                              {type === "sr_breakout" && (
                                <span>Romper {alert.srLevel === "resistance" ? "Resistência (Máxima)" : "Suporte (Mínima)"}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-crypto-red hover:bg-crypto-red/10 rounded"
                          onClick={() => removeAlert(alert.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Display trigger message details */}
                      {isTriggered && alert.message && (
                        <div className="mt-2 text-[10px] font-medium text-crypto-gold bg-crypto-gold/5 p-2 rounded border border-crypto-gold/15">
                          {alert.message}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
