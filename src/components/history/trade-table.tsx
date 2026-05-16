"use client";

import { useCryptoStore, TradeData } from "@/lib/store";
import { formatPrice, formatTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown } from "lucide-react";

export function TradeTable({ trades }: { trades: TradeData[] }) {
  return (
    <ScrollArea className="max-h-[400px]">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-[11px] text-muted-foreground">Time</TableHead>
            <TableHead className="text-[11px] text-muted-foreground">Symbol</TableHead>
            <TableHead className="text-[11px] text-muted-foreground">Side</TableHead>
            <TableHead className="text-[11px] text-muted-foreground text-right">Price</TableHead>
            <TableHead className="text-[11px] text-muted-foreground text-right">Qty</TableHead>
            <TableHead className="text-[11px] text-muted-foreground text-right">Total</TableHead>
            <TableHead className="text-[11px] text-muted-foreground">Strategy</TableHead>
            <TableHead className="text-[11px] text-muted-foreground">Mode</TableHead>
            <TableHead className="text-[11px] text-muted-foreground text-right">PnL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground text-xs py-8">
                No trades yet. Start the bot to begin trading.
              </TableCell>
            </TableRow>
          ) : (
            trades.map((trade) => (
              <TableRow key={trade.id} className="border-border/50">
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {formatTime(new Date(trade.timestamp).getTime())}
                </TableCell>
                <TableCell className="text-xs font-medium">
                  {trade.symbol.replace("USDT", "")}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-[10px] px-1.5 py-0 ${
                      trade.side === "BUY"
                        ? "bg-crypto-green/15 text-crypto-green border-crypto-green/30"
                        : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
                    }`}
                  >
                    {trade.side === "BUY" ? (
                      <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                    )}
                    {trade.side}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right font-mono">
                  ${formatPrice(trade.price)}
                </TableCell>
                <TableCell className="text-xs text-right font-mono">
                  {trade.quantity}
                </TableCell>
                <TableCell className="text-xs text-right font-mono">
                  ${formatPrice(trade.total)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] border-border">
                    {trade.strategy}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-[10px] px-1.5 py-0 ${
                      trade.mode === "paper"
                        ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                        : "bg-crypto-gold/15 text-crypto-gold border-crypto-gold/30"
                    }`}
                  >
                    {trade.mode}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`text-xs text-right font-mono font-medium ${
                    trade.pnl > 0
                      ? "text-crypto-green"
                      : trade.pnl < 0
                        ? "text-crypto-red"
                        : "text-muted-foreground"
                  }`}
                >
                  {trade.pnl > 0 ? "+" : ""}
                  {trade.pnl !== 0 ? `$${formatPrice(Math.abs(trade.pnl))}` : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
