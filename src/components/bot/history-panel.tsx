"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Database, Download, Loader2, Plus, Search, X, Bot, RefreshCw } from "lucide-react";
import { CRYPTO_LIST } from "@/lib/crypto-meta";
import { useToast } from "@/hooks/use-toast";
import { invalidateKlineCache } from "@/lib/bot/kline-cache";

interface CoverageRow {
  symbol: string;
  interval: string;
  total: number;
  from: number;
  to: number;
}

interface BackfillRow {
  symbol: string;
  interval: string;
  fetched: number;
  total: number;
  error?: string;
}

const DAY_OPTIONS = [30, 90, 180, 365];
const MAX_SYMBOLS = 25; // limite da API /api/market/history
const INTERVAL_OPTIONS = ["15m", "1h", "4h", "1d"];

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("pt-BR");

/** Download retroativo de candles da Binance para as análises dos robôs. */
export function HistoryPanel() {
  const { bots, chartSymbol } = useCryptoStore(
    useShallow((s) => ({ bots: s.bots, chartSymbol: s.selectedSymbol }))
  );
  const { toast } = useToast();

  const [days, setDays] = useState("90");
  const [interval, setInterval_] = useState("1h");
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);

  const botSymbols = useMemo(() => Array.from(new Set(bots.map((b) => b.symbol))), [bots]);

  // Moedas escolhidas para baixar; começa com as dos robôs.
  const [selected, setSelected] = useState<string[] | null>(null);
  const symbols = selected ?? botSymbols;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q
      ? CRYPTO_LIST.filter(
          (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.short.toLowerCase().includes(q)
        )
      : CRYPTO_LIST;
    return list.slice(0, 60);
  }, [search]);

  const addSymbol = (sym: string) => {
    if (symbols.includes(sym)) return;
    if (symbols.length >= MAX_SYMBOLS) {
      toast({ title: "Limite atingido", description: `Baixe no máximo ${MAX_SYMBOLS} moedas por vez.`, variant: "destructive" });
      return;
    }
    setSelected([...symbols, sym]);
  };
  const removeSymbol = (sym: string) => setSelected(symbols.filter((s) => s !== sym));
  const toggleSymbol = (sym: string) => (symbols.includes(sym) ? removeSymbol(sym) : addSymbol(sym));

  const loadCoverage = useCallback(async () => {
    try {
      const res = await fetch("/api/market/history?coverage=1");
      const json = await res.json();
      if (json?.success) setCoverage(json.data);
    } catch {
      // painel continua utilizável sem a lista de cobertura
    }
  }, []);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  const runDownload = async (list: string[], iv: string) => {
    if (list.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/market/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list, interval: iv, days: Number(days) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Falha no download");

      const results: BackfillRow[] = json.results;
      const failed = results.filter((r) => r.error);
      const newCandles = results.reduce((sum, r) => sum + r.fetched, 0);
      invalidateKlineCache();
      await loadCoverage();

      toast({
        title: failed.length ? "Download parcial" : "Histórico atualizado",
        description: failed.length
          ? `${newCandles} candles novos. ${failed[0].symbol}: ${failed[0].error}`
          : `${newCandles} candles novos para ${results.length} moeda(s).`,
        variant: failed.length ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Erro no download", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => runDownload(symbols, interval);

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-crypto-cyan" />
          Histórico de candles (Binance)
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Escolha as moedas, o intervalo e o período, e os candles passados ficam guardados no banco local. O motor, o otimizador e as leituras de
          mercado passam a usar até 500 candles de 1h em vez de 100. Candles já baixados não são baixados de novo.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Moedas a baixar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-semibold">
              Moedas a baixar <span className="text-muted-foreground font-normal">({symbols.length}/{MAX_SYMBOLS})</span>
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {chartSymbol && !symbols.includes(chartSymbol) && (
                <Button size="sm" variant="ghost" onClick={() => addSymbol(chartSymbol)} className="h-6 px-2 text-[10px]">
                  <Plus className="w-3 h-3 mr-0.5" /> {chartSymbol.replace("USDT", "")} (gráfico)
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)} className="h-6 px-2 text-[10px]" title="Voltar para as moedas dos robôs">
                <Bot className="w-3 h-3 mr-0.5" /> Moedas dos robôs
              </Button>
              {symbols.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelected([])} className="h-6 px-2 text-[10px] text-muted-foreground">
                  Limpar
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap rounded-lg border border-border/40 bg-secondary/15 p-2 min-h-[40px]">
            {symbols.map((sym) => (
              <span
                key={sym}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-crypto-cyan/10 text-crypto-cyan border border-crypto-cyan/25"
              >
                {sym.replace("USDT", "")}
                <button type="button" onClick={() => removeSymbol(sym)} aria-label={`Remover ${sym}`} className="hover:text-crypto-red">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] border-dashed">
                  <Plus className="w-3 h-3 mr-0.5" /> Adicionar moeda
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0 glass border-border/50" align="start">
                <div className="p-2 border-b border-border/30">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar moeda (ex.: SOL, Pepe)..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-7 pl-7 text-xs bg-secondary/30 border-border/50"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-[240px] overflow-y-auto cyan-scrollbar p-1">
                  {results.map((c) => {
                    const on = symbols.includes(c.symbol);
                    return (
                      <button
                        type="button"
                        key={c.symbol}
                        onClick={() => toggleSymbol(c.symbol)}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-secondary/40 flex items-center justify-between ${
                          on ? "bg-crypto-cyan/15 text-crypto-cyan font-bold" : ""
                        }`}
                      >
                        <span className="truncate">
                          <span className="font-bold">{c.short}</span>{" "}
                          <span className="text-muted-foreground text-[10px]">({c.name})</span>
                        </span>
                        {on && <span className="text-[10px]">✓</span>}
                      </button>
                    );
                  })}
                  {results.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">Nenhuma moeda encontrada</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={interval} onValueChange={setInterval_}>
            <SelectTrigger className="h-8 w-[90px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  Últimos {d} dias
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={loading || symbols.length === 0}
            className="h-8 text-xs bg-crypto-cyan text-black hover:bg-crypto-cyan/80 font-bold"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            {loading ? "Baixando..." : `Baixar histórico (${symbols.length} moeda${symbols.length === 1 ? "" : "s"})`}
          </Button>
          <span className="text-[10px] text-muted-foreground">O motor dos robôs usa candles de 1h.</span>
        </div>

        {coverage.length > 0 ? (
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-secondary/30 text-muted-foreground">
                <tr>
                  <th className="text-left px-2.5 py-1.5 font-semibold">Ativo</th>
                  <th className="text-left px-2.5 py-1.5 font-semibold">Intervalo</th>
                  <th className="text-right px-2.5 py-1.5 font-semibold">Candles</th>
                  <th className="text-right px-2.5 py-1.5 font-semibold">Período</th>
                  <th className="px-1.5 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {coverage.map((r) => (
                  <tr key={`${r.symbol}-${r.interval}`} className="border-t border-border/20">
                    <td className="px-2.5 py-1 font-semibold">{r.symbol.replace("USDT", "/USDT")}</td>
                    <td className="px-2.5 py-1">{r.interval}</td>
                    <td className="px-2.5 py-1 text-right font-mono">{r.total.toLocaleString("pt-BR")}</td>
                    <td className="px-2.5 py-1 text-right text-muted-foreground">
                      {fmtDate(r.from)} → {fmtDate(r.to)}
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={loading}
                        onClick={() => runDownload([r.symbol], r.interval)}
                        className="h-6 w-6"
                        title={`Atualizar ${r.symbol} ${r.interval}: completa os últimos ${days} dias até agora`}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Nenhum histórico baixado ainda.</p>
        )}
      </CardContent>
    </Card>
  );
}
