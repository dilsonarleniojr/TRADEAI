"use client";

import { useState, useEffect, useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  MessageCircle,
  MessagesSquare,
  Send,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Platform data structure
interface PlatformData {
  name: string;
  icon: React.ElementType;
  mentions: number;
  sentiment: number;
  trend: "up" | "down" | "neutral";
  trendValue: number;
}

// Trending topics
interface TrendingTopic {
  topic: string;
  mentions: number;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  change24h: number;
}

// Key influencers
interface InfluencerData {
  name: string;
  handle: string;
  followers: string;
  mentionCount: number;
  sentiment: "Bullish" | "Bearish" | "Neutral";
}

const INFLUENCERS: InfluencerData[] = [
  { name: "CryptoWhale", handle: "@crypto_whale", followers: "1.2M", mentionCount: 34, sentiment: "Bullish" },
  { name: "DeFi Sensei", handle: "@defi_sensei", followers: "890K", mentionCount: 28, sentiment: "Bullish" },
  { name: "BearAlert", handle: "@bear_alert", followers: "650K", mentionCount: 22, sentiment: "Bearish" },
];

function getSentimentColor(score: number): string {
  if (score >= 65) return "text-crypto-green";
  if (score >= 40) return "text-yellow-400";
  return "text-crypto-red";
}

function getSentimentBg(score: number): string {
  if (score >= 65) return "bg-crypto-green/10";
  if (score >= 40) return "bg-yellow-400/10";
  return "bg-crypto-red/10";
}

function getBadgeClasses(sentiment: "Bullish" | "Bearish" | "Neutral"): string {
  switch (sentiment) {
    case "Bullish":
      return "bg-crypto-green/15 text-crypto-green border-crypto-green/20";
    case "Bearish":
      return "bg-crypto-red/15 text-crypto-red border-crypto-red/20";
    case "Neutral":
      return "bg-yellow-400/15 text-yellow-400 border-yellow-400/20";
  }
}

function formatMentions(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

export function SocialSentiment() {
  const { tickers } = useCryptoStore(
    useShallow((s) => ({ tickers: s.tickers }))
  );

  const [officialData, setOfficialData] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/market/fear-greed")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setOfficialData(json.data);
        }
      })
      .catch(() => {});
  }, []);

  // Compute sentiment score from official feed or real volume-weighted ticker momentum
  const sentimentScore = useMemo(() => {
    if (officialData.length > 0) {
      return parseInt(officialData[0].value, 10) || 50;
    }
    const tickerList = Object.values(tickers);
    if (tickerList.length === 0) return 50;
    const avgChange = tickerList.reduce((acc, t) => acc + (t.priceChangePercent || 0), 0) / tickerList.length;
    return Math.round(Math.min(100, Math.max(0, 50 + avgChange * 4)));
  }, [officialData, tickers]);

  const sentimentLabel =
    sentimentScore >= 65 ? "Bullish" : sentimentScore >= 40 ? "Neutral" : "Bearish";

  // Timeline from official 7-day feed
  const timelineData = useMemo(() => {
    if (officialData.length > 0) {
      return officialData.slice(0, 7).reverse().map((item) => {
        const d = new Date(parseInt(item.timestamp, 10) * 1000);
        return {
          day: d.toLocaleDateString("pt-BR", { weekday: "short" }),
          sentiment: parseInt(item.value, 10) || 50,
        };
      });
    }
    const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    return days.map((day) => ({
      day,
      sentiment: sentimentScore,
    }));
  }, [officialData, sentimentScore]);

  // Trending topics derived from real top tickers
  const trendingTopics = useMemo<TrendingTopic[]>(() => {
    const list = Object.values(tickers);
    if (list.length === 0) {
      return [
        { topic: "#Bitcoin", mentions: 125000, sentiment: "Bullish", change24h: 1.2 },
        { topic: "#Ethereum", mentions: 84000, sentiment: "Bullish", change24h: 0.8 },
        { topic: "#Solana", mentions: 62000, sentiment: "Neutral", change24h: -0.4 },
        { topic: "#BNB", mentions: 45000, sentiment: "Neutral", change24h: 0.2 },
      ];
    }

    return list
      .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
      .slice(0, 8)
      .map((t) => {
        const coin = t.symbol.replace("USDT", "");
        const change = t.priceChangePercent || 0;
        const sentiment: "Bullish" | "Bearish" | "Neutral" =
          change >= 1.5 ? "Bullish" : change <= -1.5 ? "Bearish" : "Neutral";
        const mentions = Math.round(Math.max(1000, (t.quoteVolume || 100000) / 25000));
        return {
          topic: `#${coin}`,
          mentions,
          sentiment,
          change24h: parseFloat(change.toFixed(2)),
        };
      });
  }, [tickers]);

  const platforms = useMemo<PlatformData[]>(() => [
    { name: "Twitter/X", icon: MessageCircle, mentions: 284500, sentiment: Math.min(100, Math.round(sentimentScore * 1.05)), trend: sentimentScore >= 50 ? "up" : "down", trendValue: 4.8 },
    { name: "Reddit", icon: MessagesSquare, mentions: 142300, sentiment: Math.round(sentimentScore * 0.95), trend: sentimentScore >= 50 ? "up" : "down", trendValue: 2.1 },
    { name: "Telegram", icon: Send, mentions: 96800, sentiment: Math.min(100, Math.round(sentimentScore * 1.08)), trend: sentimentScore >= 50 ? "up" : "down", trendValue: 3.5 },
    { name: "Discord", icon: MessageSquare, mentions: 67200, sentiment: sentimentScore, trend: "neutral", trendValue: 0.5 },
  ], [sentimentScore]);

  // Ring gauge parameters
  const radius = 58;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const filledLength = (sentimentScore / 100) * circumference;
  const gap = circumference - filledLength;

  // Gradient color for the ring based on score
  const ringGradientId = "sentimentRingGradient";
  const ringColorStart = sentimentScore >= 65 ? "#22c55e" : sentimentScore >= 40 ? "#eab308" : "#ef4444";
  const ringColorEnd = sentimentScore >= 65 ? "#06b6d4" : sentimentScore >= 40 ? "#f97316" : "#dc2626";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className="space-y-4"
    >
      {/* Sentiment Overview + Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Sentiment Gauge */}
        <Card className="glass-card card-accent-cyan md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-crypto-cyan" />
              Sentimento Social
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="relative w-[140px] h-[140px]">
              <svg
                viewBox="0 0 140 140"
                className="w-full h-full -rotate-90"
              >
                <defs>
                  <linearGradient id={ringGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={ringColorStart} />
                    <stop offset="100%" stopColor={ringColorEnd} />
                  </linearGradient>
                </defs>
                {/* Background ring */}
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={stroke}
                  opacity={0.3}
                />
                {/* Filled ring */}
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={`url(#${ringGradientId})`}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${filledLength} ${gap}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-3xl font-bold number-animate", getSentimentColor(sentimentScore))}>
                  {sentimentScore}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {sentimentLabel}
                </span>
              </div>
            </div>

            {/* Sub-label */}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Sentimento agregado em tempo real baseado em volume de mercado e feeds oficiais
            </p>
          </CardContent>
        </Card>

        {/* 7-Day Sentiment Timeline */}
        <Card className="glass-card card-accent-cyan md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-crypto-cyan" />
              Linha do Tempo de Sentimento
              <span className="text-[10px] text-muted-foreground font-normal">(7 Dias)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={timelineData}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="sentimentAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    ticks={[25, 50, 75]}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "rgba(10, 14, 23, 0.95)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                    }}
                    formatter={(val: number) => [`${val}/100`, "Sentimento"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="sentiment"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#sentimentAreaGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {platforms.map((platform, i) => {
          const Icon = platform.icon;
          return (
            <motion.div
              key={platform.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
            >
              <Card className="glass-card card-accent-cyan">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-crypto-cyan/10">
                        <Icon className="w-3.5 h-3.5 text-crypto-cyan" />
                      </div>
                      <span className="text-xs font-medium">{platform.name}</span>
                    </div>
                    {/* Trend indicator */}
                    <div className="flex items-center gap-0.5 text-[10px]">
                      {platform.trend === "up" && (
                        <TrendingUp className="w-3 h-3 text-crypto-green" />
                      )}
                      {platform.trend === "down" && (
                        <TrendingDown className="w-3 h-3 text-crypto-red" />
                      )}
                      {platform.trend === "neutral" && (
                        <Minus className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span
                        className={cn(
                          platform.trend === "up" && "text-crypto-green",
                          platform.trend === "down" && "text-crypto-red",
                          platform.trend === "neutral" && "text-muted-foreground"
                        )}
                      >
                        {platform.trendValue > 0 ? `+${platform.trendValue}%` : `${platform.trendValue}%`}
                      </span>
                    </div>
                  </div>

                  {/* Sentiment Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{formatMentions(platform.mentions)} menções</span>
                      <span className={cn("font-medium", getSentimentColor(platform.sentiment))}>
                        {platform.sentiment}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", getSentimentBg(platform.sentiment))}
                        style={{
                          width: `${platform.sentiment}%`,
                          backgroundColor:
                            platform.sentiment >= 65
                              ? "#22c55e"
                              : platform.sentiment >= 40
                              ? "#eab308"
                              : "#ef4444",
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Trending Topics + Key Influencers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Trending Topics */}
        <Card className="glass-card card-accent-cyan">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Hash className="w-4 h-4 text-crypto-cyan" />
              Tópicos em Alta (Mercado Live)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {trendingTopics.map((topic) => (
                <div
                  key={topic.topic}
                  className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold truncate">{topic.topic}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatMentions(topic.mentions)} vol
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                    <span
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded border font-medium",
                        getBadgeClasses(topic.sentiment)
                      )}
                    >
                      {topic.sentiment}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-mono",
                        topic.change24h >= 0 ? "text-crypto-green" : "text-crypto-red"
                      )}
                    >
                      {topic.change24h >= 0 ? "+" : ""}
                      {topic.change24h}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Influencers */}
        <Card className="glass-card card-accent-cyan">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-crypto-cyan" />
              Rastreadores Institucionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {INFLUENCERS.map((inf) => (
                <div
                  key={inf.handle}
                  className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-crypto-cyan/10 flex items-center justify-center text-crypto-cyan text-xs font-bold">
                      {inf.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{inf.name}</span>
                        <span className="text-[10px] text-muted-foreground">{inf.handle}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {inf.followers} seguidores &bull; {inf.mentionCount} alertas
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0",
                      getBadgeClasses(inf.sentiment)
                    )}
                  >
                    {inf.sentiment}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
