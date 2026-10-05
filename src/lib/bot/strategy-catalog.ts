// Fonte única de verdade sobre as estratégias e os filtros do motor.
// Dialog de robô, painel de Motores e cartões da frota leem tudo daqui.

import type { BotStrategy } from "@/lib/store";

/** Estilo da estratégia: define em qual regime de mercado ela funciona melhor. */
export type StrategyStyle = "TREND" | "REVERSION" | "HYBRID";

export interface StrategyInfo {
  id: BotStrategy;
  name: string;
  /** Uma frase: quando o robô compra. */
  summary: string;
  /** Regra exata usada pelo motor (mostrada no guia). */
  rule: string;
  style: StrategyStyle;
}

export const STRATEGY_CATALOG: StrategyInfo[] = [
  {
    id: "QUANT_ENSEMBLE",
    name: "Comitê Quant",
    summary: "Compra quando 2 de 3 análises (tendência, momentum, fluxo) concordam.",
    rule: "Tendência: EMA rápida > EMA lenta. Momentum: histograma MACD positivo e RSI < 70. Fluxo: volume acima da média com candle de alta.",
    style: "HYBRID",
  },
  {
    id: "RSI",
    name: "RSI Sobrevenda",
    summary: "Compra quando o RSI cai abaixo do limiar de compra.",
    rule: "RSI(período) ≤ limiar de compra do robô (padrão 30).",
    style: "REVERSION",
  },
  {
    id: "MACD",
    name: "MACD Momentum",
    summary: "Compra quando o MACD cruza para cima da linha de sinal.",
    rule: "Histograma MACD(EMA rápida, EMA lenta, 9) passa de negativo para positivo.",
    style: "TREND",
  },
  {
    id: "BREAKOUT",
    name: "Rompimento com Volume",
    summary: "Compra ao romper a máxima dos últimos 20 candles com volume forte.",
    rule: "Fechamento > máxima dos 20 candles anteriores e volume ≥ 1,5× a média.",
    style: "TREND",
  },
  {
    id: "MEAN_REVERSION",
    name: "Bollinger (Retorno à Média)",
    summary: "Compra quando o preço toca a banda inferior de Bollinger.",
    rule: "Fechamento ≤ banda inferior de Bollinger(20, 2).",
    style: "REVERSION",
  },
  {
    id: "GRID",
    name: "Grade (Mercado Lateral)",
    summary: "Compra na parte baixa da faixa de preço das últimas 48 horas.",
    rule: "Preço no terço inferior da faixa mín–máx de 48 candles e faixa estreita (< 10%).",
    style: "REVERSION",
  },
  {
    id: "AI",
    name: "Sinal da IA",
    summary: "Compra quando a IA emite um sinal de COMPRA para o ativo.",
    rule: "Existe sinal BUY recente do assistente de IA para o símbolo (sem sinal = aguarda).",
    style: "HYBRID",
  },
];

export function getStrategy(id: string): StrategyInfo | undefined {
  return STRATEGY_CATALOG.find((s) => s.id === id);
}

export function strategyName(id: string): string {
  return getStrategy(id)?.name ?? id;
}

export type EngineFilterKey = "useMarketRegime" | "useQuantFunnel" | "useEnsemble";

export interface EngineFilterInfo {
  key: EngineFilterKey;
  name: string;
  /** O que o filtro faz, em linguagem direta. Filtros só BLOQUEIAM compras, nunca forçam uma. */
  description: string;
}

export const ENGINE_FILTERS: EngineFilterInfo[] = [
  {
    key: "useMarketRegime",
    name: "Filtro de Regime",
    description:
      "Bloqueia a compra se a estratégia não combina com o mercado: estratégias de tendência esperam ADX > 20, as de reversão esperam ADX < 25.",
  },
  {
    key: "useQuantFunnel",
    name: "Filtro de Força vs BTC",
    description:
      "Só compra moedas líquidas (> US$ 50 mi/24h) que não estão perdendo mais de 2% para o BTC.",
  },
  {
    key: "useEnsemble",
    name: "Confirmação do Comitê",
    description:
      "Exige que o Comitê Quant (2 de 3) também aprove a compra. Já é a própria estratégia no Comitê Quant.",
  },
];

/** Veto de risco sempre ativo: volatilidade (ATR relativo) acima deste limite bloqueia compras. */
export const VOLATILITY_VETO_LIMIT = 0.05;
