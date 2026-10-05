import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORY_META, type CryptoCategory } from "@/lib/crypto-meta";

const SHORT_LABELS: Record<string, string> = {
  "Layer 1": "L1",
  "Layer 2": "L2",
  DeFi: "DeFi",
  Meme: "Meme",
  AI: "IA",
  Gaming: "Game",
  Infrastructure: "Infra",
  Exchange: "Exch",
  Stablecoin: "Stbl",
};

export function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category as CryptoCategory];
  if (!meta) return null;

  const label = SHORT_LABELS[category] || category;
  const hexColor = meta.color;

  return (
    <Badge
      className={cn(
        "text-[8px] px-1 py-0 border font-semibold leading-none",
        "bg-[var(--cat-bg)] text-[var(--cat-text)] border-[var(--cat-border)]"
      )}
      style={{
        // @ts-expect-error CSS custom properties
        "--cat-bg": `${hexColor}15`,
        "--cat-text": `${hexColor}cc`,
        "--cat-border": `${hexColor}30`,
      }}
    >
      {label}
    </Badge>
  );
}
