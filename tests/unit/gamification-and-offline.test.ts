import { describe, expect, it } from 'bun:test';
import { TraderGamificationEngine } from '@/lib/gamification/trader-achievements';
import { OfflineSimulationEngine } from '@/lib/offline/offline-simulation-engine';
import { QuantAIClient } from '@/lib/ai/quant-ai-client';
import { GeminiChartVision } from '@/lib/ai/gemini-chart-vision';

describe('Gamification Engine (TraderAchievements)', () => {
  it('should initialize with Novice Apprentice rank and level 1', () => {
    const engine = new TraderGamificationEngine();
    const profile = engine.getProfile();

    expect(profile.currentLevel).toBe(1);
    expect(profile.rank).toBe('Novice Apprentice');
    expect(profile.totalXp).toBe(0);
    expect(profile.badges.length).toBeGreaterThan(0);
  });

  it('should progress level and rank when sufficient XP is awarded', () => {
    const engine = new TraderGamificationEngine();
    const res = engine.addXp(1200, 'Manual deposit test');

    expect(res.newTotalXp).toBe(1200);
    expect(res.leveledUp).toBe(true);
    expect(res.newLevel).toBe(3);

    const profile = engine.getProfile();
    expect(profile.rank).toBe('Risk Disciplined Trader');
  });

  it('should reward disciplined trades, advance streak, and unlock badges', () => {
    const engine = new TraderGamificationEngine();

    // 10 disciplined trades
    for (let i = 0; i < 10; i++) {
      engine.evaluateTrade({
        respectsStopLoss: true,
        riskPctOfNav: 1.5,
        cooldownRespected: true,
        pnlRealizedPct: 1.2,
      });
    }

    const profile = engine.getProfile();
    expect(profile.disciplinedTradesStreak).toBe(10);
    expect(profile.totalCompliantTrades).toBe(10);

    const slBadge = profile.badges.find((b) => b.id === 'stop_loss_guardian');
    expect(slBadge?.unlockedAt).toBeDefined();
    expect(slBadge?.progressPct).toBe(100);

    const monkBadge = profile.badges.find((b) => b.id === 'anti_revenge_monk');
    expect(monkBadge?.unlockedAt).toBeDefined();
  });

  it('should reset streak if stop loss is violated', () => {
    const engine = new TraderGamificationEngine();
    engine.evaluateTrade({
      respectsStopLoss: true,
      riskPctOfNav: 1.0,
      cooldownRespected: true,
      pnlRealizedPct: 2.0,
    });
    expect(engine.getProfile().disciplinedTradesStreak).toBe(1);

    // Violation
    engine.evaluateTrade({
      respectsStopLoss: false,
      riskPctOfNav: 3.5, // breached risk
      cooldownRespected: false,
      pnlRealizedPct: -4.0,
    });
    expect(engine.getProfile().disciplinedTradesStreak).toBe(0);
  });
});

describe('Offline Simulation Engine', () => {
  it('should generate synthetic ticks within reasonable bounds via GBM', () => {
    const sim = new OfflineSimulationEngine(10000);
    sim.setPrice('BTCUSDT', 65000);

    const nextPrice = sim.generateSyntheticTick('BTCUSDT', {
      initialPrice: 65000,
      volatility: 0.02,
      drift: 0.0001,
      tickSize: 0.1,
      timeStepSeconds: 60,
    });

    expect(nextPrice).toBeGreaterThan(60000);
    expect(nextPrice).toBeLessThan(70000);
    expect(sim.getPrice('BTCUSDT')).toBe(nextPrice);
  });

  it('should execute market buy with taker fee and slippage', () => {
    const sim = new OfflineSimulationEngine(10000);
    sim.setPrice('BTCUSDT', 60000);

    const order = sim.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
    });

    expect(order.status).toBe('FILLED');
    expect(order.avgFillPrice).toBeGreaterThan(60000); // slippage applied

    const pos = sim.getPositions();
    expect(pos.length).toBe(1);
    expect(pos[0].symbol).toBe('BTCUSDT');
    expect(pos[0].side).toBe('LONG');
    expect(pos[0].quantity).toBe(0.1);

    const stats = sim.getStats();
    expect(stats.balance).toBeLessThan(10000); // fee deducted
  });

  it('should trigger stop loss automatically on price decline', () => {
    const sim = new OfflineSimulationEngine(10000);
    sim.setPrice('BTCUSDT', 60000);

    sim.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      stopLossPrice: 59000,
      takeProfitPrice: 63000,
    });

    expect(sim.getPositions().length).toBe(1);

    // Price crashes past stop loss
    sim.setPrice('BTCUSDT', 58500);

    // Position should be liquidated
    expect(sim.getPositions().length).toBe(0);
    const closed = sim.getClosedTrades();
    expect(closed.length).toBe(1);
    expect(closed[0].realizedPnl).toBeLessThan(0); // loss realized
  });

  it('should match pending limit order when price reaches limit', () => {
    const sim = new OfflineSimulationEngine(10000);
    sim.setPrice('BTCUSDT', 65000);

    const limitOrder = sim.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      price: 64000,
      quantity: 0.2,
    });

    expect(limitOrder.status).toBe('OPEN');
    expect(sim.getPositions().length).toBe(0);

    // Price dips to limit price
    sim.setPrice('BTCUSDT', 63950);

    expect(sim.getPositions().length).toBe(1);
    expect(sim.getPositions()[0].quantity).toBe(0.2);
  });
});

describe('QuantAIClient & GeminiChartVision (Integration & Fallbacks)', () => {
  it('should calculate calibrated conformal intervals in fallback mode', async () => {
    const client = new QuantAIClient('http://127.0.0.1:9999'); // invalid port to force fallback
    const res = await client.predictConformal(
      [0.05, 0.08, 0.02, 0.12, 0.04, 0.09],
      [65000, 65500],
      0.05
    );

    expect(res.source).toBe('local_fallback');
    expect(res.intervals.length).toBe(2);
    expect(res.quantile_q).toBeGreaterThan(0);
    expect(res.intervals[0].lower).toBeLessThan(65000);
    expect(res.intervals[0].upper).toBeGreaterThan(65000);
  });

  it('should audit adversarial robustness in fallback mode', async () => {
    const client = new QuantAIClient('http://127.0.0.1:9999');
    const features = [
      [0.8, 0.9, 0.85],
      [0.75, 0.82, 0.79],
      [0.2, 0.15, 0.25],
    ];

    const audit = await client.auditAdversarialRobustness(features, {
      decisionThreshold: 0.5,
      epsilon: 0.01,
      flipTolerancePct: 5.0,
    });

    expect(audit.source).toBe('local_fallback');
    expect(audit.total_samples).toBe(3);
    expect(audit.is_robust).toBeDefined();
  });

  it('should evaluate visual structural safety correctly', () => {
    const dummyAnalysis = {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      primary_trend: 'bullish' as const,
      candlestick_patterns: ['Hammer'],
      chart_patterns: ['Bull Flag'],
      key_levels: [
        { price: 63000, level_type: 'support' as const, strength: 0.9 },
        { price: 68000, level_type: 'resistance' as const, strength: 0.85 },
      ],
      summary: 'Strong structural trend',
      confidence_score: 0.88,
      risk_assessment: 'Safe',
      source: 'gemini-2.5-flash',
    };

    const safety = GeminiChartVision.evaluateVisualSafety(dummyAnalysis, 65000);
    expect(safety.isSafeToEnter).toBe(true);
    expect(safety.nearestSupport).toBe(63000);
    expect(safety.nearestResistance).toBe(68000);

    // Reject when immediately under resistance (<0.3%)
    const unsafeAtResistance = GeminiChartVision.evaluateVisualSafety(dummyAnalysis, 67900);
    expect(unsafeAtResistance.isSafeToEnter).toBe(false);
  });
});
