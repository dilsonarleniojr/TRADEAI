/**
 * GeminiChartVision
 * -----------------
 * Institutional multimodal chart analyzer for TradeAI.
 * Connects candlestick patterns, support/resistance detection, and orderflow imbalances.
 */

import { quantAIClient, ChartVisionResponse } from './quant-ai-client';

export interface ChartAnalysisRequest {
  symbol: string;
  timeframe: string;
  chartImageBase64: string;
  context?: string;
}

export class GeminiChartVision {
  /**
   * Analyzes a chart screenshot or base64 canvas render.
   */
  static async analyzeChart(request: ChartAnalysisRequest): Promise<ChartVisionResponse> {
    return quantAIClient.analyzeChart(
      request.symbol,
      request.timeframe,
      request.chartImageBase64,
      request.context
    );
  }

  /**
   * Computes an institutional safety verdict based on visual confidence and levels.
   */
  static evaluateVisualSafety(analysis: ChartVisionResponse, currentPrice: number): {
    isSafeToEnter: boolean;
    nearestSupport: number | null;
    nearestResistance: number | null;
    reason: string;
  } {
    const supports = analysis.key_levels
      .filter((l) => l.level_type === 'support')
      .map((l) => l.price)
      .sort((a, b) => b - a); // descending

    const resistances = analysis.key_levels
      .filter((l) => l.level_type === 'resistance')
      .map((l) => l.price)
      .sort((a, b) => a - b); // ascending

    const nearestSupport = supports.find((p) => p <= currentPrice) || null;
    const nearestResistance = resistances.find((p) => p >= currentPrice) || null;

    if (analysis.confidence_score < 0.6) {
      return {
        isSafeToEnter: false,
        nearestSupport,
        nearestResistance,
        reason: `Low visual model confidence (${(analysis.confidence_score * 100).toFixed(0)}%). Await clearer structure.`,
      };
    }

    if (nearestResistance && (nearestResistance - currentPrice) / currentPrice < 0.003) {
      return {
        isSafeToEnter: false,
        nearestSupport,
        nearestResistance,
        reason: 'Price immediately adjacent (<0.3%) to major visual resistance level.',
      };
    }

    return {
      isSafeToEnter: true,
      nearestSupport,
      nearestResistance,
      reason: `Clear structural corridor. Nearest support: ${nearestSupport ?? 'N/A'}, Nearest resistance: ${nearestResistance ?? 'N/A'}.`,
    };
  }
}
