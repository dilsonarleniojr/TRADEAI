"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCryptoStore, type BotInstance, type KlineData } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, CheckCircle2, XCircle, ShieldAlert, TrendingUp, Activity, Zap, RefreshCw } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { getSymbolKlines } from "@/lib/bot/kline-cache";
import { getOrderBookAnalysis, type OrderBookAnalysis } from "@/lib/bot/order-book-cache";
import { analyzeMarket, evaluateEntry, type MarketAnalysis } from "@/lib/bot/entry-engine";
import { runMarketScanner, type QuantVote } from "@/lib/bot/quant-engine";
import {
  ENGINE_FILTERS,
  STRATEGY_CATALOG,
  VOLATILITY_VETO_LIMIT,
  strategyName,
} from "@/lib/bot/strategy-catalog";
import { cn } from "@/lib/utils";
import { HistoryPanel } from "./history-panel";

const REFRESH_MS = 10_000;

const VOTE_LABEL: Record<QuantVote, string> = { BUY: "COMPRA", SELL: "VENDA", HOLD: "NEUTRO" };
const VOTE_CLASS: Record<QuantVote, string> = {
  BUY: "text-crypto-green",
  SELL: "text-crypto-red",
  HOLD: "text-muted-foreground",
};

/** Candles reais (1m e 15m) e Livro de Ofertas de cada ativo usado pelos robôs. */
function useBotMarketData(symbols: string[]) {
  const [klines1m, setKlines1m] = useState<Record<string, KlineData[]>>({});
  const [klines15m, setKlines15m] = useState<Record<string, KlineData[]>>({});
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBookAnalysis>>({});
  const key = symbols.join(",");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const symList = key.split(",").filter((s) => s && s !== "AUTO");
      const [entries1m, entries15m, entriesDepth] = await Promise.all([
        Promise.all(symList.map(async (s) => [s, await getSymbolKlines(s, "1m")] as const)),
        Promise.all(symList.map(async (s) => [s, await getSymbolKlines(s, "15m")] as const)),
        Promise.all(symList.map(async (s) => [s, await getOrderBookAnalysis(s)] as const)),
      ]);
      if (!cancelled) {
        setKlines1m(Object.fromEntries(entries1m));
        setKlines15m(Object.fromEntries(entries15m));
        setOrderBooks(Object.fromEntries(entriesDepth));
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key]);

  return { klines1m, klines15m, orderBooks };
}

export function EnginePanel() {
  const { bots, tickers, aiSignals } = useCryptoStore(
    useShallow((s) => ({ bots: s.bots, tickers: s.tickers, aiSignals: s.aiSignals }))
  );

  const btc = tickers["BTCUSDT"];
  const [leaders, setLeaders] = useState<string[]>(() => runMarketScanner(tickers));
  useEffect(() => {
    const update = () => {
      setLeaders(runMarketScanner(useCryptoStore.getState().tickers));
    };
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, []);
  const defaultLeader = leaders[0] || "SOLUSDT";

  // Mapeia símbolos reais de mercado para buscar cotações, klines e orderbook
  const marketSymbols = useMemo(() => {
    const list: string[] = [];
    for (const b of bots) {
      if (b.symbol === "AUTO" || b.useAutoScreener) {
        const target = b.position?.symbol || (b.overrideSymbol && b.overrideSymbol !== "AUTO" ? b.overrideSymbol : defaultLeader);
        if (target && target !== "AUTO") list.push(target);
      } else if (b.symbol && b.symbol !== "AUTO") {
        list.push(b.symbol);
      }
    }
    // Garante BTC e defaultLeader para leitura institucional de mercado
    list.push("BTCUSDT");
    if (defaultLeader && defaultLeader !== "AUTO") list.push(defaultLeader);
    return Array.from(new Set(list));
  }, [bots, defaultLeader]);

  const { klines1m, klines15m, orderBooks } = useBotMarketData(marketSymbols);
  const [focusSymbol, setFocusSymbol] = useState<string>("");
  const activeSymbol = focusSymbol && marketSymbols.includes(focusSymbol)
    ? focusSymbol
    : (marketSymbols[0] || "BTCUSDT");

  const analysis: MarketAnalysis | null = useMemo(() => {
    const ticker = activeSymbol ? tickers[activeSymbol] : undefined;
    if (!ticker) return null;
    return analyzeMarket(activeSymbol, ticker, btc, klines1m[activeSymbol] ?? []);
  }, [activeSymbol, tickers, btc, klines1m]);

  const decisions = useMemo(
    () =>
      bots.map((bot) => {
        const isAuto = bot.symbol === "AUTO" || Boolean(bot.useAutoScreener);
        const evalSymbol = isAuto ? (bot.position?.symbol || (bot.overrideSymbol && bot.overrideSymbol !== "AUTO" ? bot.overrideSymbol : defaultLeader)) : bot.symbol;

        // Cotação do store ou fallback do último candle de 1m carregado
        let ticker = tickers[evalSymbol];
        if (!ticker) {
          const klines = klines1m[evalSymbol];
          if (klines && klines.length > 0) {
            const lastClose = klines[klines.length - 1].close;
            if (lastClose > 0) {
              ticker = {
                symbol: evalSymbol,
                price: lastClose,
                priceChange: 0,
                priceChangePercent: 0,
                high: lastClose,
                low: lastClose,
                volume: 0,
                quoteVolume: 0,
              };
            }
          }
        }

        if (!ticker || !ticker.price) {
          return { bot, evalSymbol, isAuto, decision: null };
        }

        return {
          bot,
          evalSymbol,
          isAuto,
          decision: evaluateEntry(
            isAuto ? { ...bot, symbol: evalSymbol } : bot,
            ticker,
            btc,
            klines1m[evalSymbol] ?? [],
            aiSignals,
            klines15m[evalSymbol] ?? [],
            orderBooks[evalSymbol] ?? null
          ),
        };
      }),
    [bots, tickers, btc, klines1m, klines15m, orderBooks, aiSignals, defaultLeader]
  );

  const strategyStats = useMemo(() => {
    const map: Record<string, { bots: BotInstance[]; pnl: number; trades: number; wins: number }> = {};
    for (const b of bots) {
      const e = (map[b.strategy] ??= { bots: [], pnl: 0, trades: 0, wins: 0 });
      e.bots.push(b);
      e.pnl += b.stats.realizedPnl || 0;
      e.trades += b.stats.sellTrades || 0;
      e.wins += b.stats.winTrades || 0;
    }
    return map;
  }, [bots]);

  return (
    <div className="space-y-4">
      {/* 1. Decisão ao vivo de cada robô */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4 text-crypto-cyan" />
            Decisão de cada robô agora
            <Badge variant="outline" className="ml-auto text-[10px] border-crypto-cyan/20 text-crypto-cyan">
              até 500 candles de 1m · atualiza a cada 10s
            </Badge>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            O robô compra quando <strong>todas</strong> as verificações abaixo estão aprovadas. Funciona mesmo com o robô pausado,
            para você ver o que ele faria.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {decisions.map(({ bot, evalSymbol, isAuto, decision }) => {
            const displaySymbol = evalSymbol ? evalSymbol.replace("USDT", "/USDT") : bot.symbol;
            const currentPrice = tickers[evalSymbol]?.price || (klines1m[evalSymbol]?.length ? klines1m[evalSymbol][klines1m[evalSymbol].length - 1].close : 0);

            return (
              <div key={bot.id} className="rounded-xl border border-border/40 bg-secondary/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate flex items-center gap-1.5">
                      <span>{bot.name}</span>
                      {isAuto && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-orange-500/10 border-orange-500/30 text-orange-400 font-semibold">
                          AUTO
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span className="font-semibold text-foreground/90">
                        {isAuto ? `Alvo: ${displaySymbol}` : displaySymbol}
                      </span>
                      <span>·</span>
                      <span>{strategyName(bot.strategy)}</span>
                      {currentPrice > 0 ? (
                        <>
                          <span>·</span>
                          <span className="text-crypto-cyan font-mono font-medium">${formatPrice(currentPrice)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {decision && (
                    <Badge
                      className={cn(
                        "text-[10px] shrink-0 font-medium",
                        decision.shouldBuy
                          ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                          : "bg-secondary text-muted-foreground border-border"
                      )}
                      variant="outline"
                    >
                      {decision.shouldBuy ? "Compraria agora" : "Aguardando confluência"}
                    </Badge>
                  )}
                </div>
                {decision ? (
                  <ul className="space-y-1">
                    {decision.checks.map((c) => (
                      <li key={c.label} className="flex items-start gap-1.5 text-[10px] leading-snug">
                        {c.ok ? (
                          <CheckCircle2 className="w-3 h-3 text-crypto-green shrink-0 mt-px" />
                        ) : (
                          <XCircle className="w-3 h-3 text-crypto-red shrink-0 mt-px" />
                        )}
                        <span>
                          <strong className="text-foreground">{c.label}:</strong>{" "}
                          <span className="text-muted-foreground">{c.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-crypto-cyan shrink-0" />
                    <span>Conectando cotação de {displaySymbol}...</span>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 2. Leitura de mercado de um ativo */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-crypto-cyan" />
              Leitura de mercado
            </CardTitle>
            {activeSymbol && (
              <Select value={activeSymbol} onValueChange={setFocusSymbol}>
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketSymbols.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("USDT", "/USDT")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!analysis || !analysis.ready ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Carregando candles do ativo...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Tile title="Regime (ADX)">
                <div className="text-sm font-bold">
                  {analysis.regime === "TREND_FOLLOWING"
                    ? "Tendência forte"
                    : analysis.regime === "MEAN_REVERSION"
                      ? "Mercado lateral"
                      : "Neutro"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ADX {analysis.adx?.toFixed(0) ?? "—"} · &gt; 25 tendência, &lt; 20 lateral
                </div>
                <div className="text-[10px] text-muted-foreground pt-1">
                  {analysis.regime === "TREND_FOLLOWING"
                    ? "Favorece MACD e Rompimento."
                    : analysis.regime === "MEAN_REVERSION"
                      ? "Favorece RSI, Bollinger e Grade."
                      : "Sem preferência clara."}
                </div>
              </Tile>

              <Tile title="Comitê (2 de 3)">
                {(
                  [
                    ["Tendência", analysis.votes.trend, analysis.voteDetails.trend],
                    ["Momentum", analysis.votes.momentum, analysis.voteDetails.momentum],
                    ["Fluxo", analysis.votes.flow, analysis.voteDetails.flow],
                  ] as const
                ).map(([label, vote, detail]) => (
                  <div key={label} className="text-[10px] flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground">
                      {label} <span className="opacity-60">· {detail}</span>
                    </span>
                    <span className={cn("font-semibold shrink-0", VOTE_CLASS[vote])}>{VOTE_LABEL[vote]}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border/40 pt-1 mt-1 text-[10px] font-bold">
                  <span>Decisão</span>
                  <span className={VOTE_CLASS[analysis.committee]}>{VOTE_LABEL[analysis.committee]}</span>
                </div>
              </Tile>

              <Tile title="Risco">
                <div className={cn("text-sm font-bold flex items-center gap-1", analysis.vetoed ? "text-crypto-red" : "text-crypto-green")}>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {analysis.vetoed ? "Compras vetadas" : "Volatilidade ok"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ATR {(analysis.relATR * 100).toFixed(1)}% · veto a partir de {VOLATILITY_VETO_LIMIT * 100}%
                </div>
                <div className="text-[10px] text-muted-foreground pt-1">RSI {analysis.rsi.toFixed(0)}</div>
              </Tile>

              <Tile title="Força vs BTC (24h)">
                <div className={cn("text-sm font-bold", analysis.strength.ok ? "text-crypto-green" : "text-crypto-red")}>
                  {activeSymbol === "BTCUSDT"
                    ? "Referência"
                    : `${analysis.strength.relativeStrength >= 0 ? "+" : ""}${analysis.strength.relativeStrength.toFixed(1)} p.p.`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Volume 24h: US$ {(analysis.strength.volume24h / 1e6).toFixed(0)} mi
                </div>
                <div className="text-[10px] text-muted-foreground pt-1">
                  {analysis.strength.ok ? "Passa no filtro." : "Não passa: pouca liquidez ou fraco demais vs BTC."}
                </div>
              </Tile>
            </div>
          )}

          {leaders.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border/30 text-[10px] text-muted-foreground">
              <Zap className="w-3 h-3 text-crypto-cyan" />
              Maiores altas entre os 50 mais negociados (24h):
              {leaders.map((s) => {
                const ch = tickers[s]?.priceChangePercent || 0;
                return (
                  <Badge key={s} variant="outline" className="text-[10px] border-crypto-cyan/25 text-crypto-cyan">
                    {s.replace("USDT", "")} {ch >= 0 ? "+" : ""}
                    {ch.toFixed(1)}%
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Histórico retroativo de candles */}
      <HistoryPanel />

      {/* 4. Guia de estratégias + desempenho */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-crypto-cyan" />
            Guia de estratégias e filtros
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Para mudar a estratégia ou os filtros de um robô, use a engrenagem no cartão dele.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STRATEGY_CATALOG.map((s) => {
              const st = strategyStats[s.id];
              return (
                <div key={s.id} className="rounded-lg border border-border/40 bg-secondary/15 p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{s.name}</span>
                    <Badge variant="outline" className="text-[9px] border-border">
                      {s.style === "TREND" ? "tendência" : s.style === "REVERSION" ? "reversão" : "qualquer regime"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">{s.rule}</p>
                  <div className="text-[10px] flex items-center justify-between pt-1 border-t border-border/20">
                    <span className="text-muted-foreground">
                      {st ? `${st.bots.length} robô(s): ${st.bots.map((b) => b.symbol.replace("USDT", "")).join(", ")}` : "nenhum robô usa"}
                    </span>
                    {st && st.trades > 0 && (
                      <span className={cn("font-semibold", st.pnl >= 0 ? "text-crypto-green" : "text-crypto-red")}>
                        {st.pnl >= 0 ? "+" : ""}${st.pnl.toFixed(2)} · {Math.round((st.wins / st.trades) * 100)}% acerto
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border/40 bg-secondary/15 p-2.5 space-y-1.5">
            <span className="text-xs font-bold">Filtros opcionais (por robô)</span>
            {ENGINE_FILTERS.map((f) => (
              <p key={f.key} className="text-[10px] text-muted-foreground leading-snug">
                <strong className="text-foreground">{f.name}:</strong> {f.description}
              </p>
            ))}
            <p className="text-[10px] text-muted-foreground leading-snug">
              <strong className="text-foreground">Veto de volatilidade (sempre ativo):</strong> bloqueia compras quando o ATR relativo
              passa de {VOLATILITY_VETO_LIMIT * 100}%.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/30 bg-secondary/20 p-3 space-y-1">
      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">{title}</span>
      {children}
    </div>
  );
}
