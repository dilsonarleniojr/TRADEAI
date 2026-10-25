import { describe, it, expect } from 'bun:test';
import { 
  isBotSemanticState, 
  SEMANTIC_BADGE_CONFIG, 
  type BotSemanticState 
} from '@/components/smart-trading/trading/bot-status-card';
import { 
  isL2Tuple, 
  SharedL2DepthMatrix,
  type L2DepthTuple,
  type L2DepthObject,
  type L2DepthInput
} from '@/lib/performance/shared-l2-depth-matrix';
import { 
  parseBinanceAggTrades, 
  formatMsTime, 
  type BinanceAggTradeRaw 
} from '@/components/smart-trading/trading/recent-trades-tape';
import { 
  calculateFleetMetrics, 
  resolveBotSemanticState 
} from '@/components/smart-trading/screens/bots-screen';
import type { BotInstance } from '@/lib/store';

describe('Code Quality & Pure Architecture Refactor Suite', () => {

  describe('1. Bot Semantic State Type Guard & Static Lookup Table', () => {
    it('isBotSemanticState deve validar estritamente todos os 5 estados permitidos', () => {
      const validStates: BotSemanticState[] = [
        'active',
        'paused',
        'waiting_signal',
        'circuit_breaker',
        'cooldown',
      ];

      for (const st of validStates) {
        expect(isBotSemanticState(st)).toBe(true);
      }
    });

    it('isBotSemanticState deve rejeitar valores inválidos, nulos ou primitivos arbitrários', () => {
      expect(isBotSemanticState('stopped')).toBe(false);
      expect(isBotSemanticState('running')).toBe(false);
      expect(isBotSemanticState('')).toBe(false);
      expect(isBotSemanticState(null)).toBe(false);
      expect(isBotSemanticState(undefined)).toBe(false);
      expect(isBotSemanticState(123)).toBe(false);
      expect(isBotSemanticState({})).toBe(false);
      expect(isBotSemanticState([])).toBe(false);
    });

    it('SEMANTIC_BADGE_CONFIG deve conter definições exaustivas e imutáveis para cada estado', () => {
      const states: BotSemanticState[] = [
        'active',
        'paused',
        'waiting_signal',
        'circuit_breaker',
        'cooldown',
      ];

      for (const st of states) {
        const config = SEMANTIC_BADGE_CONFIG[st];
        expect(config).toBeDefined();
        expect(typeof config.label).toBe('string');
        expect(config.label.length).toBeGreaterThan(0);
        expect(typeof config.variant).toBe('string');
        expect(typeof config.isDot).toBe('boolean');
      }

      // Validação de correspondência de negócios
      expect(SEMANTIC_BADGE_CONFIG.active.variant).toBe('success');
      expect(SEMANTIC_BADGE_CONFIG.circuit_breaker.variant).toBe('danger');
      expect(SEMANTIC_BADGE_CONFIG.cooldown.variant).toBe('warning');
      expect(SEMANTIC_BADGE_CONFIG.paused.variant).toBe('neutral');
    });
  });

  describe('2. Strict Type Safety em SharedL2DepthMatrix (Zero "as any")', () => {
    it('isL2Tuple type guard deve discriminar corretamente tuplas [price, qty] de objetos', () => {
      const tupleSample: L2DepthTuple = [64500.5, 1.25];
      const objectSample: L2DepthObject = { price: 64500.5, quantity: 1.25 };

      expect(isL2Tuple(tupleSample)).toBe(true);
      expect(isL2Tuple(objectSample)).toBe(false);
      expect(isL2Tuple(null as unknown as L2DepthInput)).toBe(false);
    });

    it('SharedL2DepthMatrix deve processar deltas e snapshots tipados sem casting forçado', () => {
      const matrix = SharedL2DepthMatrix.createDoubleBuffered(10);

      // Aplicação com tupla
      matrix.applyDeltaAndSwap([[65000, 2.5]], []);
      const summaryTuple = matrix.readSnapshotSummary();
      expect(summaryTuple.bestBid).toBe(65000);
      expect(summaryTuple.totalBidVolume).toBe(2.5);

      // Aplicação com objeto
      matrix.applyDeltaAndSwap([], [{ price: 65100, quantity: 3.0 }]);
      const summaryObj = matrix.readSnapshotSummary();
      expect(summaryObj.bestAsk).toBe(65100);
      expect(summaryObj.totalAskVolume).toBe(3.0);

      // Snapshot em lote com tuplas
      const bidTuples: L2DepthTuple[] = [
        [64900, 1.0],
        [64800, 2.0],
      ];
      const askTuples: L2DepthTuple[] = [
        [65200, 1.5],
        [65300, 2.5],
      ];
      matrix.writeDepthSnapshot(bidTuples, askTuples);

      const finalSummary = matrix.readSnapshotSummary();
      expect(finalSummary.bidsCount).toBe(2);
      expect(finalSummary.asksCount).toBe(2);
      expect(finalSummary.bestBid).toBe(64900);
      expect(finalSummary.bestAsk).toBe(65200);
    });
  });

  describe('3. Market Tape Single-Pass & Zero-Alloc Pre-Formatting', () => {
    it('formatMsTime deve formatar timestamp com precisão de milissegundos sem NaN', () => {
      const fixedTs = 1714000000123;
      const formatted = formatMsTime(fixedTs);
      expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
      expect(formatted.endsWith('.123')).toBe(true);
    });

    it('parseBinanceAggTrades deve converter payload raw em ordem reversa cronológica em O(N)', () => {
      const mockRawTrades: BinanceAggTradeRaw[] = [
        { a: 1001, p: '65000.50', q: '0.1500', T: 1714000001000, m: false }, // BUY mais antigo
        { a: 1002, p: '65001.00', q: '0.2500', T: 1714000002000, m: true },  // SELL intermediário
        { a: 1003, p: '65002.50', q: '0.5000', T: 1714000003000, m: false }, // BUY mais recente
      ];

      const parsed = parseBinanceAggTrades(mockRawTrades, 10);
      expect(parsed.length).toBe(3);

      // O trade mais recente (índice 2 do raw) deve ser o primeiro da fita de negócios
      expect(parsed[0].id).toBe('1003');
      expect(parsed[0].price).toBe(65002.5);
      expect(parsed[0].amount).toBe(0.5);
      expect(parsed[0].side).toBe('BUY');
      expect(parsed[0].formattedAmount).toBe('0.5000');
      expect(parsed[0].formattedPrice).toContain('65,002.50');

      // O trade mais antigo deve ser o último
      expect(parsed[2].id).toBe('1001');
      expect(parsed[2].side).toBe('BUY');

      // O trade intermediário é SELL
      expect(parsed[1].id).toBe('1002');
      expect(parsed[1].side).toBe('SELL');
    });

    it('parseBinanceAggTrades deve respeitar maxRows sem alocar arrays excedentes', () => {
      const rawMany = Array.from({ length: 50 }, (_, i) => ({
        a: 2000 + i,
        p: '64000.00',
        q: '1.0000',
        T: 1714000000000 + i * 1000,
        m: i % 2 === 0,
      }));

      const parsed = parseBinanceAggTrades(rawMany, 5);
      expect(parsed.length).toBe(5);
      // Deve pegar os 5 mais recentes (índices 49, 48, 47, 46, 45)
      expect(parsed[0].id).toBe('2049');
      expect(parsed[4].id).toBe('2045');
    });

    it('parseBinanceAggTrades deve retornar array vazio com segurança para entradas inválidas', () => {
      expect(parseBinanceAggTrades(null, 10)).toEqual([]);
      expect(parseBinanceAggTrades(undefined, 10)).toEqual([]);
      expect(parseBinanceAggTrades({}, 10)).toEqual([]);
      expect(parseBinanceAggTrades([], 10)).toEqual([]);
    });
  });

  describe('4. Bots Fleet Single-Pass Metrics & Semantic Resolver', () => {
    const createMockBot = (overrides: Partial<BotInstance> = {}): BotInstance => ({
      id: 'bot-1',
      name: 'Alpha Bot',
      symbol: 'BTCUSDT',
      strategy: 'momentum_rsi',
      active: true,
      status: 'running',
      allocationAmount: 20,
      stopLoss: 1.5,
      takeProfit: 3.5,
      stats: {
        totalTrades: 10,
        buyTrades: 5,
        sellTrades: 5,
        winTrades: 7,
        lossTrades: 3,
        winRate: 70,
        realizedPnl: 15.5,
        lastAction: 'Normal operation',
        lastActionTime: new Date().toISOString(),
      },
      ...overrides,
    });

    it('resolveBotSemanticState deve priorizar Circuit Breaker sobre todas as demais condições', () => {
      const bot = createMockBot({
        active: true,
        stats: {
          totalTrades: 5,
          buyTrades: 2,
          sellTrades: 3,
          winTrades: 1,
          lossTrades: 4,
          winRate: 20,
          realizedPnl: -10,
          lastAction: '🚨 Circuit Breaker Diário Disparado',
          lastActionTime: new Date().toISOString(),
        },
      });

      expect(resolveBotSemanticState(bot)).toBe('circuit_breaker');
    });

    it('resolveBotSemanticState deve identificar Cooldown por 3 perdas consecutivas', () => {
      const bot = createMockBot({
        active: true,
        stats: {
          totalTrades: 5,
          buyTrades: 2,
          sellTrades: 3,
          winTrades: 2,
          lossTrades: 3,
          winRate: 40,
          realizedPnl: -2.5,
          lastAction: 'Aguardando próximo setup',
          lastActionTime: new Date().toISOString(),
        },
      });

      expect(resolveBotSemanticState(bot)).toBe('cooldown');
    });

    it('resolveBotSemanticState deve identificar robô Pausado', () => {
      const bot = createMockBot({
        active: false,
        stats: {
          totalTrades: 0,
          buyTrades: 0,
          sellTrades: 0,
          winTrades: 0,
          lossTrades: 0,
          winRate: 0,
          realizedPnl: 0,
        },
      });

      expect(resolveBotSemanticState(bot)).toBe('paused');
    });

    it('resolveBotSemanticState deve identificar robô Ativo com Posição Aberta', () => {
      const bot = createMockBot({
        active: true,
        position: {
          entryPrice: 65000,
          quantity: 0.1,
          side: 'BUY',
          unrealizedPnl: 1.25,
        },
        stats: {
          totalTrades: 2,
          buyTrades: 1,
          sellTrades: 1,
          winTrades: 2,
          lossTrades: 0,
          winRate: 100,
          realizedPnl: 3.5,
          lastAction: 'Position active',
        },
      });

      expect(resolveBotSemanticState(bot)).toBe('active');
    });

    it('resolveBotSemanticState deve identificar robô Aguardando Sinal quando ativo e sem posição', () => {
      const bot = createMockBot({
        active: true,
        position: undefined,
        stats: {
          totalTrades: 1,
          buyTrades: 1,
          sellTrades: 0,
          winTrades: 1,
          lossTrades: 0,
          winRate: 100,
          realizedPnl: 1.0,
          lastAction: 'Monitorando volatilidade',
        },
      });

      expect(resolveBotSemanticState(bot)).toBe('waiting_signal');
    });

    it('calculateFleetMetrics deve computar métricas da frota em passagem única O(N)', () => {
      const bot1 = createMockBot({
        id: 'b1',
        active: true,
        position: { entryPrice: 60000, quantity: 0.05, side: 'BUY', unrealizedPnl: 2.5 },
        stats: {
          totalTrades: 10,
          buyTrades: 5,
          sellTrades: 5,
          winTrades: 6,
          lossTrades: 4,
          winRate: 60,
          realizedPnl: 10.0,
        },
      });

      const bot2 = createMockBot({
        id: 'b2',
        active: false,
        position: undefined,
        stats: {
          totalTrades: 5,
          buyTrades: 2,
          sellTrades: 3,
          winTrades: 4,
          lossTrades: 1,
          winRate: 80,
          realizedPnl: 5.5,
        },
      });

      const metrics = calculateFleetMetrics([bot1, bot2]);

      expect(metrics.activeBotsCount).toBe(1);
      expect(metrics.inPositionBots.length).toBe(1);
      expect(metrics.inPositionBots[0].id).toBe('b1');
      expect(metrics.totalRealizedPnl).toBe(15.5);
      expect(metrics.totalUnrealizedPnl).toBe(2.5);
      expect(metrics.totalTradesCount).toBe(15);
      expect(metrics.totalWinningTrades).toBe(10);
      expect(metrics.fleetWinRateFormatted).toBe('66.7%');
    });

    it('calculateFleetMetrics deve lidar com frota vazia sem divisão por zero', () => {
      const metrics = calculateFleetMetrics([]);
      expect(metrics.activeBotsCount).toBe(0);
      expect(metrics.inPositionBots.length).toBe(0);
      expect(metrics.totalRealizedPnl).toBe(0);
      expect(metrics.totalUnrealizedPnl).toBe(0);
      expect(metrics.totalTradesCount).toBe(0);
      expect(metrics.totalWinningTrades).toBe(0);
      expect(metrics.fleetWinRateFormatted).toBe('0.0%');
    });
  });

});
