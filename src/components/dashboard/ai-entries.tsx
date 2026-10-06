"use client";

import { useEffect, useState, useMemo } from "react";
import { useCryptoStore, type AISignalData } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  BarChart3,
  Crosshair,
  Loader2,
  LogOut,
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Flame,
  Zap,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExitAction, ExitPlan, TradeEntry } from "@/lib/ai-entries";

const MAX_PAIRS = 6;
const RISK_PER_TRADE = 0.01; // 1% do patrimônio por operação
const MAX_POSITION_SHARE = 0.25; // nenhuma operação passa de 25% do patrimônio

type EntryFilter = "destaques" | "gainers" | "dips" | "volatilidade" | "favoritos";

const FILTER_TABS: { id: EntryFilter; label: string; icon: any }[] = [
  { id: "destaques", label: "Destaques IA", icon: Sparkles },
  { id: "gainers", label: "Maiores Altas", icon: TrendingUp },
  { id: "dips", label: "Sobrevenda / Dips", icon: TrendingDown },
  { id: "volatilidade", label: "Volatilidade", icon: Flame },
  { id: "favoritos", label: "Blue Chips & Fav", icon: Zap },
];

const STABLE_AND_PEGGED = new Set([
  "USDC", "FDUSD", "TUSD", "USDD", "DAI", "BUSD", "EUR", "AEUR", "USDP",
  "WBTC", "WBETH", "TBTC", "PAXG", "UST", "USDE", "USDJ", "CUSD",
]);

function isTradableCrypto(sym: string): boolean {
  if (!sym.endsWith("USDT")) return false;
  if (sym.includes("UP") || sym.includes("DOWN") || sym.includes("BEAR") || sym.includes("BULL")) return false;
  const base = sym.replace("USDT", "");
  return !STABLE_AND_PEGGED.has(base);
}

const SIDE_STYLE: Record<TradeEntry["side"], string> = {
  BUY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  SELL: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  WAIT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
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
  const [filter, setFilter] = useState<EntryFilter>("destaques");
  const [rotationOffset, setRotationOffset] = useState(0);
  const [activeAiProvider, setActiveAiProvider] = useState<string>("TradeAI Quant Engine");

  const positions = (portfolio?.positions ?? []).filter((p) => p.quantity > 0 && p.avgPrice > 0);
  const equity = portfolio?.totalValue ?? 0;

  // Constrói a lista ampla de candidatos de acordo com o filtro selecionado
  const candidatePool = useMemo(() => {
    const allTradable = Object.values(tickers).filter(
      (t) => isTradableCrypto(t.symbol) && t.price > 0 && (t.quoteVolume > 100000 || watchlist.includes(t.symbol))
    );

    if (filter === "gainers") {
      return allTradable
        .filter((t) => t.priceChangePercent > 0.5)
        .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
        .map((t) => t.symbol);
    }

    if (filter === "dips") {
      return allTradable
        .filter((t) => t.priceChangePercent < -0.5)
        .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
        .map((t) => t.symbol);
    }

    if (filter === "volatilidade") {
      return allTradable
        .map((t) => ({
          symbol: t.symbol,
          spreadPct: t.price > 0 ? ((t.high - t.low) / t.price) * 100 : 0,
        }))
        .filter((t) => t.spreadPct > 3.0)
        .sort((a, b) => b.spreadPct - a.spreadPct)
        .map((t) => t.symbol);
    }

    if (filter === "favoritos") {
      const blueChips = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "NEARUSDT", "SUIUSDT"];
      return [...new Set([...watchlist, ...blueChips])];
    }

    // "destaques" (Cesta dinâmica equilibrada entre altas, reversões e momentum)
    const topGainers = allTradable
      .filter((t) => t.priceChangePercent > 1.2)
      .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
      .slice(0, 10)
      .map((t) => t.symbol);

    const topDips = allTradable
      .filter((t) => t.priceChangePercent < -1.0)
      .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
      .slice(0, 8)
      .map((t) => t.symbol);

    const topVol = allTradable
      .map((t) => ({
        symbol: t.symbol,
        spread: t.price > 0 ? ((t.high - t.low) / t.price) * 100 : 0,
      }))
      .filter((t) => t.spread > 3.5)
      .sort((a, b) => b.spread - a.spread)
      .slice(0, 8)
      .map((t) => t.symbol);

    const highVolume = allTradable
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, 8)
      .map((t) => t.symbol);

    return [...new Set([...topGainers, ...topDips, ...topVol, ...highVolume, selectedSymbol, ...watchlist])];
  }, [tickers, filter, watchlist, selectedSymbol]);

  // Seleciona um lote dinâmico rotativo de pares a partir do pool
  const pickSymbols = (offset: number) => {
    if (candidatePool.length === 0) {
      return ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].slice(0, MAX_PAIRS);
    }

    const currentSelected = selectedSymbol && isTradableCrypto(selectedSymbol) ? [selectedSymbol] : [];
    const available = candidatePool.filter((s) => !currentSelected.includes(s));

    const needed = MAX_PAIRS - currentSelected.length;
    const start = (offset * needed) % Math.max(1, available.length);
    const rotated = [...available.slice(start), ...available.slice(0, start)];

    return [...currentSelected, ...rotated].slice(0, MAX_PAIRS);
  };

  const call = async (url: string, payload: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Falha na análise.");
    return data;
  };

  const generate = async (forceNextRotation = false) => {
    setLoading(true);
    setError(null);
    try {
      const nextOffset = forceNextRotation ? rotationOffset + 1 : rotationOffset;
      if (forceNextRotation) {
        setRotationOffset(nextOffset);
      }

      const symbols = pickSymbols(nextOffset);
      const data = await call("/api/ai/entries", { symbols, forceRefresh: forceNextRotation });
      const receivedEntries: TradeEntry[] = data.entries ?? [];
      setEntries(receivedEntries);
      setGeneratedAt(Date.now());
      if (data.provider) {
        setActiveAiProvider(data.provider);
      }

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
      generate(false);
    }
  }, [tickers]);

  // Recarrega quando o usuário muda o filtro de categoria
  const handleFilterChange = (newFilter: EntryFilter) => {
    if (newFilter === filter) return;
    setFilter(newFilter);
    setRotationOffset(0);
    // Dispara geração imediata para o novo filtro
    setTimeout(() => {
      generate(true);
    }, 50);
  };

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
    <Card className="bg-card/60 backdrop-blur-md gradient-border h-full flex flex-col">
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-crypto-cyan" aria-hidden="true" />
              Entradas e saídas sugeridas
            </CardTitle>
            <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-medium hidden sm:flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              <span>{activeAiProvider}</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {positions.length > 0 && (
              <Button size="sm" variant="outline" onClick={analyzeExits} disabled={loadingExits} className="h-8 gap-1.5 text-xs font-semibold cursor-pointer">
                {loadingExits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Analisar saídas
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => generate(true)}
              disabled={loading}
              className="h-8 gap-1.5 text-xs font-bold bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-sm cursor-pointer"
              title="Escaneia e analisa um novo lote de pares no mercado"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              {loading ? "Escaneando..." : "Escanear novos pares"}
            </Button>
          </div>
        </div>

        {/* Barra de Filtros de Mercado / Categorias para variedade dinâmica */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar text-xs">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleFilterChange(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 cursor-pointer border",
                  active
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm"
                    : "bg-white/[0.03] text-muted-foreground border-white/[0.06] hover:bg-white/[0.07] hover:text-foreground"
                )}
              >
                <Icon className={cn("w-3 h-3", active ? "text-cyan-400" : "text-muted-foreground")} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div role="note" className="rounded-lg border border-crypto-cyan/30 bg-crypto-cyan/10 p-2.5 text-[11px] leading-relaxed text-foreground/90 flex items-start justify-between gap-2">
          <div>
            <strong className="font-semibold text-crypto-cyan">TradeAI Quant Engine.</strong> Análise preditiva em tempo real combinando tendências, momento institucional, suportes/resistências e projeções de Fibonacci. Use os níveis técnicos sugeridos para operações manuais ou replicação automática nos robôs.
          </div>
          {candidatePool.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground font-mono bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
              {candidatePool.length} pares no radar (Lote {rotationOffset + 1})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="show-sizing"
            checked={showSizing}
            onCheckedChange={(v) => setShowSizing(v === true)}
            className="cursor-pointer"
          />
          <label htmlFor="show-sizing" className="text-[11px] text-muted-foreground cursor-pointer">
            Mostrar tamanho sugerido de posição
          </label>
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5 flex-1 overflow-y-auto">
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
            Clique em <strong className="text-foreground">Escanear novos pares</strong> para analisar o mercado
            {positions.length > 0 && <>, ou em <strong className="text-foreground">Analisar saídas</strong> para revisar suas posições</>}.
          </div>
        )}

        {loading && entries.length === 0 && (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-24 rounded-lg bg-secondary/40 animate-pulse" />
            ))}
          </div>
        )}

        {entries.length > 0 && exits.length > 0 && <h3 className="text-xs font-semibold text-foreground pt-1">Novas entradas</h3>}

        {entries.map((e) => {
          const size = showSizing ? sizing(e) : null;
          const isActionable = e.side !== "WAIT";

          return (
            <div
              key={e.symbol}
              className={cn(
                "rounded-lg border p-3.5 space-y-2.5 transition-all duration-200",
                isActionable
                  ? "border-emerald-500/30 bg-emerald-950/10 shadow-sm"
                  : "border-border/30 bg-card/40 opacity-80",
                loading && "opacity-60"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold tracking-tight">
                  {e.symbol.replace("USDT", "")}
                  <span className="text-muted-foreground font-normal text-xs">/USDT</span>
                </span>

                <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5", SIDE_STYLE[e.side])}>
                  {SIDE_LABEL[e.side]}
                </Badge>

                {isActionable && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-white/[0.08]">
                    {e.orderType === "LIMIT" ? "Ordem limite" : "A mercado"}
                  </Badge>
                )}

                <Badge variant="outline" className="text-[10px] text-muted-foreground border-white/[0.08]">
                  {e.aiProviderName || SOURCE_LABEL[e.source]}
                </Badge>

                {/* Chips de Indicadores Técnicos */}
                {e.indicators && (
                  <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded border text-[9px] font-semibold",
                      e.indicators.rsi >= 70 ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                      e.indicators.rsi <= 35 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      "bg-white/[0.03] text-muted-foreground border-white/[0.06]"
                    )}>
                      RSI {e.indicators.rsi}
                    </span>
                    <span className="px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.03] text-[9px]">
                      Vol {e.indicators.volumeRatio}x
                    </span>
                  </div>
                )}

                <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                  Setup Score: <strong className="text-foreground">{e.score}/100</strong> · Confiança:{" "}
                  <strong className={e.confidence >= 0.75 ? "text-emerald-400" : "text-amber-400"}>
                    {Math.round(e.confidence * 100)}%
                  </strong>
                </span>
              </div>

              {isActionable && (
                <>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white/[0.02] p-2.5 rounded-md border border-white/[0.04]">
                    <Level
                      label={e.orderType === "LIMIT" ? "Entrada (limite)" : "Entrada"}
                      value={e.entry}
                      hint={e.orderType === "LIMIT" ? pct(e.currentPrice, e.entry) : undefined}
                    />
                    <Level label="Stop" value={e.stopLoss} tone="red" hint={pct(e.entry, e.stopLoss)} />
                    <Level label="Alvo 1" value={e.takeProfit} tone="green" hint={pct(e.entry, e.takeProfit)} />
                    <Level label="Alvo 2" value={e.takeProfit2} tone="green" hint={pct(e.entry, e.takeProfit2)} />
                  </dl>

                  <p className="text-[11px] text-muted-foreground/90">
                    Risco/retorno 1 : {e.riskReward.toFixed(2)} até o alvo 1. No alvo 1, realize parte e passe o stop para a entrada; depois
                    acompanhe com stop móvel de ${formatPrice(e.trailingDistance)} abaixo do topo.
                  </p>

                  {size && (
                    <p className="text-[11px] text-foreground/80">
                      Tamanho sugerido: <strong className="font-mono text-emerald-400">${formatPrice(size.notional)}</strong> (arrisca cerca de ${formatPrice(size.riskUsd)},
                      1% do patrimônio, limitado a 25%).
                    </p>
                  )}
                </>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed bg-white/[0.01] p-2 rounded border border-white/[0.03]">
                {e.reasoning}
              </p>

              {e.invalidation && (
                <p className="text-[11px] text-amber-400/90 font-medium">
                  ⚠️ {e.invalidation}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => openChart(e.symbol)} className="h-8 gap-1.5 text-xs cursor-pointer border-white/[0.1] hover:bg-white/[0.05]">
                  <BarChart3 className="w-3.5 h-3.5" /> Ver no gráfico
                </Button>
                {e.side === "BUY" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedSymbol(e.symbol);
                      setActiveSection("bot");
                    }}
                    className="h-8 gap-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm shadow-emerald-500/20 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Vincular Robô ({e.symbol.replace("USDT", "")})
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {generatedAt && (
          <p className="text-[10px] text-muted-foreground text-right pt-1">
            Gerado às {new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Preços mudam dinamicamente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
