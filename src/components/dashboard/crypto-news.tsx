"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, RefreshCw, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type NewsCategory = "Market" | "DeFi" | "Regulation" | "Tech" | "Trading";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  timeAgo: string;
  category: NewsCategory;
  summary: string;
  fullSummary: string;
}

const NEWS_DATA: NewsItem[] = [
  {
    id: "n1",
    title: "Bitcoin Surges Past Key Resistance Level Amid Institutional Buying",
    source: "CoinDesk",
    timeAgo: "12m ago",
    category: "Market",
    summary: "BTC breaks through the $80K resistance as institutional inflows accelerate, signaling renewed bullish momentum.",
    fullSummary: "Bitcoin has surged past the critical $80,000 resistance level, driven by significant institutional buying pressure. On-chain data shows large wallet accumulations exceeding 1,200 BTC per day over the past week. Major players including MicroStrategy and sovereign wealth funds have been increasing their positions. The breakout above this key level suggests a potential move toward the next resistance at $85,000, with analysts pointing to the upcoming halving cycle as a catalyst for further upside.",
  },
  {
    id: "n2",
    title: "Ethereum Layer 2 Solutions See Record Transaction Volume",
    source: "The Block",
    timeAgo: "28m ago",
    category: "Tech",
    summary: "L2 networks process over 12M daily transactions as gas fees on mainnet remain elevated.",
    fullSummary: "Ethereum Layer 2 scaling solutions including Arbitrum, Optimism, and Base have collectively processed a record 12.4 million daily transactions, a 340% increase from the same period last year. The surge coincides with elevated mainnet gas fees averaging 45 gwei, pushing users toward cheaper alternatives. Base alone accounted for 4.2M transactions, driven by social media and gaming dApps. Developers cite improved blob space utilization from EIP-4844 as a key enabler of the growth.",
  },
  {
    id: "n3",
    title: "Fed Policy Update: Implications for Crypto Markets",
    source: "Bloomberg",
    timeAgo: "1h ago",
    category: "Regulation",
    summary: "Fed signals potential rate cuts in Q2, historically positive for risk assets including crypto.",
    fullSummary: "Federal Reserve Chair Jerome Powell indicated the central bank is nearing a pivot point, with potential rate cuts possible as early as Q2 2025. Historically, loose monetary policy has been bullish for risk assets including cryptocurrencies. The crypto market cap surged 3.2% within hours of the announcement. Analysts note that Bitcoin has rallied an average of 45% in the 90 days following the first rate cut in previous cycles. However, inflation data remains mixed, and the Fed maintains a data-dependent approach.",
  },
  {
    id: "n4",
    title: "DeFi Total Value Locked Reaches New Monthly High",
    source: "DeFi Pulse",
    timeAgo: "1h ago",
    category: "DeFi",
    summary: "TVL across all DeFi protocols hits $185B as yield farming and restaking gain traction.",
    fullSummary: "The total value locked (TVL) across decentralized finance protocols has reached $185 billion, a new monthly high and the highest level since May 2022. Liquid staking derivatives (LSDs) and restaking protocols like EigenLayer have been primary drivers, accounting for $42B of the total. Lido remains the dominant player with a 32% market share. Yield farming on newer chains including Solana and Avalanche has also contributed to growth, with APYs ranging from 8-25% attracting fresh capital.",
  },
  {
    id: "n5",
    title: "Solana DEX Volume Overtakes Ethereum for Third Consecutive Week",
    source: "CoinTelegraph",
    timeAgo: "2h ago",
    category: "Trading",
    summary: "SOL-based DEXs process $14.2B weekly volume as memecoin trading and airdrop farming surge.",
    fullSummary: "Solana decentralized exchanges have processed $14.2 billion in weekly trading volume, surpassing Ethereum's $11.8 billion for the third consecutive week. Jupiter, the dominant Solana DEX aggregator, handled 68% of the volume. The surge is attributed to memecoin trading, with tokens like BONK and WIF generating billions in daily volume. Airdrop farming on protocols like Jito and Pyth Network continues to attract users. Despite the volume lead, Ethereum maintains higher TVL and larger average trade sizes.",
  },
  {
    id: "n6",
    title: "SEC Approves New Spot Crypto ETF Applications",
    source: "Reuters",
    timeAgo: "3h ago",
    category: "Regulation",
    summary: "Regulatory green light for additional spot crypto ETFs expands institutional access to digital assets.",
    fullSummary: "The U.S. Securities and Exchange Commission has approved applications for several new spot cryptocurrency ETFs, including those tracking Solana and Litecoin. The approvals follow the successful launch of Bitcoin and Ethereum spot ETFs in 2024. The new ETFs are expected to begin trading within 60 days and could attract $15-25 billion in inflows within the first year, according to JPMorgan estimates. The move signals a broader regulatory shift toward accommodating digital assets within traditional financial infrastructure.",
  },
  {
    id: "n7",
    title: "AI-Powered Trading Bots Outperform Traditional Strategies in Q1",
    source: "CryptoSlate",
    timeAgo: "4h ago",
    category: "Trading",
    summary: "Machine learning trading systems deliver 23% average returns versus 8% for rule-based strategies.",
    fullSummary: "AI-powered cryptocurrency trading bots have significantly outperformed traditional rule-based strategies in Q1 2025, delivering average returns of 23.4% compared to 8.1% for conventional algorithmic approaches. The top-performing models utilized transformer-based architectures trained on multi-modal data including on-chain metrics, social sentiment, and order book dynamics. Key advantages included faster adaptation to regime changes and better risk management during high-volatility events. However, researchers caution that overfitting remains a concern and that past performance may not guarantee future results.",
  },
  {
    id: "n8",
    title: "Cross-Chain Bridge Protocol Raises $120M in Series B Funding",
    source: "TechCrunch",
    timeAgo: "5h ago",
    category: "Tech",
    summary: "Interoperability infrastructure continues to attract major venture capital investment.",
    fullSummary: "Cross-chain bridge protocol Nexus has closed a $120 million Series B funding round led by Paradigm and Andreessen Horowitz, valuing the company at $2.4 billion. The protocol enables trustless asset transfers across 15 blockchains with an average settlement time of 12 seconds. The funding will be used to expand to 25 additional chains and develop zero-knowledge proof-based verification for enhanced security. The raise highlights continued venture capital confidence in cross-chain infrastructure despite the sector's history of security incidents.",
  },
  {
    id: "n9",
    title: "Bitcoin Mining Difficulty Adjusts to All-Time High After Halving",
    source: "Blockchain.com",
    timeAgo: "6h ago",
    category: "Market",
    summary: "Network security strengthens as miners deploy next-gen hardware to maintain profitability post-reward reduction.",
    fullSummary: "Bitcoin mining difficulty has reached an all-time high following the latest adjustment, increasing by 4.2% to 86.39T. Despite the block reward halving, miners have rapidly deployed next-generation ASIC hardware including the Bitmain S21 XP and MicroBT M60, which offer 30-40% better energy efficiency. The network hashrate has recovered to 620 EH/s, just 8% below pre-halving levels. Mining pools report that operations with electricity costs below $0.05/kWh remain profitable, while marginal miners have been forced to consolidate or exit.",
  },
  {
    id: "n10",
    title: "DeFi Lending Protocols Implement Dynamic Risk Parameters",
    source: "The Defiant",
    timeAgo: "8h ago",
    category: "DeFi",
    summary: "Major lending platforms adopt AI-driven risk models to automatically adjust collateral ratios and liquidation thresholds.",
    fullSummary: "Leading DeFi lending protocols Aave v4 and Compound v3 have implemented dynamic risk parameters powered by machine learning models developed by Gauntlet and Chaos Labs. The systems automatically adjust collateral ratios, borrow caps, and liquidation thresholds based on real-time market volatility, correlation data, and liquidity depth. During a recent 15% market dip, the dynamic system reduced collateral ratios by 8% pre-emptively, preventing $340M in liquidations that would have occurred under static parameters. The approach marks a significant evolution in decentralized risk management.",
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

export function CryptoNews() {
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory | "All">("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>(NEWS_DATA);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );

  const filteredNews = useMemo(() => {
    if (selectedCategory === "All") return newsItems;
    return newsItems.filter((n) => n.category === selectedCategory);
  }, [newsItems, selectedCategory]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Shuffle the news items
    setNewsItems((prev) => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
    setLastUpdated(
      new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    );
    setExpandedId(null);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

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
              Crypto News Feed
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
              >
                <RefreshCw
                  className={cn("w-3 h-3 text-crypto-cyan", refreshing && "animate-spin")}
                />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Category Filters */}
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] cursor-pointer transition-colors",
                selectedCategory === "All"
                  ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                  : "hover:bg-secondary/50"
              )}
              onClick={() => setSelectedCategory("All")}
            >
              All
            </Badge>
            {CATEGORIES.map((cat) => (
              <Badge
                key={cat}
                variant="outline"
                className={cn(
                  "text-[10px] cursor-pointer transition-colors",
                  selectedCategory === cat
                    ? CATEGORY_COLORS[cat]
                    : "hover:bg-secondary/50"
                )}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>

          {/* News List */}
          <div className="space-y-2 max-h-96 overflow-y-auto cyan-scrollbar">
            <AnimatePresence mode="popLayout">
              {filteredNews.map((item) => {
                const isExpanded = expandedId === item.id;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "glass-card p-2.5 cursor-pointer transition-colors hover:bg-secondary/30",
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
                          <span className="text-[9px] text-muted-foreground shrink-0">
                            {item.source}
                          </span>
                          <span className="text-[9px] text-muted-foreground shrink-0">
                            · {item.timeAgo}
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
                                {item.fullSummary}
                              </p>
                              <div className="flex items-center gap-1 mt-1.5 text-crypto-cyan">
                                <ExternalLink className="w-3 h-3" />
                                <span className="text-[10px]">Read full article</span>
                              </div>
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
          </div>

          {filteredNews.length === 0 && (
            <div className="empty-state py-6">
              <p className="empty-state-title">No news found</p>
              <p className="empty-state-desc">Try selecting a different category</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
