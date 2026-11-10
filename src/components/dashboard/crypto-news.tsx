"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, RefreshCw, Clock, ExternalLink, Loader2, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type NewsCategory = "Market" | "DeFi" | "Regulation" | "Tech" | "Trading";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  timeAgo?: string;
  category: NewsCategory;
  summary: string;
  fullSummary?: string;
  timestamp?: string;
  url?: string;
  confidenceScore?: number;
  relevanceExplain?: string;
}

interface ApiResponse {
  success: boolean;
  data: NewsItem[];
  cached?: boolean;
  lastUpdated?: string;
  error?: string;
}

const CATEGORIES: NewsCategory[] = ["Market", "DeFi", "Regulation", "Tech", "Trading"];

const CATEGORY_COLORS: Record<NewsCategory, string> = {
  Market: "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30",
  DeFi: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Regulation: "bg-crypto-gold/15 text-crypto-gold border-crypto-gold/30",
  Tech: "bg-crypto-green/15 text-crypto-green border-crypto-green/30",
  Trading: "bg-crypto-red/15 text-crypto-red border-crypto-red/30",
};

const CATEGORY_BORDER: Record<NewsCategory, string> = {
  Market: "news-border-market",
  DeFi: "news-border-defi",
  Regulation: "news-border-regulation",
  Tech: "news-border-tech",
  Trading: "news-border-trading",
};

function formatTimestamp(timestamp?: string, timeAgo?: string): string {
  if (timeAgo) return timeAgo;
  if (!timestamp || timestamp === 'N/A') return 'Recently';
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins} min atrás`;
    if (diffHours < 24) return `${diffHours} h atrás`;
    if (diffDays < 7) return `${diffDays} d atrás`;
    return date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recentemente';
  }
}

function NewsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="glass-card p-2.5 animate-pulse">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="h-4 w-14 rounded bg-secondary/50" />
            <div className="h-3 w-16 rounded bg-secondary/30" />
          </div>
          <div className="h-3 w-full rounded bg-secondary/40 mb-1" />
          <div className="h-3 w-3/4 rounded bg-secondary/30" />
        </div>
      ))}
    </div>
  );
}

export function CryptoNews() {
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory | "All">("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchNews = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetch('/api/news');
      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        const mappedData = result.data.map((ev: any) => ({
          id: ev.id,
          title: ev.title,
          source: ev.articles && ev.articles.length > 0 
            ? Array.from(new Set(ev.articles.map((a: any) => a.source || a.sourceName || "Cointelegraph"))).join(", ") 
            : "Cointelegraph",
          category: ev.category as NewsCategory,
          summary: ev.summary.split("\n\n")[0].replace("**Resumo:** ", ""),
          fullSummary: ev.summary,
          timestamp: ev.createdAt,
          url: ev.articles && ev.articles.length > 0 ? ev.articles[0].sourceUrl : "#",
          confidenceScore: ev.confidenceScore,
          relevanceExplain: ev.relevanceExplain,
        }));
        setNewsItems(mappedData);
        setIsLiveData(true);
        setLastUpdated(
          new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        );
      } else {
        setNewsItems([]);
        setIsLiveData(false);
      }
    } catch {
      setNewsItems([]);
      setIsLiveData(false);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const filteredNews = useMemo(() => {
    if (selectedCategory === "All") return newsItems;
    return newsItems.filter((n) => n.category === selectedCategory);
  }, [newsItems, selectedCategory]);

  const handleRefresh = useCallback(() => {
    setExpandedId(null);
    fetchNews(true);
  }, [fetchNews]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <Card className="glass-card card-accent-cyan h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-crypto-cyan" />
              Feed de Notícias Crypto
              {isLiveData && (
                <Badge className="bg-crypto-green/20 text-crypto-green border-crypto-green/30 text-[9px] px-1.5 py-0 flex items-center gap-1">
                  <Wifi className="w-2.5 h-2.5" />
                  Live
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastUpdated || "Sincronizando..."}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="w-3 h-3 text-crypto-cyan animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 text-crypto-cyan" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Category Filters */}
          <div className="flex flex-wrap gap-1.5">
            <button
              className={cn(
                "text-[10px] cursor-pointer transition-all duration-200 px-2.5 py-1 rounded-full border",
                selectedCategory === "All"
                  ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30 shadow-sm shadow-crypto-cyan/10"
                  : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/60 hover:border-border"
              )}
              onClick={() => setSelectedCategory("All")}
            >
              Todos
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={cn(
                  "text-[10px] cursor-pointer transition-all duration-200 px-2.5 py-1 rounded-full border",
                  selectedCategory === cat
                    ? `${CATEGORY_COLORS[cat]} shadow-sm`
                    : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/60 hover:border-border"
                )}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* News List */}
          <div className="space-y-2 max-h-96 overflow-y-auto cyan-scrollbar">
            {isLoading ? (
              <NewsSkeleton />
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredNews.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const displayTime = formatTimestamp(item.timestamp, item.timeAgo);
                  const displaySource = item.source.replace(/^www\./, '');
                  const hasRealUrl = item.url && item.url !== '#';

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "glass-card p-2.5 cursor-pointer transition-all duration-200 hover:bg-secondary/30 hover:-translate-y-0.5 hover:shadow-md slide-up card-shimmer",
                        CATEGORY_BORDER[item.category],
                        isExpanded && "ring-1 ring-crypto-cyan/20"
                      )}
                      onClick={() => toggleExpand(item.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge
                              variant="outline"
                              className={cn("text-[9px] px-1.5 py-0 shrink-0", CATEGORY_COLORS[item.category])}
                            >
                              {item.category}
                            </Badge>
                            {item.confidenceScore !== undefined && (
                              <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[8px] px-1 py-0 scale-95 shrink-0">
                                Confiabilidade: {Math.round(item.confidenceScore * 100)}%
                              </Badge>
                            )}
                            <span className="text-[9px] text-muted-foreground shrink-0 truncate max-w-[100px]">
                              {displaySource}
                            </span>
                            <span className="text-[9px] text-muted-foreground shrink-0">
                              · {displayTime}
                            </span>
                          </div>
                          <h4 className="text-xs font-medium leading-tight line-clamp-2">
                            {item.title}
                          </h4>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                                  {item.fullSummary || item.summary}
                                </p>
                                {item.relevanceExplain && (
                                  <div className="mt-2 text-[10px] text-crypto-cyan/80 bg-crypto-cyan/5 px-2 py-1 rounded border border-crypto-cyan/10 flex items-center gap-1.5 font-sans">
                                    <span className="font-bold">💡 Relevância:</span> {item.relevanceExplain}
                                  </div>
                                )}
                                {hasRealUrl && (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 mt-2.5 text-crypto-cyan hover:text-crypto-cyan/80 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span className="text-[10px]">Ler artigo completo</span>
                                  </a>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {!isExpanded && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                              {item.summary}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {!isLoading && filteredNews.length === 0 && (
            <div className="empty-state py-6">
              <p className="empty-state-title">Nenhuma notícia encontrada</p>
              <p className="empty-state-desc">Tente selecionar uma categoria diferente</p>
            </div>
          )}

          {/* Data source indicator */}
          {!isLoading && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] text-muted-foreground">
                {isLiveData ? 'Fonte: API de Busca Web' : 'Fonte: Dados Locais'}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {newsItems.length} artigos
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
