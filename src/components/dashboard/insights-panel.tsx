"use client";

import { useMemo } from "react";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Info,
  Layers,
  Activity,
  ThumbsUp,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent, formatPrice } from "@/lib/format";
import { CRYPTO_BY_SYMBOL } from "@/lib/crypto-meta";
import { useShallow } from "zustand/react/shallow";

interface Insight {
  id: string;
  type: "info" | "warning" | "success" | "danger";
  title: string;
  description: string;
  icon: React.ComponentType<any>;
}

export function InsightsPanel() {
  const { portfolio, trades, tickers, selectedSymbol, botConfig } = useCryptoStore(
  useShallow((s) => ({ portfolio: s.portfolio, trades: s.trades, tickers: s.tickers, selectedSymbol: s.selectedSymbol, botConfig: s.botConfig }))
);

  const insights = useMemo(() => {
    const list: Insight[] = [];
    const total = portfolio.totalValue || 1;

    // 1. Calculate holding positions for concentration analysis
    const symbolMap: Record<string, number> = {};
    const sortedTrades = [...trades].reverse();
    
    for (const t of sortedTrades) {
      if (t.side === "BUY") {
        symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + t.quantity;
      } else {
        symbolMap[t.symbol] = Math.max(0, (symbolMap[t.symbol] || 0) - t.quantity);
      }
    }

    // fallback / current active
    const activeSymbol = selectedSymbol || botConfig.symbol;
    if (portfolio.assetQuantity > 0 && !symbolMap[activeSymbol]) {
      symbolMap[activeSymbol] = portfolio.assetQuantity;
    }

    const holdingAssets: Array<{ symbol: string; value: number; percent: number }> = [];
    for (const [sym, qty] of Object.entries(symbolMap)) {
      if (qty <= 0.0001) continue;
      const currentPrice = tickers[sym]?.price || 0;
      const val = qty * currentPrice;
      holdingAssets.push({
        symbol: sym,
        value: val,
        percent: (val / total) * 100,
      });
    }

    // Insight A: Portfolio concentration
    if (holdingAssets.length > 0) {
      const highest = holdingAssets.reduce((max, asset) => (asset.value > max.value ? asset : max));
      const cleanSym = highest.symbol.replace("USDT", "");
      
      if (highest.percent > 60) {
        list.push({
          id: "concentration_high",
          type: "warning",
          title: "Alta Concentração de Ativo",
          description: `Sua carteira está altamente exposta a ${cleanSym} (${highest.percent.toFixed(1)}% do patrimônio). Considere diversificar para reduzir o risco setorial.`,
          icon: ShieldAlert,
        });
      } else if (highest.percent > 30) {
        list.push({
          id: "concentration_moderate",
          type: "info",
          title: "Exposição Focada",
          description: `${cleanSym} representa ${highest.percent.toFixed(1)}% do seu portfólio. A exposição está sob controle, mas monitore a correlação do mercado.`,
          icon: Layers,
        });
      }
    } else {
      list.push({
        id: "portfolio_empty",
        type: "info",
        title: "Aguardando Alocação",
        description: "Seu capital está 100% em Caixa (stablecoin). Configure e ative as estratégias do bot para iniciar operações automatizadas.",
        icon: Info,
      });
    }

    // Insight B: Win Rate & Strategy effectiveness
    const closedTrades = trades.filter((t) => t.pnl !== 0);
    const wins = closedTrades.filter((t) => t.pnl > 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

    if (closedTrades.length >= 5) {
      if (winRate >= 70) {
        list.push({
          id: "winrate_excellent",
          type: "success",
          title: "Estratégia de Alta Performance",
          description: `Sua taxa de acerto está excelente em ${winRate.toFixed(1)}% nos últimos ${closedTrades.length} trades. Os parâmetros atuais estão altamente calibrados.`,
          icon: ThumbsUp,
        });
      } else if (winRate < 45) {
        list.push({
          id: "winrate_low",
          type: "danger",
          title: "Ajuste de Risco Necessário",
          description: `Taxa de acerto de ${winRate.toFixed(1)}% está abaixo do esperado. Considere ajustar a distância do Stop Loss ou calibração do Take Profit.`,
          icon: AlertTriangle,
        });
      }
    }

    // Insight C: Volatility analysis
    const activeTicker = tickers[activeSymbol];
    if (activeTicker) {
      const vol = activeTicker.priceChangePercent;
      if (Math.abs(vol) > 8) {
        list.push({
          id: "volatility_high",
          type: "warning",
          title: `Alta Volatilidade em ${activeSymbol.replace("USDT", "")}`,
          description: `Este ativo variou ${vol.toFixed(1)}% nas últimas 24h. Recomendamos reduzir o tamanho da mão (exposição) para evitar liquidações inesperadas.`,
          icon: Activity,
        });
      }
    }

    // Insight D: Profit Trend
    const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    if (totalPnl > 0) {
      list.push({
        id: "pnl_positive",
        type: "success",
        title: "Retorno Financeiro Positivo",
        description: `Retorno líquido acumulado de +$${formatPrice(totalPnl)} com as operações do bot. O sistema está gerando alfa consistente sobre o mercado.`,
        icon: TrendingUp,
      });
    }

    // Fallback if no specific insights generated
    if (list.length === 0) {
      list.push({
        id: "default_insight",
        type: "info",
        title: "Inteligência de Mercado Ativa",
        description: "Análise contínua de risco e exposição setorial ligada. Nenhuma divergência crítica de portfólio detectada no momento.",
        icon: Lightbulb,
      });
    }

    return list;
  }, [portfolio, trades, tickers, selectedSymbol, botConfig.symbol]);

  const severityStyles = {
    info: {
      border: "border-crypto-cyan/20 bg-crypto-cyan/5",
      iconColor: "text-crypto-cyan",
      badgeBg: "bg-crypto-cyan/10 text-crypto-cyan border-crypto-cyan/20",
    },
    success: {
      border: "border-crypto-green/20 bg-crypto-green/5",
      iconColor: "text-crypto-green",
      badgeBg: "bg-crypto-green/10 text-crypto-green border-crypto-green/20",
    },
    warning: {
      border: "border-crypto-gold/20 bg-crypto-gold/5",
      iconColor: "text-crypto-gold",
      badgeBg: "bg-crypto-gold/10 text-crypto-gold border-crypto-gold/20",
    },
    danger: {
      border: "border-crypto-red/20 bg-crypto-red/5",
      iconColor: "text-crypto-red",
      badgeBg: "bg-crypto-red/10 text-crypto-red border-crypto-red/20",
    },
  };

  return (
    <Card className="glass-card gradient-border h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-crypto-gold animate-bounce" />
          Insights e Diagnósticos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[350px] overflow-y-auto pr-1 cyan-scrollbar">
        {insights.map((insight) => {
          const style = severityStyles[insight.type];
          const Icon = insight.icon;
          return (
            <div
              key={insight.id}
              className={cn(
                "p-3 rounded-lg border flex gap-3 items-start transition-all duration-200 hover:scale-[1.01] hover:shadow-md",
                style.border
              )}
            >
              <div className={cn("p-1.5 rounded-md bg-secondary/40 shrink-0", style.iconColor)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-foreground truncate">{insight.title}</h4>
                  <span className={cn("text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", style.badgeBg)}>
                    {insight.type === "danger" ? "Risco" : insight.type === "warning" ? "Alerta" : insight.type === "success" ? "Sucesso" : "Info"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {insight.description}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
