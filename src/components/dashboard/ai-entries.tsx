"use client";

import { useEffect, useState } from "react";
import { useCryptoStore, type AISignalData } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, BarChart3, Crosshair, Loader2, LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExitAction, ExitPlan, TradeEntry } from "@/lib/ai-entries";

const MAX_PAIRS = 6;
const RISK_PER_TRADE = 0.01; // 1% do patrimônio por operação
const MAX_POSITION_SHARE = 0.25; // nenhuma operação passa de 25% do patrimônio

const SIDE_STYLE: Record<TradeEntry["side"], string> = {
  BUY: "bg-crypto-green/15 text-crypto-green border-crypto-green/30",
  SELL: "bg-crypto-red/15 text-crypto-red border-crypto-red/30",
  WAIT: "bg-crypto-gold/15 text-crypto-gold border-crypto-gold/30",
};
const SIDE_LABEL: Record<TradeEntry["side"], string> = { BUY: "▲ COMPRA", SELL: "▼ VENDA", WAIT: "● AGUARDAR" };
const SOURCE_LABEL: Record<TradeEntry["source"], string> = {
  "ia+regras": "IA Quant + Indicadores",
  ia: "IA Neural",
  regras: "Motor Algorítmico",
};

const EXIT_STYLE: Record<ExitAction, string> = {
  MANTER: "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30",
  PARCIAL: "bg-crypto-gold/15 text-crypto-gold border-crypto-gold/30",
  SAIR: "bg-crypto-red/15 text-crypto-red border-crypto-red/30",
};
const EXIT_LABEL: Record<ExitAction, string> = { MANTER: "● MANTER", PARCIAL: "◐ REALIZAR PARCIAL", SAIR: "▼ SAIR" };

function pct(from: number, to: number) {
  const v = ((to - from) / from) * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
}

function Level({ label, value, tone, hint }: { label: string; value: number; tone?: "red" | "green"; hint?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-mono font-semibold", tone === "red" && "text-crypto-red", tone === "green" && "text-crypto-green")}>
        ${formatPrice(value)}
        {hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}
      </dd>
    </div>
  );
}

export function AIEntries() {
  const { tickers, watchlist, selectedSymbol, setSelectedSymbol, setActiveSection, portfolio } = useCryptoStore(
    useShallow((s) => ({
      tickers: s.tickers,
      watchlist: s.watchlist,
      selectedSymbol: s.selectedSymbol,
      setSelectedSymbol: s.setSelectedSymbol,
      setActiveSection: s.setActiveSection,
      portfolio: s.portfolio,
    }))
  );
  const [entries, setEntries] = useState<TradeEntry[]>([]);
  const [exits, setExits] = useState<ExitPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExits, setLoadingExits] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [showSizing, setShowSizing] = useState(true);

  const positions = (portfolio?.positions ?? []).filter((p) => p.quantity > 0 && p.avgPrice > 0);
  const equity = portfolio?.totalValue ?? 0;

  // Favoritos primeiro, depois o par aberto no gráfico, depois os de maior volume
  const pickSymbols = () => {
    const byVolume = Object.values(tickers)
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .map((t) => t.symbol)
      .filter((s) => s.endsWith("USDT"));
    return [...new Set([...watchlist, selectedSymbol, ...byVolume])].slice(0, MAX_PAIRS);
  };

  const call = async (url: string, payload: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Falha na análise.");
    return data;
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await call("/api/ai/entries", { symbols: pickSymbols() });
      const receivedEntries: TradeEntry[] = data.entries ?? [];
      setEntries(receivedEntries);
      setGeneratedAt(Date.now());

      // Sincroniza os sinais gerados com o store para alimentar a aba de Sinais e robôs de IA
      if (Array.isArray(receivedEntries)) {
        const validSignals: AISignalData[] = receivedEntries
          .filter((e) => e.side !== "WAIT")
          .map((e) => ({
            id: `ai-entry-${e.symbol}-${Date.now()}`,
            symbol: e.symbol,
            action: (e.side === "BUY" ? "BUY" : "SELL") as "BUY" | "SELL",
            confidence: e.confidence,
            priceAtSignal: e.entry,
            targetPrice: e.takeProfit,
            takeProfit: e.takeProfit,
            stopLoss: e.stopLoss,
            reasoning: e.reasoning,
            createdAt: new Date().toISOString(),
          }));
        if (validSignals.length > 0) {
          useCryptoStore.getState().setAiSignals(validSignals);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Carrega automaticamente as análises ao montar caso não haja entradas ainda
  useEffect(() => {
    if (entries.length === 0 && !loading && Object.keys(tickers).length > 0) {
      generate();
    }
  }, [tickers]);

  const analyzeExits = async () => {
    setLoadingExits(true);
    setError(null);
    try {
      const data = await call("/api/ai/exits", {
        positions: positions.map((p) => ({ symbol: p.symbol, avgPrice: p.avgPrice, quantity: p.quantity })),
      });
      setExits(data.exits);
      setGeneratedAt(Date.now());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingExits(false);
    }
  };

  const openChart = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveSection("chart");
  };

  // Tamanho da posição: arrisca 1% do patrimônio até o stop, sem passar de 25% do patrimônio
  const sizing = (e: TradeEntry) => {
    if (equity <= 0 || e.side === "WAIT") return null;
    const riskPerUnit = Math.abs(e.entry - e.stopLoss);
    if (riskPerUnit <= 0) return null;
    const riskUsd = equity * RISK_PER_TRADE;
    const notional = Math.min((riskUsd / riskPerUnit) * e.entry, equity * MAX_POSITION_SHARE);
    return { notional, riskUsd: (notional / e.entry) * riskPerUnit };
  };

  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-1">
            <Crosshair className="w-4 h-4 text-crypto-cyan" aria-hidden="true" />
            Entradas e saídas sugeridas
          </CardTitle>
          {positions.length > 0 && (
            <Button size="sm" variant="outline" onClick={analyzeExits} disabled={loadingExits} className="h-9 gap-1.5 text-xs font-semibold cursor-pointer">
              {loadingExits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              Analisar saídas
            </Button>
          )}
          <Button size="sm" onClick={generate} disabled={loading} className="h-9 gap-1.5 text-xs font-semibold cursor-pointer">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {entries.length ? "Gerar de novo" : "Gerar entradas"}
          </Button>
        </div>
        <div role="note" className="mt-2 rounded-lg border border-crypto-cyan/30 bg-crypto-cyan/10 p-2.5 text-[11px] leading-relaxed text-foreground/90">
          <strong className="font-semibold text-crypto-cyan">TradeAI Quant Engine.</strong> Análise preditiva em tempo real combinando tendências, momento institucional, suportes/resistências e projeções de Fibonacci. Use os níveis técnicos sugeridos para operações manuais ou replicação automática nos robôs.
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Checkbox
            id="show-sizing"
            checked={showSizing}
            onCheckedChange={(v) => setShowSizing(v === true)}
          />
          <label htmlFor="show-sizing" className="text-[11px] text-muted-foreground cursor-pointer">
            Mostrar tamanho sugerido de posição
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {error && (
          <div role="alert" className="flex items-start gap-2 text-xs text-crypto-red bg-crypto-red/10 border border-crypto-red/30 rounded-lg p-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {exits.length > 0 && (
          <section aria-label="Saídas das posições abertas" className="space-y-2.5">
            <h3 className="text-xs font-semibold text-foreground">Saídas das suas posições</h3>
            {exits.map((x) => (
              <div key={x.symbol} className={cn("rounded-lg border border-border/40 p-3 space-y-2", loadingExits && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{x.symbol.replace("USDT", "")}<span className="text-muted-foreground font-normal">/USDT</span></span>
                  <Badge variant="outline" className={cn("text-[10px] font-bold", EXIT_STYLE[x.action])}>
                    {EXIT_LABEL[x.action]}{x.action === "PARCIAL" ? ` ${x.partialPct}%` : ""}
                  </Badge>
                  <span className={cn("ml-auto text-xs font-mono font-semibold", x.pnlPct >= 0 ? "text-crypto-green" : "text-crypto-red")}>
                    {x.pnlPct >= 0 ? "▲ +" : "▼ −"}{Math.abs(x.pnlPct).toFixed(2)}%
                  </span>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Level label="Preço médio" value={x.avgPrice} />
                  <Level label="Stop móvel" value={x.stopLoss} tone="red" hint={pct(x.currentPrice, x.stopLoss)} />
                  <Level label="Alvo 1" value={x.takeProfit} tone="green" hint={pct(x.currentPrice, x.takeProfit)} />
                  <Level label="Alvo 2" value={x.takeProfit2} tone="green" hint={pct(x.currentPrice, x.takeProfit2)} />
                </dl>
                <p className="text-xs text-muted-foreground leading-relaxed">{x.reasoning}</p>
                <Button variant="outline" size="sm" onClick={() => openChart(x.symbol)} className="h-9 gap-1.5 text-xs cursor-pointer">
                  <BarChart3 className="w-3.5 h-3.5" /> Ver no gráfico
                </Button>
              </div>
            ))}
          </section>
        )}

        {!loading && entries.length === 0 && exits.length === 0 && !error && (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Clique em <strong className="text-foreground">Gerar entradas</strong> para analisar seus favoritos e os pares de maior volume
            {positions.length > 0 && <>, ou em <strong className="text-foreground">Analisar saídas</strong> para revisar suas posições</>}.
          </div>
        )}

        {loading && entries.length === 0 && (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-20 rounded-lg bg-secondary/40 animate-pulse" />
            ))}
          </div>
        )}

        {entries.length > 0 && exits.length > 0 && <h3 className="text-xs font-semibold text-foreground pt-1">Novas entradas</h3>}

        {entries.map((e) => {
          const size = showSizing ? sizing(e) : null;
          return (
            <div key={e.symbol} className={cn("rounded-lg border border-border/40 p-3 space-y-2", loading && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{e.symbol.replace("USDT", "")}<span className="text-muted-foreground font-normal">/USDT</span></span>
                <Badge variant="outline" className={cn("text-[10px] font-bold", SIDE_STYLE[e.side])}>{SIDE_LABEL[e.side]}</Badge>
                {e.side !== "WAIT" && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {e.orderType === "LIMIT" ? "Ordem limite" : "A mercado"}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] text-muted-foreground">{SOURCE_LABEL[e.source]}</Badge>
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                  Setup Score: <strong className="text-foreground">{e.score}/100</strong> · Confiança: <strong className={e.confidence >= 0.75 ? "text-crypto-green" : "text-amber-400"}>{Math.round(e.confidence * 100)}%</strong>
                </span>
              </div>

              {e.side !== "WAIT" && (
                <>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <Level label={e.orderType === "LIMIT" ? "Entrada (limite)" : "Entrada"} value={e.entry} hint={e.orderType === "LIMIT" ? pct(e.currentPrice, e.entry) : undefined} />
                    <Level label="Stop" value={e.stopLoss} tone="red" hint={pct(e.entry, e.stopLoss)} />
                    <Level label="Alvo 1" value={e.takeProfit} tone="green" hint={pct(e.entry, e.takeProfit)} />
                    <Level label="Alvo 2" value={e.takeProfit2} tone="green" hint={pct(e.entry, e.takeProfit2)} />
                  </dl>
                  <p className="text-[11px] text-muted-foreground">
                    Risco/retorno 1 : {e.riskReward.toFixed(2)} até o alvo 1. No alvo 1, realize parte e passe o stop para a entrada; depois
                    acompanhe com stop móvel de ${formatPrice(e.trailingDistance)} abaixo do topo.
                  </p>
                  {size && (
                    <p className="text-[11px] text-foreground/80">
                      Tamanho sugerido: <strong className="font-mono">${formatPrice(size.notional)}</strong> (arrisca cerca de ${formatPrice(size.riskUsd)},
                      1% do patrimônio, limitado a 25%).
                    </p>
                  )}
                </>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">{e.reasoning}</p>
              {e.invalidation && <p className="text-[11px] text-muted-foreground">{e.invalidation}</p>}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => openChart(e.symbol)} className="h-8 gap-1.5 text-xs cursor-pointer">
                  <BarChart3 className="w-3.5 h-3.5" /> Ver no gráfico
                </Button>
                {e.side === "BUY" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedSymbol(e.symbol);
                      setActiveSection("bot");
                    }}
                    className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Vincular Robô ({e.symbol.replace("USDT", "")})
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {generatedAt && (
          <p className="text-[10px] text-muted-foreground text-right">
            Gerado às {new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Preços mudam: confira antes de operar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
