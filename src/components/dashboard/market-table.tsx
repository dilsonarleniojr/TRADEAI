"use client";

import { useCryptoStore } from "@/lib/store";
import { formatPrice, formatVolume, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";

const symbolColors: Record<string, string> = {
  BTCUSDT: "#f7931a",
  ETHUSDT: "#627eea",
  BNBUSDT: "#f3ba2f",
  SOLUSDT: "#9945ff",
  XRPUSDT: "#00aae4",
  ADAUSDT: "#0033ad",
  DOGEUSDT: "#c3a634",
  AVAXUSDT: "#e84142",
  DOTUSDT: "#e6007a",
  LINKUSDT: "#2a5ada",
  MATICUSDT: "#8247e5",
  ATOMUSDT: "#2e3148",
};

export function MarketTable() {
  const { tickers, setSelectedSymbol, setActiveSection } = useCryptoStore();

  const tickerList = Object.values(tickers).sort(
    (a, b) => b.quoteVolume - a.quoteVolume
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-crypto-cyan" />
              Market Overview
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {tickerList.length} assets
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground h-8">
                    Asset
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8">
                    Price
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8">
                    24h %
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8 hidden sm:table-cell">
                    High/Low
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8 hidden md:table-cell">
                    Volume
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right h-8 w-16">
                    Trend
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickerList.map((ticker) => {
                  const isPositive = ticker.priceChangePercent >= 0;
                  const color =
                    symbolColors[ticker.symbol] || "#06b6d4";
                  const barWidth = Math.min(
                    Math.abs(ticker.priceChangePercent) * 5,
                    100
                  );

                  return (
                    <TableRow
                      key={ticker.symbol}
                      className="border-border cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => {
                        setSelectedSymbol(ticker.symbol);
                        setActiveSection("chart");
                      }}
                    >
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div>
                            <span className="text-sm font-medium">
                              {ticker.symbol.replace("USDT", "")}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              /USDT
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <span className="text-sm font-mono font-medium">
                          ${formatPrice(ticker.price)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <span
                          className={cn(
                            "text-sm font-mono font-medium",
                            isPositive ? "text-crypto-green" : "text-crypto-red"
                          )}
                        >
                          {formatPercent(ticker.priceChangePercent)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-2.5 hidden sm:table-cell">
                        <div className="text-xs text-muted-foreground font-mono">
                          <span>${formatPrice(ticker.high)}</span>
                          <span className="mx-1">/</span>
                          <span>${formatPrice(ticker.low)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-2.5 hidden md:table-cell">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatVolume(ticker.quoteVolume)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isPositive ? "bg-crypto-green" : "bg-crypto-red"
                            )}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
