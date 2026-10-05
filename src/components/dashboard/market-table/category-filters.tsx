import { cn } from "@/lib/utils";
import { CATEGORY_META, type CryptoCategory } from "@/lib/crypto-meta";

interface CategoryFiltersProps {
  active: string;
  counts: Record<string, number>;
  onChange: (category: string) => void;
}

const pillClass = (selected: boolean) =>
  cn(
    "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition-all duration-200 shrink-0",
    selected
      ? "bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/40 shadow-sm shadow-crypto-cyan/10"
      : "bg-secondary/30 text-muted-foreground border-border/40 hover:bg-secondary/50 hover:text-foreground"
  );

const countClass = (selected: boolean) =>
  cn(
    "text-[9px] px-1 rounded-full",
    selected ? "bg-crypto-cyan/20 text-crypto-cyan" : "bg-secondary/50 text-muted-foreground/70"
  );

export function CategoryFilters({ active, counts, onChange }: CategoryFiltersProps) {
  const categories = Object.entries(CATEGORY_META) as [CryptoCategory, (typeof CATEGORY_META)[CryptoCategory]][];

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5" role="group" aria-label="Filtrar por categoria">
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={active === "all"}
        className={pillClass(active === "all")}
      >
        <span>Todos</span>
        <span className={countClass(active === "all")}>{counts.all}</span>
      </button>
      {categories.map(([cat, meta]) => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(active === cat ? "all" : cat)}
          aria-pressed={active === cat}
          className={pillClass(active === cat)}
        >
          <span aria-hidden="true">{meta.emoji}</span>
          <span>{meta.label}</span>
          <span className={countClass(active === cat)}>{counts[cat] || 0}</span>
        </button>
      ))}
    </div>
  );
}
