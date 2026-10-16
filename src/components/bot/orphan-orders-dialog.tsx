"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

interface BinanceOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  price: number;
  origQty: number;
  executedQty: number;
  status: string;
  time: number;
}

interface OrphanOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrphanOrdersDialog({ open, onOpenChange }: OrphanOrdersDialogProps) {
  const { bots, tradingMode } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      tradingMode: s.tradingMode,
    }))
  );

  const { toast } = useToast();
  const [orders, setOrders] = useState<BinanceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Mapeamento dos símbolos e posições gerenciadas ativamente por robôs locais
  const activeBotSymbols = useMemo(() => {
    return new Set(
      bots
        .filter((b) => b.active && b.position && b.position.quantity > 0)
        .map((b) => b.symbol.trim().toUpperCase())
    );
  }, [bots]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/binance/reconcile");
      const data = await res.json();
      if (res.ok && data.success) {
        setOrders(data.orders || []);
      } else {
        throw new Error(data.error || "Não foi possível buscar ordens abertas na Binance.");
      }
    } catch (err: any) {
      toast({
        title: "Erro de Comunicação",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchOrders();
    }
  }, [open]);

  // Classifica as ordens em órfãs vs ativas de robôs
  const { orphanOrders, managedOrders } = useMemo(() => {
    const orphans: BinanceOrder[] = [];
    const managed: BinanceOrder[] = [];

    orders.forEach((o) => {
      const sym = o.symbol.trim().toUpperCase();
      // Se não há robô com posição ativa para esse símbolo, a ordem é considerada órfã
      if (activeBotSymbols.has(sym)) {
        managed.push(o);
      } else {
        orphans.push(o);
      }
    });

    return { orphanOrders: orphans, managedOrders: managed };
  }, [orders, activeBotSymbols]);

  const handleCancelSingle = async (order: BinanceOrder) => {
    setCancelingId(order.orderId);
    try {
      const res = await fetch(`/api/binance/reconcile?symbol=${order.symbol}&orderId=${order.orderId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Ordem Cancelada",
          description: `Ordem ${order.orderId} (${order.symbol}) cancelada com sucesso na Binance.`,
        });
        setOrders((prev) => prev.filter((o) => o.orderId !== order.orderId));
      } else {
        throw new Error(data.error || "Erro ao cancelar ordem.");
      }
    } catch (err: any) {
      toast({
        title: "Falha ao Cancelar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setCancelingId(null);
    }
  };

  const handleCancelAllOrphans = async () => {
    if (orphanOrders.length === 0) return;
    if (!window.confirm(`Deseja cancelar todas as ${orphanOrders.length} ordens órfãs na Binance? Esta ação liberará a margem imediatamente.`)) {
      return;
    }

    setIsCanceling(true);
    let successCount = 0;
    try {
      for (const o of orphanOrders) {
        const res = await fetch(`/api/binance/reconcile?symbol=${o.symbol}&orderId=${o.orderId}`, {
          method: "DELETE",
        });
        if (res.ok) successCount++;
      }

      toast({
        title: "Limpeza de Ordens Órfãs Concluída",
        description: `${successCount} ordem(ns) cancelada(s) com sucesso na Binance.`,
      });
      fetchOrders();
    } catch (err: any) {
      toast({
        title: "Erro durante a limpeza",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-[#0a0f1d]/95 backdrop-blur-xl border border-white/[0.1] text-foreground p-6 shadow-2xl">
        <DialogHeader className="border-b border-white/[0.08] pb-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  Reconciliação & Ordens Órfãs (Binance)
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-[10px]">
                    Pilar 2 Safety
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Audita ordens abertas no livro da exchange e cancela resquícios não associados a robôs em operação.
                </DialogDescription>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={fetchOrders}
              disabled={isLoading}
              className="h-8 text-xs border-white/[0.1] hover:bg-white/[0.05]"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </DialogHeader>

        {/* Resumo da Auditoria */}
        <div className="grid grid-cols-3 gap-2.5 py-3 shrink-0 text-xs">
          <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.06] flex flex-col justify-between">
            <span className="text-[11px] text-muted-foreground">Total no Livro da Exchange</span>
            <span className="text-lg font-bold font-mono text-foreground mt-1">{orders.length} ordens</span>
          </div>
          <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.06] flex flex-col justify-between">
            <span className="text-[11px] text-muted-foreground">Gerenciadas pela Frota</span>
            <span className="text-lg font-bold font-mono text-cyan-400 mt-1">{managedOrders.length} ordens</span>
          </div>
          <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
            orphanOrders.length > 0 ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          }`}>
            <span className="text-[11px] text-muted-foreground">Ordens Órfãs (Sobras)</span>
            <span className="text-lg font-bold font-mono mt-1 flex items-center gap-1.5">
              {orphanOrders.length > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  {orphanOrders.length} a limpar
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  0 órfãs (Limpo)
                </>
              )}
            </span>
          </div>
        </div>

        {/* Lista de Ordens */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          {isLoading ? (
            <div className="h-44 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="text-xs">Consultando livro de ofertas na Binance...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-muted-foreground gap-2 border border-dashed border-white/[0.08] rounded-xl">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/80" />
              <span className="text-xs font-semibold text-foreground">Nenhuma ordem pendente na Binance</span>
              <p className="text-[11px] text-muted-foreground text-center max-w-sm">
                Sua conta não possui ordens abertas no momento. Toda a margem está 100% livre.
              </p>
            </div>
          ) : (
            orders.map((o) => {
              const isOrphan = !activeBotSymbols.has(o.symbol.trim().toUpperCase());
              const dateStr = new Date(o.time).toLocaleTimeString("pt-BR");

              return (
                <div
                  key={o.orderId}
                  className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-3 text-xs ${
                    isOrphan
                      ? "bg-amber-500/[0.04] border-amber-500/30"
                      : "bg-white/[0.02] border-white/[0.06]"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm font-mono">
                        {o.symbol}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-bold px-1.5 py-0 ${
                          o.side === "BUY"
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                            : "border-red-500/40 text-red-400 bg-red-500/10"
                        }`}
                      >
                        {o.side} ({o.type})
                      </Badge>

                      {isOrphan ? (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px] font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                          Órfã (Sem Robô Ativo)
                        </Badge>
                      ) : (
                        <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-[9px] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-cyan-400" />
                          Robô Gerenciando
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                      <span>Preço: ${o.price > 0 ? o.price.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "A Mercado"}</span>
                      <span>Qtd: {o.origQty}</span>
                      <span>Total: ${(o.price * o.origQty).toFixed(2)} USDT</span>
                      <span className="text-[10px] text-muted-foreground/80">{dateStr}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCancelSingle(o)}
                    disabled={cancelingId === o.orderId}
                    className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    {cancelingId === o.orderId ? "Cancelando..." : "Cancelar"}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-white/[0.08] flex items-center justify-between sm:justify-between gap-3 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            Auditoria idempotente em tempo real via Binance REST API.
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-white/[0.1] hover:bg-white/[0.05]"
            >
              Fechar
            </Button>
            {orphanOrders.length > 0 && (
              <Button
                size="sm"
                onClick={handleCancelAllOrphans}
                disabled={isCanceling}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {isCanceling ? "Limpando..." : `Cancelar Todas as Órfãs (${orphanOrders.length})`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
