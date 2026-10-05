"use client";

import { useState, useMemo } from "react";
import { TradeData } from "@/lib/store";
import { formatPrice, formatTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bot,
  User,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TradeTableProps {
  trades: TradeData[];
}

type SortField = "timestamp" | "symbol" | "side" | "price" | "quantity" | "total" | "pnl";
type SortDirection = "asc" | "desc";

export function TradeTable({ trades }: { trades: TradeData[] }) {
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset page if trades list changes (e.g., filtered)
  useMemo(() => {
    setCurrentPage(1);
  }, [trades.length]);

  // Handle Sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedTrades = useMemo(() => {
    const sorted = [...trades];
    sorted.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      // Handle date
      if (sortField === "timestamp") {
        valA = new Date(a.timestamp).getTime();
        valB = new Date(b.timestamp).getTime();
      }

      if (typeof valA === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      // Handle numbers
      return sortDirection === "asc"
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return sorted;
  }, [trades, sortField, sortDirection]);

  // Paginated trades
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedTrades.slice(start, start + itemsPerPage);
  }, [sortedTrades, currentPage]);

  const totalPages = Math.ceil(trades.length / itemsPerPage);

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => {
    const isSorted = sortField === field;
    return (
      <TableHead
        onClick={() => handleSort(field)}
        className="text-[11px] text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-1">
          {children}
          {isSorted ? (
            sortDirection === "asc" ? (
              <ArrowUp className="w-3 h-3 text-crypto-cyan" />
            ) : (
              <ArrowDown className="w-3 h-3 text-crypto-cyan" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
          )}
        </div>
      </TableHead>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/40 overflow-hidden bg-background/30 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-secondary/25">
              <SortHeader field="timestamp">Hora</SortHeader>
              <SortHeader field="symbol">Símbolo</SortHeader>
              <SortHeader field="side">Lado</SortHeader>
              <SortHeader field="price">Preço</SortHeader>
              <SortHeader field="quantity">Qtd</SortHeader>
              <SortHeader field="total">Total</SortHeader>
              <TableHead className="text-[11px] text-muted-foreground font-medium">Estratégia</TableHead>
              <TableHead className="text-[11px] text-muted-foreground font-medium">Modo</TableHead>
              <SortHeader field="pnl">L/P</SortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTrades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground text-xs py-12 bg-background/10">
                  Nenhum trade encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            ) : (
              paginatedTrades.map((trade, idx) => {
                const cleanSym = trade.symbol.replace("USDT", "");
                const isReal = trade.mode === "live";
                const isBuy = trade.side === "BUY";

                // Strategy badge styling
                let strategyBadge: React.ReactNode = null;
                if (trade.strategy === "AI") {
                  strategyBadge = (
                    <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30 flex items-center gap-1 w-fit">
                      <Cpu className="w-2.5 h-2.5" />
                      🤖 IA
                    </Badge>
                  );
                } else if (trade.strategy === "Manual") {
                  strategyBadge = (
                    <Badge variant="outline" className="text-[10px] bg-muted/20 text-muted-foreground border-border flex items-center gap-1 w-fit">
                      <User className="w-2.5 h-2.5" />
                      👤 Manual
                    </Badge>
                  );
                } else {
                  strategyBadge = (
                    <Badge variant="outline" className="text-[10px] bg-crypto-cyan/10 text-crypto-cyan border-crypto-cyan/30 flex items-center gap-1 w-fit">
                      <Bot className="w-2.5 h-2.5" />
                      ⚙️ {trade.strategy}
                    </Badge>
                  );
                }

                return (
                  <TableRow
                    key={trade.id}
                    className={cn(
                      "border-border/40 hover:bg-secondary/20 transition-colors duration-150",
                      idx % 2 === 1 && "bg-secondary/5"
                    )}
                  >
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {formatTime(new Date(trade.timestamp).getTime())}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-foreground">
                      {cleanSym}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 border flex items-center gap-0.5 w-fit font-bold",
                          isBuy
                            ? "bg-crypto-green/10 text-crypto-green border-crypto-green/30"
                            : "bg-crypto-red/10 text-crypto-red border-crypto-red/30"
                        )}
                      >
                        {isBuy ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        {trade.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-foreground font-semibold">
                      ${formatPrice(trade.price)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {trade.quantity.toFixed(6)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-foreground">
                      ${formatPrice(trade.total)}
                    </TableCell>
                    <TableCell>
                      {strategyBadge}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 border font-semibold",
                          isReal
                            ? "bg-crypto-green/10 text-crypto-green border-crypto-green/20"
                            : "bg-crypto-cyan/10 text-crypto-cyan border-crypto-cyan/20"
                        )}
                      >
                        {isReal ? "Dados Reais" : "Simulado"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-xs font-mono font-bold text-right",
                        trade.pnl > 0
                          ? "text-crypto-green bg-crypto-green/5"
                          : trade.pnl < 0
                            ? "text-crypto-red bg-crypto-red/5"
                            : "text-muted-foreground"
                      )}
                    >
                      {trade.pnl > 0 ? "+" : ""}
                      {trade.pnl !== 0 ? `$${formatPrice(Math.abs(trade.pnl))}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1 bg-secondary/10 border border-border/30 rounded-lg">
          <span className="text-xs text-muted-foreground">
            Mostrando <span className="font-semibold text-foreground">{paginatedTrades.length}</span> de{" "}
            <span className="font-semibold text-foreground">{trades.length}</span> trades
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-medium px-2">
              Pág <span className="text-crypto-cyan font-bold">{currentPage}</span> de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
