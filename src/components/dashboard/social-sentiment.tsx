"use client";

import { useMemo } from "react";
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

// Seeded random for consistent mock data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Overall sentiment score (0-100)
const OVERALL_SENTIMENT = 64;

// Platform data
interface PlatformData {
  name: string;
  icon: React.ElementType;
  mentions: number;
  sentiment: number;
  trend: "up" | "down" | "neutral";
  trendValue: number;
}

const PLATFORMS: PlatformData[] = [
  { name: "Twitter/X", icon: MessageCircle, mentions: 284500, sentiment: 68, trend: "up", trendValue: 5.2 },
  { name: "Reddit", icon: MessagesSquare, mentions: 142300, sentiment: 58, trend: "up", trendValue: 2.1 },
  { name: "Telegram", icon: Send, mentions: 96800, sentiment: 72, trend: "down", trendValue: -1.8 },
  { name: "Discord", icon: MessageSquare, mentions: 67200, sentiment: 55, trend: "neutral", trendValue: 0.3 },
];

// Trending topics
interface TrendingTopic {
  topic: string;
  mentions: number;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  change24h: number;
}

function generateTrendingTopics(seed: number): TrendingTopic[] {
  const rng = seededRandom(seed);
  const topics: TrendingTopic[] = [
    { topic: "#Bitcoin", mentions: 0, sentiment: "Bullish", change24h: 0 },
    { topic: "#Ethereum", mentions: 0, sentiment: "Bullish", change24h: 0 },
    { topic: "#DeFi", mentions: 0, sentiment: "Neutral", change24h: 0 },
    { topic: "#Solana", mentions: 0, sentiment: "Bearish", change24h: 0 },
    { topic: "#NFTs", mentions: 0, sentiment: "Bearish", change24h: 0 },
    { topic: "#Layer2", mentions: 0, sentiment: "Bullish", change24h: 0 },
    { topic: "#Altcoins", mentions: 0, sentiment: "Neutral", change24h: 0 },
    { topic: "#Memecoins", mentions: 0, sentiment: "Bearish", change24h: 0 },
  ];

  const sentimentOptions: Array<"Bullish" | "Bearish" | "Neutral"> = ["Bullish", "Bearish", "Neutral"];
  topics.forEach((t) => {
    t.mentions = Math.floor(15000 + rng() * 120000);
    t.sentiment = sentimentOptions[Math.floor(rng() * 3)];
    t.change24h = parseFloat((-15 + rng() * 30).toFixed(1));
  });

  return topics;
}

// 7-day sentiment timeline
function generateSentimentTimeline(seed: number) {
  const rng = seededRandom(seed);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((day) => ({
    day,
    sentiment: Math.floor(45 + rng() * 35),
  }));
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
  const trendingTopics = useMemo(() => generateTrendingTopics(42), []);
  const timelineData = useMemo(() => generateSentimentTimeline(88), []);

  const sentimentScore = OVERALL_SENTIMENT;
  const sentimentLabel =
    sentimentScore >= 65 ? "Bullish" : sentimentScore >= 40 ? "Neutral" : "Bearish";

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
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-crypto-red" />
                <span className="text-[10px] text-muted-foreground">Baixa</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-[10px] text-muted-foreground">Neutro</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-crypto-green" />
                <span className="text-[10px] text-muted-foreground">Alta</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Timeline */}
        <Card className="glass-card card-accent-cyan md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-crypto-cyan" />
              Linha do Tempo do Sentimento
              <span className="text-[10px] text-muted-foreground font-normal">(7 Dias)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={timelineData}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[30, 90]}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number) => [`${value}`, "Sentimento"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="sentiment"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#sentimentGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PLATFORMS.map((platform, i) => {
          const Icon = platform.icon;
          const TrendIcon =
            platform.trend === "up"
              ? TrendingUp
              : platform.trend === "down"
                ? TrendingDown
                : Minus;
          const trendColor =
            platform.trend === "up"
              ? "text-crypto-green"
              : platform.trend === "down"
                ? "text-crypto-red"
                : "text-muted-foreground";

          return (
            <motion.div
              key={platform.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
            >
              <Card className="glass-card card-accent-cyan">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-crypto-cyan/10">
                      <Icon className="w-3.5 h-3.5 text-crypto-cyan" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      {platform.name}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Menções (24h)</span>
                      <span className="text-xs font-semibold number-animate">
                        {formatMentions(platform.mentions)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Sentimento</span>
                      <span className={cn("text-xs font-bold number-animate", getSentimentColor(platform.sentiment))}>
                        {platform.sentiment}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Tendência</span>
                      <div className={cn("flex items-center gap-1", trendColor)}>
                        <TrendIcon className="w-3 h-3" />
                        <span className="text-[10px] font-medium">
                          {platform.trendValue > 0 ? "+" : ""}
                          {platform.trendValue}%
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Trending Topics + Key Influencers */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Trending Topics */}
        <Card className="glass-card card-accent-cyan md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Hash className="w-4 h-4 text-crypto-cyan" />
              Tópicos em Alta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-y-auto cyan-scrollbar space-y-1.5 pr-1">
              {trendingTopics.map((topic, i) => (
                <motion.div
                  key={topic.topic}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.25 }}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/30 bg-background/30 hover:bg-background/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                    <span className="text-sm font-semibold whitespace-nowrap">{topic.topic}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatMentions(topic.mentions)}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                        getBadgeClasses(topic.sentiment)
                      )}
                    >
                      {topic.sentiment}
                    </span>
                    <div
                      className={cn(
                        "flex items-center gap-0.5 text-[10px] font-medium",
                        topic.change24h >= 0 ? "text-crypto-green" : "text-crypto-red"
                      )}
                    >
                      {topic.change24h >= 0 ? (
                        <TrendingUp className="w-2.5 h-2.5" />
                      ) : (
                        <TrendingDown className="w-2.5 h-2.5" />
                      )}
                      {topic.change24h >= 0 ? "+" : ""}
                      {topic.change24h}%
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Key Influencers */}
        <Card className="glass-card card-accent-cyan md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-crypto-cyan" />
              Influenciadores Chave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {INFLUENCERS.map((influencer, i) => (
                <motion.div
                  key={influencer.handle}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}
                  className="p-3 rounded-lg border border-border/30 bg-background/30"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <div className="text-sm font-semibold">{influencer.name}</div>
                      <div className="text-[10px] text-muted-foreground">{influencer.handle}</div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                        getBadgeClasses(influencer.sentiment)
                      )}
                    >
                      {influencer.sentiment}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {influencer.followers} seguidores
                    </span>
                    <span className="text-xs font-medium">
                      {influencer.mentionCount} menções
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
