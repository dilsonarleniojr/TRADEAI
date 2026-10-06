"use client";

import { useState } from "react";
import { type BotExecutionReport } from "@/lib/store/types";
import { formatPrice } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Receipt,
  Copy,
  Download,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BotExecutionReportDialogProps {
  report: BotExecutionReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BotExecutionReportDialog({
  report,
  open,
  onOpenChange,
}: BotExecutionReportDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!report) return null;

  const isProfit = report.netPnl >= 0;
  const pnlSign = isProfit ? "+" : "";

  const generateReportText = () => {
    return [
      `==================================================`,
      `📊 RELATÓRIO DE EXECUÇÃO — TRADEAI BOT`,
      `==================================================`,
      `Robô: ${report.botName}`,
      `Par: ${report.symbol}`,
      `Estratégia: ${report.strategy}`,
      `Modo: ${report.mode === "live" ? "🟢 REAL (Binance Spot)" : "🔷 SIMULADO (Paper Trading)"}`,
      `Motivo do Encerramento: ${report.exitReason}`,
      `--------------------------------------------------`,
      `💰 RESULTADOS FINANCEIROS`,
      `Capital Aplicado: $${report.totalInvested.toFixed(2)} USDT`,
      `Capital Retornado: $${report.totalReturned.toFixed(2)} USDT`,
      `Resultado Bruto: ${pnlSign}$${report.grossPnl.toFixed(2)} USDT (${pnlSign}${report.gainPercent.toFixed(2)}%)`,
      `Taxa de Compra (0.1%): -$${report.buyFee.toFixed(4)} USDT`,
      `Taxa de Venda (0.1%): -$${report.sellFee.toFixed(4)} USDT`,
      `Total de Custos/Taxas: -$${report.totalFees.toFixed(4)} USDT`,
      `--------------------------------------------------`,
      `💎 RESULTADO LÍQUIDO FINAL: ${pnlSign}$${report.netPnl.toFixed(2)} USDT (${pnlSign}${report.netGainPercent.toFixed(2)}%)`,
      `--------------------------------------------------`,
      `⏱️ EXECUÇÃO & DURAÇÃO`,
      `Preço de Entrada: $${formatPrice(report.entryPrice)}`,
      `Preço de Saída: $${formatPrice(report.exitPrice)}`,
      `Quantidade Executada: ${report.quantity.toFixed(6)} ${report.symbol.replace("USDT", "")}`,
      `Entrada: ${new Date(report.entryTime).toLocaleString("pt-BR")}`,
      `Saída: ${new Date(report.exitTime).toLocaleString("pt-BR")}`,
      `Duração da Posição: ${report.durationFormatted}`,
      `--------------------------------------------------`,
      `📈 PERFORMANCE ACUMULADA DO ROBÔ`,
      `Total de Operações: ${report.botTotalTrades}`,
      `Vitórias / Derrotas: ${report.botWinTrades}V / ${report.botLossTrades}D`,
      `Taxa de Acerto (Win Rate): ${report.botWinRate.toFixed(1)}%`,
      `Lucro Histórico Acumulado: ${report.botAccumulatedPnl >= 0 ? "+" : ""}$${report.botAccumulatedPnl.toFixed(2)} USDT`,
      `==================================================`,
      `Gerado por TradeAI Bot Engine em ${new Date().toLocaleString("pt-BR")}`,
    ].join("\n");
  };

  const handleCopy = () => {
    try {
      const text = generateReportText();
      navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Relatório Copiado!",
        description: "O resumo detalhado da aplicação foi copiado para a área de transferência.",
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o relatório.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    try {
      const text = generateReportText();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-${report.symbol}-${Date.now()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Relatório Baixado!",
        description: "Arquivo TXT do relatório gerado com sucesso.",
      });
    } catch {
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível baixar o relatório.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border/80 shadow-2xl p-6">
        <DialogHeader className="space-y-1.5 pb-2">
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className={
                report.mode === "live"
                  ? "border-crypto-green/40 bg-crypto-green/10 text-crypto-green font-semibold text-xs px-2.5 py-0.5"
                  : "border-crypto-cyan/40 bg-crypto-cyan/10 text-crypto-cyan font-semibold text-xs px-2.5 py-0.5"
              }
            >
              {report.mode === "live" ? "🟢 Binance Spot (Real)" : "🔷 Simulado (Paper)"}
            </Badge>

            <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5" />
              Duração: {report.durationFormatted}
            </span>
          </div>

          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Receipt className="w-5 h-5 text-crypto-cyan" />
            Relatório de Execução da Aplicação
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {report.botName} &bull; Par <span className="font-semibold text-foreground">{report.symbol}</span> &bull; {report.strategy}
          </DialogDescription>
        </DialogHeader>

        {/* Hero Card: Net Result */}
        <div
          className={`rounded-xl p-4 border transition-all ${
            isProfit
              ? "bg-crypto-green/10 border-crypto-green/30"
              : "bg-crypto-red/10 border-crypto-red/30"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground block mb-0.5">
                Resultado Líquido (Após Taxas)
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-3xl font-extrabold font-mono tracking-tight ${
                    isProfit ? "text-crypto-green" : "text-crypto-red"
                  }`}
                >
                  {pnlSign}${Math.abs(report.netPnl).toFixed(2)} USDT
                </span>
                <span
                  className={`text-base font-bold font-mono ${
                    isProfit ? "text-crypto-green" : "text-crypto-red"
                  }`}
                >
                  ({pnlSign}{report.netGainPercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`px-3 py-1 text-xs font-bold flex items-center gap-1.5 ${
                  isProfit
                    ? "border-crypto-green/40 text-crypto-green bg-crypto-green/15"
                    : "border-crypto-red/40 text-crypto-red bg-crypto-red/15"
                }`}
              >
                {isProfit ? (
                  <>
                    <TrendingUp className="w-4 h-4" />
                    Operação Lucrativa
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-4 h-4" />
                    Prejuízo Registrado
                  </>
                )}
              </Badge>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
            <span>Motivo: <strong className="text-foreground">{report.exitReason}</strong></span>
            <span>Bruto: <strong className={isProfit ? "text-crypto-green" : "text-crypto-red"}>{pnlSign}${report.grossPnl.toFixed(2)} USDT ({pnlSign}{report.gainPercent.toFixed(2)}%)</strong></span>
          </div>
        </div>

        {/* Financial Breakdown & Fees Section */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            Demonstrativo Financeiro & Custos Operacionais
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2.5">
              <span className="text-[11px] text-muted-foreground block">Capital Aplicado</span>
              <span className="font-mono font-bold text-sm text-foreground">
                ${report.totalInvested.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground block">Compra</span>
            </div>

            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2.5">
              <span className="text-[11px] text-muted-foreground block">Capital Retornado</span>
              <span className="font-mono font-bold text-sm text-foreground">
                ${report.totalReturned.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground block">Venda</span>
            </div>

            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2.5">
              <span className="text-[11px] text-muted-foreground block">Custos / Taxas</span>
              <span className="font-mono font-bold text-sm text-amber-400">
                -${report.totalFees.toFixed(4)}
              </span>
              <span className="text-[10px] text-muted-foreground block">0.10% Binance Spot</span>
            </div>

            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2.5">
              <span className="text-[11px] text-muted-foreground block">Lucro Líquido Real</span>
              <span
                className={`font-mono font-bold text-sm ${
                  isProfit ? "text-crypto-green" : "text-crypto-red"
                }`}
              >
                {pnlSign}${report.netPnl.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground block">Líquido em USDT</span>
            </div>
          </div>

          {/* Fee Detail breakdown bar */}
          <div className="bg-secondary/15 border border-border/30 rounded-lg p-2.5 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Taxa de Compra (0.10% sobre entrada):</span>
              <span className="font-mono text-foreground">-${report.buyFee.toFixed(4)} USDT</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Taxa de Venda (0.10% sobre saída):</span>
              <span className="font-mono text-foreground">-${report.sellFee.toFixed(4)} USDT</span>
            </div>
            <div className="flex items-center justify-between font-semibold pt-1 border-t border-border/20 text-foreground">
              <span>Total de Encargos Deduzidos:</span>
              <span className="font-mono text-amber-400">-${report.totalFees.toFixed(4)} USDT</span>
            </div>
          </div>
        </div>

        {/* Execution Details */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-crypto-cyan" />
            Parâmetros da Ordem
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2.5">
              <span className="text-[11px] text-muted-foreground block">Preço de Entrada</span>
              <span className="font-mono font-semibold text-foreground">
                ${formatPrice(report.entryPrice)}
              </span>
            </div>

            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2.5">
              <span className="text-[11px] text-muted-foreground block">Preço de Saída</span>
              <span className="font-mono font-semibold text-foreground">
                ${formatPrice(report.exitPrice)}
              </span>
            </div>

            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2.5 col-span-2 sm:col-span-1">
              <span className="text-[11px] text-muted-foreground block">Quantidade Negociada</span>
              <span className="font-mono font-semibold text-foreground">
                {report.quantity.toFixed(6)} {report.symbol.replace("USDT", "")}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground bg-secondary/15 p-2.5 rounded-lg border border-border/30">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span>Entrada: <strong className="text-foreground">{new Date(report.entryTime).toLocaleString("pt-BR")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span>Saída: <strong className="text-foreground">{new Date(report.exitTime).toLocaleString("pt-BR")}</strong></span>
            </div>
          </div>
        </div>

        {/* Lifetime Bot Stats */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            Histórico Consolidado Deste Robô
          </h4>

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2">
              <span className="text-[10px] text-muted-foreground block">Operações</span>
              <span className="font-bold font-mono text-sm text-foreground">{report.botTotalTrades}</span>
            </div>
            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2">
              <span className="text-[10px] text-muted-foreground block">Acerto</span>
              <span className="font-bold font-mono text-sm text-crypto-green">{report.botWinRate.toFixed(0)}%</span>
            </div>
            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2">
              <span className="text-[10px] text-muted-foreground block">Vitórias/Derrotas</span>
              <span className="font-bold font-mono text-sm text-foreground">{report.botWinTrades}V / {report.botLossTrades}D</span>
            </div>
            <div className="bg-secondary/25 border border-border/40 rounded-lg p-2">
              <span className="text-[10px] text-muted-foreground block">Lucro Acumulado</span>
              <span className={`font-bold font-mono text-sm ${report.botAccumulatedPnl >= 0 ? "text-crypto-green" : "text-crypto-red"}`}>
                {report.botAccumulatedPnl >= 0 ? "+" : ""}${report.botAccumulatedPnl.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <Separator className="bg-border/50 my-1" />

        {/* Dialog Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto text-xs h-8 px-4"
          >
            Fechar
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="flex-1 sm:flex-initial text-xs h-8 gap-1.5 border-border/70 hover:bg-secondary/40"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar TXT
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              className="flex-1 sm:flex-initial text-xs h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado!" : "Copiar Relatório"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
