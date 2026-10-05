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
import { Brain, CheckCircle2, XCircle, ShieldAlert, TrendingUp, Activity, Zap } from "lucide-react";
import { getSymbolKlines } from "@/lib/bot/kline-cache";
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

/** Candles reais (1h) de cada ativo usado pelos robôs, atualizados periodicamente. */
function useBotKlines(symbols: string[]) {
  const [klines, setKlines] = useState<Record<string, KlineData[]>>({});
  const key = symbols.join(",");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        key.split(",").filter(Boolean).map(async (s) => [s, await getSymbolKlines(s)] as const)
      );
      if (!cancelled) setKlines(Object.fromEntries(entries));
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key]);

  return klines;
}

export function EnginePanel() {
  const { bots, tickers, aiSignals } = useCryptoStore(
    useShallow((s) => ({ bots: s.bots, tickers: s.tickers, aiSignals: s.aiSignals }))
  );

  const symbols = useMemo(() => Array.from(new Set(bots.map((b) => b.symbol))), [bots]);
  const klines = useBotKlines(symbols);
  const [focusSymbol, setFocusSymbol] = useState<string>("");
  const activeSymbol = focusSymbol && symbols.includes(focusSymbol) ? focusSymbol : symbols[0];

  const btc = tickers["BTCUSDT"];
  const leaders = useMemo(() => runMarketScanner(tickers), [tickers]);

  const analysis: MarketAnalysis | null = useMemo(() => {
    const ticker = activeSymbol ? tickers[activeSymbol] : undefined;
    if (!ticker) return null;
    return analyzeMarket(activeSymbol, ticker, btc, klines[activeSymbol] ?? []);
  }, [activeSymbol, tickers, btc, klines]);

  const decisions = useMemo(
    () =>
      bots.map((bot) => {
        const ticker = tickers[bot.symbol];
        if (!ticker) return { bot, decision: null };
        return { bot, decision: evaluateEntry(bot, ticker, btc, klines[bot.symbol] ?? [], aiSignals) };
      }),
    [bots, tickers, btc, klines, aiSignals]
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
          {decisions.map(({ bot, decision }) => (
            <div key={bot.id} className="rounded-xl border border-border/40 bg-secondary/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{bot.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {bot.symbol.replace("USDT", "/USDT")} · {strategyName(bot.strategy)}
                  </div>
                </div>
                {decision && (
                  <Badge
                    className={cn(
                      "text-[10px] shrink-0",
                      decision.shouldBuy
                        ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                        : "bg-secondary text-muted-foreground border-border"
                    )}
                    variant="outline"
                  >
                    {decision.shouldBuy ? "Compraria agora" : "Aguardando"}
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
                <p className="text-[10px] text-muted-foreground">Aguardando cotação...</p>
              )}
            </div>
          ))}
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
                  {symbols.map((s) => (
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
