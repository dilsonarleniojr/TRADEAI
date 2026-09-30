import type { TradeData } from "@/lib/store";

/**
 * Export trades to CSV format and trigger browser download.
 */
export function exportTradesToCSV(trades: TradeData[], filename?: string): void {
  if (trades.length === 0) return;

  const headers = [
    "ID",
    "Data/Hora",
    "Símbolo",
    "Lado",
    "Preço",
    "Quantidade",
    "Total",
    "P&L",
    "Estratégia",
    "Modo",
  ];

  const rows = trades.map((t) => [
    t.id,
    new Date(t.timestamp).toLocaleString("pt-BR"),
    t.symbol,
    t.side,
    t.price.toFixed(8),
    t.quantity.toFixed(8),
    t.total.toFixed(2),
    t.pnl.toFixed(2),
    t.strategy,
    t.mode,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename || `trades_${new Date().toISOString().split("T")[0]}.csv`);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
