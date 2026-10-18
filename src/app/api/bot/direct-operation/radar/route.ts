import { NextRequest, NextResponse } from 'next/server';
import { MarketOpportunitySelector } from '@/lib/bot/pilot/market-opportunity-selector';
import { DirectOperationManager } from '@/lib/bot/pilot/direct-operation-manager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const strategy = searchParams.get('strategy') || 'AUTO';

    const selector = MarketOpportunitySelector.getInstance();
    const cooldownSymbols = DirectOperationManager.getCooldownSymbols();

    const bestOpportunity = await selector.findBestOpportunity(
      70.0,
      'https://api.binance.com',
      strategy as any,
      cooldownSymbols
    );

    return NextResponse.json({
      success: true,
      data: {
        selected: {
          symbol: bestOpportunity.symbol,
          score: bestOpportunity.score,
          effectiveStrategy: bestOpportunity.effectiveStrategy,
          currentPrice: bestOpportunity.marketData.lastPrice,
          priceChange24hPct: bestOpportunity.marketData.priceChange24hPct,
          volume24hUsd: bestOpportunity.marketData.volume24hUsd,
          spreadPercent: bestOpportunity.marketData.spreadPct,
          rationale: bestOpportunity.triggerCondition.conditionDescription,
          targetEntryPrice: bestOpportunity.triggerCondition.targetPrice,
          triggerCondition: bestOpportunity.triggerCondition,
          isCooldownApplied: bestOpportunity.isCooldownApplied,
          aiThoughtStream: bestOpportunity.aiThoughtStream,
          orderFlowMetrics: bestOpportunity.orderFlowMetrics,
          marketRegime: bestOpportunity.marketRegime,
          multiTimeframe: bestOpportunity.multiTimeframe,
          sentimentFilter: bestOpportunity.sentimentFilter,
          volatilitySizing: bestOpportunity.volatilitySizing,
          tripleTargetLadder: bestOpportunity.tripleTargetLadder,
        },
        topRanked: bestOpportunity.topRanked || [],
        cooldownSymbols,
        isCooldownApplied: bestOpportunity.isCooldownApplied,
        aiThoughtStream: bestOpportunity.aiThoughtStream,
        orderFlowMetrics: bestOpportunity.orderFlowMetrics,
        marketRegime: bestOpportunity.marketRegime,
        multiTimeframe: bestOpportunity.multiTimeframe,
        sentimentFilter: bestOpportunity.sentimentFilter,
        volatilitySizing: bestOpportunity.volatilitySizing,
        tripleTargetLadder: bestOpportunity.tripleTargetLadder,
      },
    });
  } catch (error: any) {
    console.error('[API /api/bot/direct-operation/radar] Erro ao varrer oportunidades:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao buscar radar de oportunidades.' },
      { status: 500 }
    );
  }
}
