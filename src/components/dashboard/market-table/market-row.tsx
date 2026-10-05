import { memo } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatPercent, formatPrice, formatVolume } from "@/lib/format";
import {
  CRYPTO_CATEGORIES,
  CRYPTO_COLORS,
  CRYPTO_LIST,
  CRYPTO_NAMES,
  CRYPTO_SHORTS,
} from "@/lib/crypto-meta";
import type { TickerData } from "@/lib/store";
import { CategoryBadge } from "./category-badge";
import { Sparkline } from "./sparkline";

interface MarketRowProps {
  ticker: TickerData;
  index: number;
  isWatched: boolean;
  sparkData?: number[];
  onOpen: (symbol: string) => void;
  onToggleWatch: (symbol: string) => void;
}

function getMeta(symbol: string) {
  return {
    name: CRYPTO_NAMES[symbol] || symbol.replace("USDT", ""),
    short: CRYPTO_SHORTS[symbol] || symbol.replace("USDT", ""),
    color: CRYPTO_COLORS[symbol] || "#06b6d4",
    category: CRYPTO_CATEGORIES[symbol] || "",
    rank: CRYPTO_LIST.find((c) => c.symbol === symbol)?.rank,
  };
}

// Memoizada: com ticks a cada segundo, só as linhas cujo ticker mudou são redesenhadas.
export const MarketRow = memo(function MarketRow({
  ticker,
  index,
  isWatched,
  sparkData,
  onOpen,
  onToggleWatch,
}: MarketRowProps) {
  const isPositive = ticker.priceChangePercent >= 0;
  const meta = getMeta(ticker.symbol);
  const sparkColor = isPositive ? "#22c55e" : "#ef4444";
  const isAltRow = index % 2 === 1;

  return (
    <TableRow
      className={cn(
        "cursor-pointer transition-all duration-200 group table-row-hover",
        "hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent hover:shadow-sm",
        isWatched && "bg-crypto-gold/[0.03]",
        isAltRow && !isWatched && "table-row-alt"
      )}
      style={{
        borderLeft: `2px solid ${meta.color}40`,
        borderBottom: "1px solid var(--border)",
      }}
      onClick={() => onOpen(ticker.symbol)}
    >
      {/* Favorito */}
      <TableCell className="py-2 w-7 pr-0">
        <Button
          variant="ghost"
          size="sm"
          aria-label={isWatched ? `Remover ${meta.short} dos favoritos` : `Adicionar ${meta.short} aos favoritos`}
          aria-pressed={isWatched}
          className={cn(
            "h-6 w-6 p-0 transition-colors",
            isWatched
              ? "text-crypto-gold hover:text-crypto-gold"
              : "text-muted-foreground/30 hover:text-crypto-gold/60"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatch(ticker.symbol);
          }}
        >
          <Star className={cn("w-3 h-3", isWatched && "fill-crypto-gold")} />
        </Button>
      </TableCell>

      {/* Posição */}
      <TableCell className="py-2 w-6 pr-0 text-center">
        <span className="text-[10px] font-mono text-muted-foreground/50 font-medium">{index + 1}</span>
      </TableCell>

      {/* Ativo */}
      <TableCell className="py-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 shadow-sm"
            style={{ backgroundColor: meta.color }}
          >
            {meta.short.slice(0, 2)}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{meta.name}</span>
              <CategoryBadge category={meta.category} />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{meta.short}/USDT</span>
          </div>
        </div>
      </TableCell>

      {/* Preço */}
      <TableCell className="text-right py-2">
        <span className="text-sm font-mono font-medium number-animate price-flash-up transition-colors duration-300">
          ${formatPrice(ticker.price)}
        </span>
      </TableCell>

      {/* Variação 24h */}
      <TableCell className="text-right py-2">
        <div className="flex items-center justify-end gap-1.5">
          <span
            className={cn(
              "text-xs font-mono font-semibold px-1.5 py-0.5 rounded-md",
              isPositive ? "text-crypto-green bg-crypto-green/10" : "text-crypto-red bg-crypto-red/10"
            )}
          >
            {formatPercent(ticker.priceChangePercent)}
          </span>
          <div className="w-8 h-1.5 rounded-full bg-secondary/50 overflow-hidden hidden sm:block" aria-hidden="true">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isPositive ? "bg-crypto-green/60" : "bg-crypto-red/60"
              )}
              style={{
                width: `${Math.min(100, Math.abs(ticker.priceChangePercent) * 5)}%`,
                marginLeft: isPositive ? "auto" : "0",
              }}
            />
          </div>
        </div>
      </TableCell>

      {/* Máxima/mínima 24h */}
      <TableCell className="text-right py-2 hidden sm:table-cell">
        <div className="text-[10px] text-muted-foreground font-mono">
          <span>${formatPrice(ticker.high)}</span>
          <span className="mx-0.5">/</span>
          <span>${formatPrice(ticker.low)}</span>
        </div>
      </TableCell>

      {/* Volume */}
      <TableCell className="text-right py-2 hidden md:table-cell">
        <span className="text-[10px] font-mono text-muted-foreground">{formatVolume(ticker.quoteVolume)}</span>
      </TableCell>

      {/* Rank por valor de mercado */}
      <TableCell className="text-right py-2 hidden lg:table-cell">
        {meta.rank ? (
          <span className="text-[10px] font-mono text-muted-foreground bg-secondary/30 px-1.5 py-0.5 rounded">
            #{meta.rank}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </TableCell>

      {/* Categoria (xl+) */}
      <TableCell className="text-right py-2 hidden xl:table-cell">
        <div className="flex justify-end">
          <CategoryBadge category={meta.category} />
        </div>
      </TableCell>

      {/* Tendência 24h */}
      <TableCell className="text-right py-2 hidden sm:table-cell">
        <div className="flex justify-end">
          {sparkData && sparkData.length > 1 ? (
            <Sparkline data={sparkData} color={sparkColor} width={60} height={20} />
          ) : (
            <div className="w-[60px] h-5 bg-secondary/30 rounded animate-pulse" />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});
