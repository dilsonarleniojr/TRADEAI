"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  Clock,
  Calendar,
  Compass,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  Globe,
  ExternalLink,
} from "lucide-react";

interface NewsToTradeData {
  executiveSummary: string;
  topHeadlines: Array<{
    headline: string;
    source?: string;
    publishedAt?: string;
    url?: string;
    impactScore: string;
    sentiment: string;
  }>;
  shortTermImpact: {
    timeframe: string;
    description: string;
    affectedAssets: string[];
  };
  longTermImpact: {
    timeframe: string;
    description: string;
    macroImplications: string;
  };
  expectedPriceMovement: {
    btcRange: string;
    volatilityLevel: string;
    targetMovePercent: string;
    catalystKeyLevel: string;
  };
  suggestedPositioning: {
    action: string;
    strategy: string;
    riskWarning: string;
  };
}

export function NewsToTradeTab() {
  const [customNews, setCustomNews] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<NewsToTradeData | null>(null);

  const fetchNewsAnalysis = async (newsText = "") => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "news_to_trade",
          params: { customNews: newsText },
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error("Erro ao converter notícias em operações:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewsAnalysis();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Controls & Custom News Switch */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/40">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-cyan-400" />
            Feed Jornalístico & Análise Fundamentalista em Tempo Real
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conversão instantânea de manchetes em faixas de preço e posicionamento tático
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="text-xs border-border/60"
          >
            {showCustomInput ? "Usar Feed Automático" : "Inserir Notícia Própria"}
          </Button>

          <Button
            onClick={() => fetchNewsAnalysis(showCustomInput ? customNews : "")}
            disabled={loading}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Processando..." : "Converter Notícias"}
          </Button>
        </div>
      </div>

      {/* Optional Custom News Input */}
      {showCustomInput && (
        <Card className="border-cyan-500/30 bg-card/70 backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-cyan-300">
              Cole o texto ou comunicado da notícia que deseja converter em trade:
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={3}
              value={customNews}
              onChange={(e) => setCustomNews(e.target.value)}
              placeholder="Ex: O Federal Reserve manteve a taxa de juros inalterada e sinalizou cortes na próxima reunião..."
              className="text-xs bg-background/60"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => fetchNewsAnalysis(customNews)}
                disabled={loading || !customNews.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
              >
                Analisar Texto Inserido
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-32 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6"></div>
            <div className="h-48 rounded-xl bg-card/40 border border-border/40 animate-pulse p-6"></div>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <Card className="border-border/50 bg-gradient-to-r from-card/90 via-card/60 to-card/90 backdrop-blur-md shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-xs">
                  Resumo Executivo
                </Badge>
                <span className="text-xs text-muted-foreground">Síntese das Últimas Notícias</span>
              </div>
              <CardDescription className="text-sm font-medium text-foreground pt-2 leading-relaxed">
                {data.executiveSummary}
              </CardDescription>
            </CardHeader>

            {data.topHeadlines && data.topHeadlines.length > 0 && (
              <CardContent className="pt-0 pb-4">
                <div className="space-y-2 border-t border-border/30 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Newspaper className="w-3.5 h-3.5 text-cyan-400" />
                      Principais Manchetes Monitoradas:
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {data.topHeadlines.length} fontes consolidadas
                    </span>
                  </div>
                  {data.topHeadlines.map((h, i) => {
                    const cleanUrl = h.url ? h.url.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
                    return (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs py-2 px-3 rounded-lg bg-background/60 hover:bg-background/90 border border-border/40 transition-colors"
                      >
                        <div className="flex flex-col gap-1 min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {cleanUrl ? (
                              <a
                                href={cleanUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-foreground hover:text-cyan-400 flex items-center gap-1 group transition-colors"
                              >
                                <span className="line-clamp-1">{h.headline}</span>
                                <ExternalLink className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100 text-cyan-400" />
                              </a>
                            ) : (
                              <span className="font-medium text-foreground line-clamp-1">{h.headline}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1 text-cyan-400 font-medium">
                              <Globe className="w-3 h-3 shrink-0" />
                              {h.source || "Cointelegraph"}
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground/80">
                              <Calendar className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                              {h.publishedAt || "Hoje"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-medium ${
                              h.sentiment === "Altista"
                                ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                                : h.sentiment === "Baixista"
                                ? "text-rose-400 border-rose-500/40 bg-rose-500/10"
                                : "text-amber-400 border-amber-500/40 bg-amber-500/10"
                            }`}
                          >
                            {h.sentiment}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/60">
                            Impacto {h.impactScore}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Short Term vs Long Term Impact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Impacto de Curto Prazo */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between text-cyan-400">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Impacto de Curto Prazo (Intraday)
                  </span>
                  <Badge variant="outline" className="text-[10px] border-border/60">
                    {data.shortTermImpact.timeframe}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-muted-foreground leading-relaxed">
                  {data.shortTermImpact.description}
                </p>
                <div className="pt-2 border-t border-border/30 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">Ativos mais afetados:</span>
                  {data.shortTermImpact.affectedAssets.map((asset, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                      {asset}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Impacto de Longo Prazo */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between text-emerald-400">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Impacto de Longo Prazo (Estrutural)
                  </span>
                  <Badge variant="outline" className="text-[10px] border-border/60">
                    {data.longTermImpact.timeframe}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-muted-foreground leading-relaxed">
                  {data.longTermImpact.description}
                </p>
                <div className="p-2 rounded bg-background/50 border border-border/30 text-[11px]">
                  <span className="font-semibold text-foreground block mb-0.5">Implicações Macroeconômicas:</span>
                  <span className="text-muted-foreground">{data.longTermImpact.macroImplications}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Price Range & Positioning Guidance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Faixa de Movimento Esperada */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                  <TrendingUp className="w-4 h-4" />
                  Faixa de Movimento de Preço Esperada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 rounded bg-background/50 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">Faixa Estimada BTC</div>
                    <div className="font-bold text-sm text-foreground">{data.expectedPriceMovement.btcRange}</div>
                  </div>
                  <div className="p-2.5 rounded bg-background/50 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">Variação Esperada</div>
                    <div className="font-bold text-sm text-cyan-400">{data.expectedPriceMovement.targetMovePercent}</div>
                  </div>
                </div>
                <div className="p-2.5 rounded bg-muted/20 border border-border/30 text-[11px]">
                  <span className="font-semibold text-foreground block mb-0.5">Nível de Invalidação / Catalisador:</span>
                  <span className="text-muted-foreground">{data.expectedPriceMovement.catalystKeyLevel}</span>
                </div>
              </CardContent>
            </Card>

            {/* Posicionamento Sugerido */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-cyan-300">
                  <Compass className="w-4 h-4" />
                  Posicionamento Sugerido & Gestão Tática
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded bg-background/50 border border-border/30">
                  <span className="text-muted-foreground">Postura Recomendada:</span>
                  <Badge className="bg-cyan-600 text-white font-bold text-xs">{data.suggestedPositioning.action}</Badge>
                </div>
                <div className="p-2.5 rounded bg-background/50 border border-border/30 text-[11px] leading-relaxed">
                  <span className="font-semibold text-foreground block mb-0.5">Estratégia de Execução:</span>
                  <span className="text-muted-foreground">{data.suggestedPositioning.strategy}</span>
                </div>
                <div className="p-2 rounded bg-rose-950/20 border border-rose-900/30 text-rose-300 text-[11px] flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{data.suggestedPositioning.riskWarning}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
