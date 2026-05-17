"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Activity,
  DollarSign,
  Fuel,
  Cpu,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Fish,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVolume } from "@/lib/format";

// Seeded random for consistent mock data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Key metric card data
interface MetricCard {
  label: string;
  value: string;
  change: number;
  icon: React.ElementType;
  accent: string;
}

const KEY_METRICS: MetricCard[] = [
  { label: "Endereços Ativos (24h)", value: "847K", change: 3.2, icon: Activity, accent: "card-accent-green" },
  { label: "Volume de Transações", value: "$32.4B", change: -1.8, icon: DollarSign, accent: "card-accent-green" },
  { label: "Taxa Média Tx", value: "$2.45", change: -5.1, icon: Fuel, accent: "card-accent-green" },
  { label: "Taxa de Hash", value: "650 EH/s", change: 2.4, icon: Cpu, accent: "card-accent-green" },
];

// Generate 14-day network activity data
function generateNetworkData(seed: number) {
  const rng = seededRandom(seed);
  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    days.push({
      date: label,
      activeAddresses: Math.floor(750000 + rng() * 200000),
      txVolume: Math.floor(28e9 + rng() * 10e9),
    });
  }
  return days;
}

// Whale accumulation data
interface WhaleWallet {
  address: string;
  label: string;
  holdings: number;
  change24h: number;
}

function generateWhaleWallets(seed: number): WhaleWallet[] {
  const rng = seededRandom(seed);
  const labels = ["Binance Cold", "Unknown Whale", "Coinbase Custody", "Kraken Cold", "Bitfinex"];
  const wallets: WhaleWallet[] = [];
  for (let i = 0; i < 5; i++) {
    const addr = `0x${Array.from({ length: 8 }, () => Math.floor(rng() * 16).toString(16)).join("")}...${Array.from({ length: 4 }, () => Math.floor(rng() * 16).toString(16)).join("")}`;
    wallets.push({
      address: addr,
      label: labels[i],
      holdings: parseFloat((5000 + rng() * 95000).toFixed(0)),
      change24h: parseFloat((-3 + rng() * 8).toFixed(2)),
    });
  }
  return wallets.sort((a, b) => b.holdings - a.holdings);
}

// Exchange flow data
interface ExchangeFlow {
  exchange: string;
  inflow: number;
  outflow: number;
  netFlow: number;
}

function generateExchangeFlows(seed: number): ExchangeFlow[] {
  const rng = seededRandom(seed);
  const exchanges = ["Binance", "Coinbase", "Kraken", "OKX", "Bybit"];
  return exchanges.map((exchange) => {
    const inflow = Math.floor(2000 + rng() * 8000);
    const outflow = Math.floor(2000 + rng() * 8000);
    return {
      exchange,
      inflow,
      outflow,
      netFlow: outflow - inflow,
    };
  });
}

// Overall accumulation score (positive = accumulating, negative = distributing)
const ACCUMULATION_SCORE = 18; // +18 = moderately accumulating

export function OnChainAnalytics() {
  const networkData = useMemo(() => generateNetworkData(55), []);
  const whaleWallets = useMemo(() => generateWhaleWallets(77), []);
  const exchangeFlows = useMemo(() => generateExchangeFlows(99), []);

  const totalInflow = exchangeFlows.reduce((s, e) => s + e.inflow, 0);
  const totalOutflow = exchangeFlows.reduce((s, e) => s + e.outflow, 0);
  const totalNetFlow = totalOutflow - totalInflow;
  const isAccumulating = ACCUMULATION_SCORE > 0;

  // Accumulation bar visual: center = 0, range roughly -50 to +50
  const accumBarWidth = Math.min(Math.abs(ACCUMULATION_SCORE) * 2, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="space-y-4"
    >
      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KEY_METRICS.map((metric, i) => {
          const Icon = metric.icon;
          const isPositive = metric.change >= 0;
          return (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
            >
              <Card className="glass-card card-accent-green">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="p-1.5 rounded-md bg-crypto-green/10">
                      <Icon className="w-3.5 h-3.5 text-crypto-green" />
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate">{metric.label}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-lg font-bold number-animate">{metric.value}</span>
                    <div
                      className={cn(
                        "flex items-center gap-0.5 text-[10px] font-medium",
                        isPositive ? "text-crypto-green" : "text-crypto-red"
                      )}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {isPositive ? "+" : ""}
                      {metric.change}%
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Network Activity Chart */}
      <Card className="glass-card card-accent-green">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-crypto-green" />
            Atividade da Rede
            <span className="text-[10px] text-muted-foreground font-normal">(14 Dias)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={networkData}
                margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatVolume(v)}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === "Active Addresses") return [`${(value / 1000).toFixed(0)}K`, name];
                    return [formatVolume(value), "Tx Volume"];
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "10px" }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="activeAddresses"
                  name="Active Addresses"
                  fill="url(#barGradient)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={24}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="txVolume"
                  name="Tx Volume"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: "#06b6d4" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Whale Accumulation + Exchange Flows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Whale Accumulation */}
        <Card className="glass-card card-accent-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Fish className="w-4 h-4 text-crypto-green" />
              Acumulação de Baleias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Accumulation/Distribution Bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground">Distribuição</span>
                <span className="text-[10px] text-muted-foreground">Acumulação</span>
              </div>
              <div className="relative h-4 rounded-full bg-crypto-red/15 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-px h-full bg-border/50" />
                </div>
                {isAccumulating ? (
                  <div
                    className="absolute top-0 left-1/2 h-full bg-crypto-green/40 rounded-r-full transition-all duration-700"
                    style={{ width: `${accumBarWidth / 2}%` }}
                  />
                ) : (
                  <div
                    className="absolute top-0 right-1/2 h-full bg-crypto-red/40 rounded-l-full transition-all duration-700"
                    style={{ width: `${accumBarWidth / 2}%` }}
                  />
                )}
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span
                  className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full",
                    isAccumulating
                      ? "bg-crypto-green/15 text-crypto-green"
                      : "bg-crypto-red/15 text-crypto-red"
                  )}
                >
                  {isAccumulating ? "Acumulando" : "Distribuindo"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Score: {isAccumulating ? "+" : ""}{ACCUMULATION_SCORE}
                </span>
              </div>
            </div>

            {/* Top 5 Whale Wallets */}
            <div className="space-y-2 max-h-48 overflow-y-auto cyan-scrollbar pr-1">
              {whaleWallets.map((wallet, i) => {
                const isBuying = wallet.change24h > 0;
                return (
                  <motion.div
                    key={wallet.address}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.25 }}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/30 bg-background/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1 rounded bg-crypto-green/10">
                        <Wallet className="w-3 h-3 text-crypto-green" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{wallet.label}</div>
                        <div className="text-[9px] text-muted-foreground font-mono truncate">
                          {wallet.address}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-xs font-semibold">
                        {wallet.holdings.toLocaleString()} BTC
                      </div>
                      <div
                        className={cn(
                          "text-[10px] font-medium",
                          isBuying ? "text-crypto-green" : "text-crypto-red"
                        )}
                      >
                        {isBuying ? "+" : ""}{wallet.change24h}%
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Exchange Flows */}
        <Card className="glass-card card-accent-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-crypto-green" />
              Fluxos de Exchange
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Net Flow Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg bg-crypto-red/10 border border-crypto-red/15 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ArrowDownToLine className="w-3 h-3 text-crypto-red" />
                  <span className="text-[10px] text-muted-foreground">Entrada</span>
                </div>
                <div className="text-sm font-bold text-crypto-red number-animate">
                  {totalInflow.toLocaleString()} BTC
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-crypto-green/10 border border-crypto-green/15 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ArrowUpFromLine className="w-3 h-3 text-crypto-green" />
                  <span className="text-[10px] text-muted-foreground">Saída</span>
                </div>
                <div className="text-sm font-bold text-crypto-green number-animate">
                  {totalOutflow.toLocaleString()} BTC
                </div>
              </div>
              <div
                className={cn(
                  "p-2.5 rounded-lg border text-center",
                  totalNetFlow >= 0
                    ? "bg-crypto-green/10 border-crypto-green/15"
                    : "bg-crypto-red/10 border-crypto-red/15"
                )}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Fluxo Líquido</span>
                </div>
                <div
                  className={cn(
                    "text-sm font-bold number-animate",
                    totalNetFlow >= 0 ? "text-crypto-green" : "text-crypto-red"
                  )}
                >
                  {totalNetFlow >= 0 ? "+" : ""}{totalNetFlow.toLocaleString()} BTC
                </div>
              </div>
            </div>

            {/* Flow Diagram per Exchange */}
            <div className="space-y-2 max-h-48 overflow-y-auto cyan-scrollbar pr-1">
              {exchangeFlows.map((flow, i) => {
                const maxFlow = Math.max(totalInflow, totalOutflow);
                const inflowWidth = (flow.inflow / maxFlow) * 100;
                const outflowWidth = (flow.outflow / maxFlow) * 100;
                const isNetPositive = flow.netFlow >= 0;

                return (
                  <motion.div
                    key={flow.exchange}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.25 }}
                    className="p-2.5 rounded-lg border border-border/30 bg-background/30"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold">{flow.exchange}</span>
                      <span
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                          isNetPositive
                            ? "bg-crypto-green/15 text-crypto-green"
                            : "bg-crypto-red/15 text-crypto-red"
                        )}
                      >
                        {isNetPositive ? "+" : ""}{flow.netFlow.toLocaleString()} BTC
                      </span>
                    </div>
                    {/* Inflow bar */}
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowDownToLine className="w-2.5 h-2.5 text-crypto-red shrink-0" />
                      <div className="flex-1 h-2 bg-crypto-red/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crypto-red/60 rounded-full transition-all duration-500"
                          style={{ width: `${inflowWidth}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground w-14 text-right shrink-0">
                        {flow.inflow.toLocaleString()}
                      </span>
                    </div>
                    {/* Outflow bar */}
                    <div className="flex items-center gap-2">
                      <ArrowUpFromLine className="w-2.5 h-2.5 text-crypto-green shrink-0" />
                      <div className="flex-1 h-2 bg-crypto-green/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crypto-green/60 rounded-full transition-all duration-500"
                          style={{ width: `${outflowWidth}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground w-14 text-right shrink-0">
                        {flow.outflow.toLocaleString()}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
