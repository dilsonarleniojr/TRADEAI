"use client";

import { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ExportTrades() {
  const { trades } = useCryptoStore();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function formatDate(timestamp: string): string {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function generateCSV(): string {
    const headers = "Date,Symbol,Side,Price,Quantity,Total,PnL,Strategy,Mode";
    const rows = trades.map((t) =>
      [
        `"${formatDate(t.timestamp)}"`,
        t.symbol,
        t.side,
        formatPrice(t.price),
        t.quantity,
        formatPrice(t.total),
        t.pnl.toFixed(2),
        t.strategy,
        t.mode,
      ].join(",")
    );
    return [headers, ...rows].join("\n");
  }

  function generateJSON(): string {
    return JSON.stringify(
      trades.map((t) => ({
        date: formatDate(t.timestamp),
        symbol: t.symbol,
        side: t.side,
        price: t.price,
        quantity: t.quantity,
        total: t.total,
        pnl: t.pnl,
        strategy: t.strategy,
        mode: t.mode,
      })),
      null,
      2
    );
  }

  function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleExportCSV() {
    if (trades.length === 0) {
      toast({ title: "No trades to export", description: "Execute some trades first." });
      return;
    }
    const csv = generateCSV();
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(csv, `crypto-trades-${timestamp}.csv`, "text/csv;charset=utf-8;");
    toast({ title: "Trades exported to CSV", description: `${trades.length} trades downloaded.` });
  }

  function handleExportJSON() {
    if (trades.length === 0) {
      toast({ title: "No trades to export", description: "Execute some trades first." });
      return;
    }
    const json = generateJSON();
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(json, `crypto-trades-${timestamp}.json`, "application/json");
    toast({ title: "Trades exported to JSON", description: `${trades.length} trades downloaded.` });
  }

  function handleCopyClipboard() {
    if (trades.length === 0) {
      toast({ title: "No trades to copy", description: "Execute some trades first." });
      return;
    }
    const csv = generateCSV();
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard", description: `${trades.length} trades copied as CSV.` });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={handleExportCSV}>
          <FileText className="w-4 h-4" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportJSON}>
          <FileText className="w-4 h-4" />
          Export JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyClipboard}>
          {copied ? <Check className="w-4 h-4 text-crypto-green" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy to Clipboard"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
