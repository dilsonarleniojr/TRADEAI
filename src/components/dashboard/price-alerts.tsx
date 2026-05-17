"use client";

import { useEffect, useState } from "react";
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
import { Bell, BellRing, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

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

export function PriceAlerts() {
  const { tickers, alerts, addAlert, removeAlert, updateAlertPrices } =
    useCryptoStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState("BTCUSDT");
  const [newTargetPrice, setNewTargetPrice] = useState("");
  const [newDirection, setNewDirection] = useState<"above" | "below">("above");

  // Update alert prices when tickers change
  useEffect(() => {
    if (Object.keys(tickers).length > 0) {
      updateAlertPrices(tickers);
    }
  }, [tickers, updateAlertPrices]);

  const handleCreateAlert = () => {
    const price = parseFloat(newTargetPrice);
    if (isNaN(price) || price <= 0) return;

    const currentPrice = tickers[newSymbol]?.price ?? 0;

    const alert: PriceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: newSymbol,
      targetPrice: price,
      direction: newDirection,
      currentPrice,
      isTriggered:
        newDirection === "above"
          ? currentPrice >= price
          : currentPrice <= price,
      createdAt: new Date().toISOString(),
    };

    addAlert(alert);
    setNewTargetPrice("");
    setDialogOpen(false);
  };

  const triggeredCount = alerts.filter((a) => a.isTriggered).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4 }}
    >
      <Card className="bg-card/60 backdrop-blur-md gradient-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-crypto-gold" />
              Alertas de Preço
              {triggeredCount > 0 && (
                <Badge className="bg-crypto-gold/20 text-crypto-gold border-crypto-gold/30 text-[10px] px-1.5">
                  {triggeredCount} ativados
                </Badge>
              )}
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 border-crypto-gold/30 text-crypto-gold hover:bg-crypto-gold/10"
                >
                  <Plus className="w-3 h-3" />
                  Criar Alerta
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-background border-border sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <BellRing className="w-5 h-5 text-crypto-gold" />
                    Criar Alerta de Preço
                  </DialogTitle>
                  <DialogDescription>
                    Seja notificado quando o preço ultrapassar seu limite definido.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Símbolo
                    </label>
                    <Select
                      value={newSymbol}
                      onValueChange={(val) => {
                        setNewSymbol(val);
                        const ticker = tickers[val];
                        if (ticker) {
                          setNewTargetPrice(
                            ticker.price >= 100
                              ? ticker.price.toFixed(2)
                              : ticker.price.toFixed(4)
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecionar símbolo" />
                      </SelectTrigger>
                      <SelectContent>
                        {SYMBOLS.map((sym) => (
                          <SelectItem key={sym} value={sym}>
                            {sym.replace("USDT", "")}/USDT
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Direção
                    </label>
                    <Select
                      value={newDirection}
                      onValueChange={(val) =>
                        setNewDirection(val as "above" | "below")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="above">
                          <div className="flex items-center gap-2">
                            <ArrowUp className="w-3.5 h-3.5 text-crypto-green" />
                            Acima
                          </div>
                        </SelectItem>
                        <SelectItem value="below">
                          <div className="flex items-center gap-2">
                            <ArrowDown className="w-3.5 h-3.5 text-crypto-red" />
                            Abaixo
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Preço Alvo (USD)
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={newTargetPrice}
                      onChange={(e) => setNewTargetPrice(e.target.value)}
                      className="font-mono"
                    />
                    {tickers[newSymbol] && (
                      <p className="text-[10px] text-muted-foreground">
                        Preço atual: $
                        {formatPrice(tickers[newSymbol].price)}
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateAlert}
                    disabled={!newTargetPrice || parseFloat(newTargetPrice) <= 0}
                    className="bg-crypto-gold text-black hover:bg-crypto-gold/80"
                  >
                    Criar Alerta
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon bg-crypto-gold/10">
                <Bell className="w-6 h-6 text-crypto-gold/60" />
              </div>
              <p className="empty-state-title">Nenhum alerta configurado</p>
              <p className="empty-state-desc">
                Clique em &quot;Criar Alerta&quot; para configurar notificações de preço para seus ativos favoritos
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              <AnimatePresence>
                {alerts.map((alert) => {
                  const isAbove = alert.direction === "above";
                  const priceDiff = alert.targetPrice - alert.currentPrice;
                  const progressPercent =
                    alert.currentPrice > 0
                      ? Math.min(
                          100,
                          Math.max(
                            0,
                            isAbove
                              ? (alert.currentPrice / alert.targetPrice) * 100
                              : (alert.targetPrice / alert.currentPrice) * 100
                          )
                        )
                      : 0;

                  return (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-lg border transition-colors",
                        alert.isTriggered
                          ? "bg-crypto-gold/10 border-crypto-gold/30"
                          : "bg-secondary/30 border-border/50"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={cn(
                            "p-1.5 rounded-md shrink-0",
                            alert.isTriggered
                              ? "bg-crypto-gold/20"
                              : isAbove
                                ? "bg-crypto-green/10"
                                : "bg-crypto-red/10"
                          )}
                        >
                          {alert.isTriggered ? (
                            <BellRing className="w-3.5 h-3.5 text-crypto-gold" />
                          ) : isAbove ? (
                            <ArrowUp className="w-3.5 h-3.5 text-crypto-green" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-crypto-red" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">
                              {alert.symbol.replace("USDT", "")}
                            </span>
                            {alert.isTriggered && (
                              <Badge className="bg-crypto-gold/20 text-crypto-gold border-crypto-gold/30 text-[9px] px-1 py-0">
                                ATIVADO
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {isAbove ? "Acima" : "Abaixo"} $
                              {formatPrice(alert.targetPrice)}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50">
                              |
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Agora: ${formatPrice(alert.currentPrice)}
                            </span>
                          </div>
                          {/* Progress bar */}
                          {!alert.isTriggered && (
                            <div className="mt-1 w-full max-w-[140px] h-1 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  isAbove
                                    ? "bg-crypto-green"
                                    : "bg-crypto-red"
                                )}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-crypto-red shrink-0"
                        onClick={() => removeAlert(alert.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
