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

const FALLBACK_NEWS_DATA: NewsItem[] = [
  {
    id: "n1",
    title: "Bitcoin Surges Past Key Resistance Level Amid Institutional Buying",
    source: "CoinDesk",
    timeAgo: "12m ago",
    category: "Market",
    summary: "BTC breaks through the $80K resistance as institutional inflows accelerate, signaling renewed bullish momentum.",
    fullSummary: "Bitcoin has surged past the critical $80,000 resistance level, driven by significant institutional buying pressure. On-chain data shows large wallet accumulations exceeding 1,200 BTC per day over the past week. Major players including MicroStrategy and sovereign wealth funds have been increasing their positions.",
    url: "#",
  },
  {
    id: "n2",
    title: "Ethereum Layer 2 Solutions See Record Transaction Volume",
    source: "The Block",
    timeAgo: "28m ago",
    category: "Tech",
    summary: "L2 networks process over 12M daily transactions as gas fees on mainnet remain elevated.",
    fullSummary: "Ethereum Layer 2 scaling solutions including Arbitrum, Optimism, and Base have collectively processed a record 12.4 million daily transactions, a 340% increase from the same period last year. The surge coincides with elevated mainnet gas fees averaging 45 gwei.",
    url: "#",
  },
  {
    id: "n3",
    title: "Fed Policy Update: Implications for Crypto Markets",
    source: "Bloomberg",
    timeAgo: "1h ago",
    category: "Regulation",
    summary: "Fed signals potential rate cuts in Q2, historically positive for risk assets including crypto.",
    fullSummary: "Federal Reserve Chair Jerome Powell indicated the central bank is nearing a pivot point, with potential rate cuts possible as early as Q2 2025. Historically, loose monetary policy has been bullish for risk assets including cryptocurrencies.",
    url: "#",
  },
  {
    id: "n4",
    title: "DeFi Total Value Locked Reaches New Monthly High",
    source: "DeFi Pulse",
    timeAgo: "1h ago",
    category: "DeFi",
    summary: "TVL across all DeFi protocols hits $185B as yield farming and restaking gain traction.",
    fullSummary: "The total value locked (TVL) across decentralized finance protocols has reached $185 billion, a new monthly high and the highest level since May 2022. Liquid staking derivatives and restaking protocols have been primary drivers.",
    url: "#",
  },
  {
    id: "n5",
    title: "Solana DEX Volume Overtakes Ethereum for Third Consecutive Week",
    source: "CoinTelegraph",
    timeAgo: "2h ago",
    category: "Trading",
    summary: "SOL-based DEXs process $14.2B weekly volume as memecoin trading and airdrop farming surge.",
    fullSummary: "Solana decentralized exchanges have processed $14.2 billion in weekly trading volume, surpassing Ethereum's $11.8 billion for the third consecutive week. Jupiter, the dominant Solana DEX aggregator, handled 68% of the volume.",
    url: "#",
  },
  {
    id: "n6",
    title: "SEC Approves New Spot Crypto ETF Applications",
    source: "Reuters",
    timeAgo: "3h ago",
    category: "Regulation",
    summary: "Regulatory green light for additional spot crypto ETFs expands institutional access to digital assets.",
    fullSummary: "The U.S. Securities and Exchange Commission has approved applications for several new spot cryptocurrency ETFs, including those tracking Solana and Litecoin. The approvals follow the successful launch of Bitcoin and Ethereum spot ETFs in 2024.",
    url: "#",
  },
  {
    id: "n7",
    title: "AI-Powered Trading Bots Outperform Traditional Strategies in Q1",
    source: "CryptoSlate",
    timeAgo: "4h ago",
    category: "Trading",
    summary: "Machine learning trading systems deliver 23% average returns versus 8% for rule-based strategies.",
    fullSummary: "AI-powered cryptocurrency trading bots have significantly outperformed traditional rule-based strategies in Q1 2025, delivering average returns of 23.4% compared to 8.1% for conventional algorithmic approaches.",
    url: "#",
  },
  {
    id: "n8",
    title: "Cross-Chain Bridge Protocol Raises $120M in Series B Funding",
    source: "TechCrunch",
    timeAgo: "5h ago",
    category: "Tech",
    summary: "Interoperability infrastructure continues to attract major venture capital investment.",
    fullSummary: "Cross-chain bridge protocol Nexus has closed a $120 million Series B funding round led by Paradigm and Andreessen Horowitz, valuing the company at $2.4 billion. The protocol enables trustless asset transfers across 15 blockchains.",
    url: "#",
  },
  {
    id: "n9",
    title: "Bitcoin Mining Difficulty Adjusts to All-Time High After Halving",
    source: "Blockchain.com",
    timeAgo: "6h ago",
    category: "Market",
    summary: "Network security strengthens as miners deploy next-gen hardware to maintain profitability post-reward reduction.",
    fullSummary: "Bitcoin mining difficulty has reached an all-time high following the latest adjustment, increasing by 4.2% to 86.39T. Despite the block reward halving, miners have rapidly deployed next-generation ASIC hardware.",
    url: "#",
  },
  {
    id: "n10",
    title: "DeFi Lending Protocols Implement Dynamic Risk Parameters",
    source: "The Defiant",
    timeAgo: "8h ago",
    category: "DeFi",
    summary: "Major lending platforms adopt AI-driven risk models to automatically adjust collateral ratios and liquidation thresholds.",
    fullSummary: "Leading DeFi lending protocols Aave v4 and Compound v3 have implemented dynamic risk parameters powered by machine learning models developed by Gauntlet and Chaos Labs.",
    url: "#",
  },
];

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

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
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
  const [lastUpdated, setLastUpdated] = useState<string>(
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );

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
            ? Array.from(new Set(ev.articles.map((a: any) => a.source))).join(", ") 
            : "TrendRadar",
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
          new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        );
      } else {
        // Fall back to mock data
        setNewsItems(FALLBACK_NEWS_DATA);
        setIsLiveData(false);
      }
    } catch {
      // Fall back to mock data on error
      setNewsItems(FALLBACK_NEWS_DATA);
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
                {lastUpdated}
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
