'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useCryptoStore, type TradeData } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { manualCloseBotPosition } from '@/lib/bot/multi-bot-engine';
import { tradeJournalEngine, type TradeJournalRecord, type PerformanceMetrics } from '@/lib/journal/trade-journal-engine';
import { useToast } from '@/hooks/use-toast';
import { SmartCard, SmartCardHeader, SmartCardTitle, SmartCardDescription, SmartCardContent } from '../ui/card';
import { SmartButton } from '../ui/button';
import { SmartBadge } from '../ui/badge';
import { SmartModal } from '../ui/modal';
import { SmartOrderPanel } from '../trading/order-panel';
import { 
  SmartTable, 
  SmartTableHeader, 
  SmartTableBody, 
  SmartTableRow, 
  SmartTableHead, 
  SmartTableCell 
} from '../ui/table';
import { 
  Wallet, 
  Plus, 
  RotateCcw, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Sparkles,
  TrendingUp,
  Percent,
  Trash2,
  AlertTriangle,
  Layers,
  LineChart,
  ShieldAlert,
  Flame,
  Activity
} from 'lucide-react';

interface SimulatedOpenOrder {
  id: string;
  symbol: string;
  type: 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'OCO';
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  total: number;
  status: 'OPEN' | 'TRIGGERED' | 'CANCELLED';
  timestamp: string;
}

export const PaperTradingScreen: React.FC = () => {
  const {
    bots,
    trades,
    portfolio,
    tickers,
    tradingMode,
    setPortfolio,
  } = useCryptoStore(
    useShallow((s) => ({
      bots: s.bots,
      trades: s.trades,
      portfolio: s.portfolio,
      tickers: s.tickers,
      tradingMode: s.tradingMode,
      setPortfolio: s.setPortfolio,
    }))
  );

  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'journal'>('positions');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');

  // Ordens abertas (armazenadas em localStorage sincronizado com OpenOrders)
  const [openOrders, setOpenOrders] = useState<SimulatedOpenOrder[]>([]);

  // Carregar e sincronizar ordens abertas
  useEffect(() => {
    const loadOrders = () => {
      try {
        const saved = localStorage.getItem('tradeai_open_orders');
        if (saved) {
          setOpenOrders(JSON.parse(saved));
        } else {
          // Ordens iniciais de demonstração se vazio
          const initial: SimulatedOpenOrder[] = [
            {
              id: 'ORD-1090',
              symbol: 'BTCUSDT',
              type: 'LIMIT',
              side: 'BUY',
              price: 66800.00,
              quantity: 0.15,
              total: 10020.00,
              status: 'OPEN',
              timestamp: new Date().toLocaleTimeString('pt-BR'),
            },
            {
              id: 'ORD-1091',
              symbol: 'ETHUSDT',
              type: 'LIMIT',
              side: 'BUY',
              price: 3450.00,
              quantity: 2.5,
              total: 8625.00,
              status: 'OPEN',
              timestamp: new Date().toLocaleTimeString('pt-BR'),
            }
          ];
          setOpenOrders(initial);
          localStorage.setItem('tradeai_open_orders', JSON.stringify(initial));
        }
      } catch {
        setOpenOrders([]);
      }
    };
    loadOrders();
  }, []);

  const saveOrders = (updated: SimulatedOpenOrder[]) => {
    setOpenOrders(updated);
    try {
      localStorage.setItem('tradeai_open_orders', JSON.stringify(updated));
    } catch {}
  };

  // Cancelar ordem individual
  const handleCancelOrder = (id: string) => {
    const updated = openOrders.filter((o) => o.id !== id);
    saveOrders(updated);
    toast({
      title: 'Ordem Cancelada',
      description: `A ordem ${id} foi removida do livro.`,
    });
  };

  // Cancelar Todas as Ordens (Global)
  const handleCancelAllOrders = () => {
    if (openOrders.length === 0) return;
    if (confirm(`Deseja cancelar todas as ${openOrders.length} ordens abertas?`)) {
      saveOrders([]);
      toast({
        title: 'Todas as Ordens Canceladas',
        description: 'Todas as ordens pendentes foram removidas.',
        variant: 'destructive',
      });
    }
  };

  // Posições ativas extraídas dos robôs e da store
  const activePositions = useMemo(() => {
    return bots
      .filter((b) => !!b.position && b.position.quantity > 0)
      .map((b) => {
        const pos = b.position!;
        const currentTickerPrice = tickers[pos.symbol]?.price || pos.currentPrice || pos.entryPrice;
        const uPnl = (currentTickerPrice - pos.entryPrice) * pos.quantity;
        const uPnlPercent = pos.entryPrice > 0 ? ((currentTickerPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;

        return {
          botId: b.id,
          botName: b.name,
          symbol: pos.symbol.replace('USDT', '/USDT'),
          side: pos.side || 'BUY',
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          markPrice: currentTickerPrice,
          unrealizedPnl: uPnl,
          unrealizedPnlPercent: uPnlPercent,
          stopLoss: b.stopLoss,
          takeProfit: b.takeProfit,
        };
      });
  }, [bots, tickers]);

  // Fechar posição individual a mercado
  const handleClosePositionMarket = async (botId: string, botName: string) => {
    try {
      await manualCloseBotPosition(botId);
      toast({
        title: 'Posição Fechada a Mercado',
        description: `Posição do robô ${botName} liquidada com sucesso.`,
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao Fechar Posição',
        description: e.message,
      });
    }
  };

  // Métricas do Diário de Trades em Tempo Real (BroadcastChannel / CustomEvent)
  const [journalRecords, setJournalRecords] = useState<TradeJournalRecord[]>(() =>
    tradeJournalEngine.getAllRecords()
  );

  useEffect(() => {
    const unsub = tradeJournalEngine.subscribe((updated) => {
      setJournalRecords(updated);
    });
    return () => unsub();
  }, []);

  const journalMetrics: PerformanceMetrics = useMemo(() => {
    return tradeJournalEngine.calculateMetrics(journalRecords);
  }, [journalRecords]);

  // Saldo da banca simulada
  const balance = portfolio?.totalValue ?? 100000.00;
  const totalUpnl = activePositions.reduce((acc, p) => acc + p.unrealizedPnl, 0);

  const handleResetBalance = () => {
    if (confirm('Deseja resetar a banca simulada para $100,000 USD?')) {
      if (portfolio) {
        setPortfolio({
          ...portfolio,
          totalValue: 100000.00,
          cashBalance: 100000.00,
          pnl: 0,
          pnlPercent: 0,
        });
      }
      toast({
        title: 'Banca Resetada',
        description: 'Saldo simulado restaurado para $100,000.00 USD.',
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner de Saldo e Modo Paper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
                Ambiente de Paper Trading
              </h1>
              <SmartBadge variant="purple" isDot>Simulador de Baixa Latência</SmartBadge>
            </div>
            <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
              Valide estratégias e ordens no book L2 em tempo real sem arriscar capital real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SmartButton
            variant="outline"
            size="sm"
            onClick={handleResetBalance}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Resetar Banca
          </SmartButton>

          <SmartButton
            variant="primary"
            size="sm"
            onClick={() => setIsOrderModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Nova Ordem
          </SmartButton>
        </div>
      </div>

      {/* Cards de Resumo da Banca & MAE/MFE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
          <span className="text-[11px] text-[var(--st-text-muted)] font-medium">Saldo Total da Banca</span>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-[var(--st-text-primary)]">
              ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
              Poder de Compra: ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
          <span className="text-[11px] text-[var(--st-text-muted)] font-medium">uPnL Flutuante em Aberto</span>
          <div className="mt-2">
            <span className={`text-xl font-bold font-mono ${totalUpnl >= 0 ? 'text-[var(--st-success)]' : 'text-[var(--st-danger)]'}`}>
              {totalUpnl >= 0 ? '+' : ''}${totalUpnl.toFixed(2)}
            </span>
            <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
              {activePositions.length} posições ativas
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
          <span className="text-[11px] text-[var(--st-text-muted)] font-medium">MFE Médio (Pico de Lucro)</span>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-emerald-400">
              +{journalMetrics.avgMfePercent.toFixed(2)}%
            </span>
            <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
              Máxima Excursão Favorável
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] flex flex-col justify-between">
          <span className="text-[11px] text-[var(--st-text-muted)] font-medium">MAE Médio (Drawdown Intra-Trade)</span>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-red-400">
              {journalMetrics.avgMaePercent.toFixed(2)}%
            </span>
            <span className="block text-[10px] text-[var(--st-text-muted)] font-mono">
              Payoff (R:R): {journalMetrics.payoffRatio.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation: Posições Ativas, Ordens Abertas e Diário */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--st-border)] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('positions')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'positions'
                ? 'bg-[var(--st-primary)] text-white shadow-sm'
                : 'text-[var(--st-text-secondary)] hover:text-white hover:bg-[var(--st-bg-elevated)]'
            }`}
          >
            Posições Abertas ({activePositions.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'orders'
                ? 'bg-[var(--st-primary)] text-white shadow-sm'
                : 'text-[var(--st-text-secondary)] hover:text-white hover:bg-[var(--st-bg-elevated)]'
            }`}
          >
            Ordens Pendentes ({openOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('journal')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'journal'
                ? 'bg-[var(--st-primary)] text-white shadow-sm'
                : 'text-[var(--st-text-secondary)] hover:text-white hover:bg-[var(--st-bg-elevated)]'
            }`}
          >
            Diário de Trades & MAE/MFE ({journalRecords.length})
          </button>
        </div>

        {activeTab === 'orders' && openOrders.length > 0 && (
          <SmartButton
            variant="danger"
            size="sm"
            onClick={handleCancelAllOrders}
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Cancelar Todas as Ordens
          </SmartButton>
        )}
      </div>

      {/* TAB 1: POSIÇÕES ATIVAS */}
      {activeTab === 'positions' && (
        <SmartCard variant="elevated">
          <SmartCardHeader>
            <div className="flex items-center justify-between">
              <div>
                <SmartCardTitle className="text-base">Posições em Andamento</SmartCardTitle>
                <SmartCardDescription>Acompanhe o PnL flutuante e liquide a mercado instantaneamente</SmartCardDescription>
              </div>
              <SmartBadge variant="blue">{activePositions.length} Ativas</SmartBadge>
            </div>
          </SmartCardHeader>

          <SmartCardContent>
            {activePositions.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--st-text-muted)] space-y-2">
                <p>Nenhuma posição aberta no momento.</p>
                <p className="text-[11px]">Inicie um robô quantitativo ou despache uma ordem pela boleta para abrir posições.</p>
              </div>
            ) : (
              <SmartTable>
                <SmartTableHeader>
                  <SmartTableRow>
                    <SmartTableHead>Par / Robô</SmartTableHead>
                    <SmartTableHead>Lado</SmartTableHead>
                    <SmartTableHead className="text-right">Tamanho</SmartTableHead>
                    <SmartTableHead className="text-right">Preço Entrada</SmartTableHead>
                    <SmartTableHead className="text-right">Preço Marcação</SmartTableHead>
                    <SmartTableHead className="text-right">uPnL (USD)</SmartTableHead>
                    <SmartTableHead className="text-right">uPnL (%)</SmartTableHead>
                    <SmartTableHead className="text-right">Alvos (SL / TP)</SmartTableHead>
                    <SmartTableHead className="text-center">Ação</SmartTableHead>
                  </SmartTableRow>
                </SmartTableHeader>
                <SmartTableBody>
                  {activePositions.map((pos) => (
                    <SmartTableRow key={`${pos.botId}-${pos.symbol}`}>
                      <SmartTableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-xs">{pos.symbol}</span>
                          <span className="text-[10px] text-neutral-400">{pos.botName}</span>
                        </div>
                      </SmartTableCell>
                      <SmartTableCell>
                        <SmartBadge variant={pos.side === 'BUY' ? 'success' : 'danger'} size="sm">
                          {pos.side === 'BUY' ? 'LONG' : 'SHORT'}
                        </SmartBadge>
                      </SmartTableCell>
                      <SmartTableCell className="text-right font-mono text-xs text-white">
                        {pos.quantity.toFixed(4)}
                      </SmartTableCell>
                      <SmartTableCell className="text-right font-mono text-xs text-neutral-300">
                        ${pos.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </SmartTableCell>
                      <SmartTableCell className="text-right font-mono text-xs text-white font-bold">
                        ${pos.markPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </SmartTableCell>
                      <SmartTableCell className={`text-right font-mono text-xs font-bold ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </SmartTableCell>
                      <SmartTableCell className={`text-right font-mono text-xs font-bold ${pos.unrealizedPnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.unrealizedPnlPercent >= 0 ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%
                      </SmartTableCell>
                      <SmartTableCell className="text-right font-mono text-[10px] text-neutral-400">
                        SL: {pos.stopLoss}% • TP: {pos.takeProfit}%
                      </SmartTableCell>
                      <SmartTableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => handleClosePositionMarket(pos.botId, pos.botName)}
                          className="px-2.5 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/40 text-[11px] font-bold transition-all"
                        >
                          Market Close
                        </button>
                      </SmartTableCell>
                    </SmartTableRow>
                  ))}
                </SmartTableBody>
              </SmartTable>
            )}
          </SmartCardContent>
        </SmartCard>
      )}

      {/* TAB 2: ORDENS PENDENTES (ABERTAS) */}
      {activeTab === 'orders' && (
        <SmartCard variant="elevated">
          <SmartCardHeader>
            <div className="flex items-center justify-between">
              <div>
                <SmartCardTitle className="text-base">Livro de Ordens Abertas</SmartCardTitle>
                <SmartCardDescription>Ordens limite e stops aguardando execução por confluência no book</SmartCardDescription>
              </div>
              <SmartBadge variant="warning">{openOrders.length} Pendentes</SmartBadge>
            </div>
          </SmartCardHeader>

          <SmartCardContent>
            {openOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--st-text-muted)] space-y-2">
                <p>Nenhuma ordem limite pendente no momento.</p>
              </div>
            ) : (
              <SmartTable>
                <SmartTableHeader>
                  <SmartTableRow>
                    <SmartTableHead>ID Ordem</SmartTableHead>
                    <SmartTableHead>Horário</SmartTableHead>
                    <SmartTableHead>Par</SmartTableHead>
                    <SmartTableHead>Tipo</SmartTableHead>
                    <SmartTableHead>Lado</SmartTableHead>
                    <SmartTableHead className="text-right">Preço Limite</SmartTableHead>
                    <SmartTableHead className="text-right">Quantidade</SmartTableHead>
                    <SmartTableHead className="text-right">Total USD</SmartTableHead>
                    <SmartTableHead className="text-center">Ação</SmartTableHead>
                  </SmartTableRow>
                </SmartTableHeader>
                <SmartTableBody>
                  {openOrders.map((ord) => (
                    <SmartTableRow key={ord.id}>
                      <SmartTableCell className="font-mono text-xs text-neutral-400">
                        {ord.id}
                      </SmartTableCell>
                      <SmartTableCell className="text-xs text-neutral-400 font-mono">
                        {ord.timestamp}
                      </SmartTableCell>
                      <SmartTableCell className="font-bold text-white text-xs">
                        {ord.symbol.replace('USDT', '/USDT')}
                      </SmartTableCell>
                      <SmartTableCell>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                          {ord.type}
                        </span>
                      </SmartTableCell>
                      <SmartTableCell>
                        <SmartBadge variant={ord.side === 'BUY' ? 'success' : 'danger'} size="sm">
                          {ord.side}
                        </SmartBadge>
                      </SmartTableCell>
                      <SmartTableCell className="text-right font-mono text-xs text-white">
                        ${ord.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </SmartTableCell>
                      <SmartTableCell className="text-right font-mono text-xs text-neutral-300">
                        {ord.quantity.toFixed(4)}
                      </SmartTableCell>
                      <SmartTableCell className="text-right font-mono text-xs text-white font-bold">
                        ${ord.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </SmartTableCell>
                      <SmartTableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(ord.id)}
                          className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Cancelar Ordem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </SmartTableCell>
                    </SmartTableRow>
                  ))}
                </SmartTableBody>
              </SmartTable>
            )}
          </SmartCardContent>
        </SmartCard>
      )}

      {/* TAB 3: DIÁRIO DE TRADES & MAE / MFE */}
      {activeTab === 'journal' && (
        <SmartCard variant="elevated">
          <SmartCardHeader>
            <div className="flex items-center justify-between">
              <div>
                <SmartCardTitle className="text-base">Diário de Execuções & Rastreamento MAE/MFE</SmartCardTitle>
                <SmartCardDescription>
                  Auditoria pós-trade com análise quantitativa de excursão favorável e adversa
                </SmartCardDescription>
              </div>
              <SmartBadge variant="purple">{journalRecords.length} Trades Registrados</SmartBadge>
            </div>
          </SmartCardHeader>

          <SmartCardContent>
            {journalRecords.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--st-text-muted)] space-y-2">
                <p>Nenhum trade encerrado no diário quantitativo ainda.</p>
                <p className="text-[11px]">As métricas de MAE e MFE são computadas automaticamente no fechamento de cada ordem.</p>
              </div>
            ) : (
              <SmartTable>
                <SmartTableHeader>
                  <SmartTableRow>
                    <SmartTableHead>Par</SmartTableHead>
                    <SmartTableHead>Lado</SmartTableHead>
                    <SmartTableHead className="text-right">Preço Entrada</SmartTableHead>
                    <SmartTableHead className="text-right">Preço Saída</SmartTableHead>
                    <SmartTableHead className="text-right">PnL Realizado</SmartTableHead>
                    <SmartTableHead className="text-center">MFE (Pico Lucro)</SmartTableHead>
                    <SmartTableHead className="text-center">MAE (Pior Queda)</SmartTableHead>
                    <SmartTableHead className="text-right">R:R</SmartTableHead>
                    <SmartTableHead className="text-right">Horário</SmartTableHead>
                  </SmartTableRow>
                </SmartTableHeader>
                <SmartTableBody>
                  {journalRecords.slice(0, 25).map((rec) => {
                    const isWin = rec.netPnl >= 0;
                    return (
                      <SmartTableRow key={rec.id}>
                        <SmartTableCell className="font-bold text-white text-xs">
                          {rec.symbol.replace('USDT', '/USDT')}
                        </SmartTableCell>
                        <SmartTableCell>
                          <SmartBadge variant={rec.side === 'BUY' ? 'success' : 'danger'} size="sm">
                            {rec.side}
                          </SmartBadge>
                        </SmartTableCell>
                        <SmartTableCell className="text-right font-mono text-xs text-neutral-300">
                          ${rec.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </SmartTableCell>
                        <SmartTableCell className="text-right font-mono text-xs text-white">
                          ${rec.exitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </SmartTableCell>
                        <SmartTableCell className={`text-right font-mono text-xs font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isWin ? '+' : ''}${rec.netPnl.toFixed(2)} ({isWin ? '+' : ''}{rec.netGainPercent.toFixed(2)}%)
                        </SmartTableCell>
                        <SmartTableCell className="text-center font-mono text-xs font-bold text-emerald-400">
                          +{rec.mfePercent.toFixed(2)}%
                        </SmartTableCell>
                        <SmartTableCell className="text-center font-mono text-xs font-bold text-red-400">
                          {rec.maePercent.toFixed(2)}%
                        </SmartTableCell>
                        <SmartTableCell className="text-right font-mono text-xs text-neutral-300">
                          {rec.riskRewardRatio !== undefined ? `${rec.riskRewardRatio.toFixed(2)}x` : '-'}
                        </SmartTableCell>
                        <SmartTableCell className="text-right font-mono text-[10px] text-neutral-400">
                          {new Date(rec.exitTimestampMs || rec.exitTime).toLocaleTimeString('pt-BR')}
                        </SmartTableCell>
                      </SmartTableRow>
                    );
                  })}
                </SmartTableBody>
              </SmartTable>
            )}
          </SmartCardContent>
        </SmartCard>
      )}

      {/* Modal de Criação de Ordem */}
      <SmartModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        title="Despachar Nova Ordem Simulada"
      >
        <SmartOrderPanel
          symbol={selectedPair}
          currentPrice={tickers[selectedPair.replace('/', '')]?.price || 80900.0}
          tradingMode={tradingMode}
        />
      </SmartModal>
    </div>
  );
};
