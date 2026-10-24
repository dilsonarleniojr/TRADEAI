'use client';

import React, { useState } from 'react';
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
  Percent
} from 'lucide-react';

interface SimulatedOrder {
  id: string;
  time: string;
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP';
  price: string;
  amount: string;
  total: string;
  status: 'FILLED' | 'OPEN' | 'CANCELLED';
  pnl?: string;
  pnlPercent?: number;
}

export const PaperTradingScreen: React.FC = () => {
  const [balance, setBalance] = useState(100000.00);
  const [unrealizedPnl, setUnrealizedPnl] = useState(+1420.50);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');

  const [orders, setOrders] = useState<SimulatedOrder[]>([
    {
      id: 'PT-1092',
      time: '18:42:10',
      pair: 'BTC/USDT',
      side: 'BUY',
      type: 'LIMIT',
      price: '$67,200.00',
      amount: '0.50 BTC',
      total: '$33,600.00',
      status: 'FILLED',
      pnl: '+$840.25',
      pnlPercent: +2.50
    },
    {
      id: 'PT-1091',
      time: '17:30:05',
      pair: 'SOL/USDT',
      side: 'BUY',
      type: 'MARKET',
      price: '$182.40',
      amount: '50 SOL',
      total: '$9,120.00',
      status: 'FILLED',
      pnl: '+$580.25',
      pnlPercent: +6.36
    },
    {
      id: 'PT-1090',
      time: '16:15:22',
      pair: 'ETH/USDT',
      side: 'BUY',
      type: 'LIMIT',
      price: '$3,480.00',
      amount: '4.00 ETH',
      total: '$13,920.00',
      status: 'OPEN',
      pnl: '$0.00',
      pnlPercent: 0
    },
    {
      id: 'PT-1089',
      time: '14:02:11',
      pair: 'AVAX/USDT',
      side: 'SELL',
      type: 'LIMIT',
      price: '$38.20',
      amount: '120 AVAX',
      total: '$4,584.00',
      status: 'FILLED',
      pnl: '+$210.00',
      pnlPercent: +4.58
    }
  ]);

  const handleResetBalance = () => {
    if (confirm('Deseja resetar a banca simulada para $100,000 USD?')) {
      setBalance(100000.00);
      setUnrealizedPnl(0);
    }
  };

  const handleOrderCreated = (order: { side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT' | 'STOP'; price: number; amountUsd: number }) => {
    const numPrice = order.price || 67420.50;
    const total = order.amountUsd;
    const numAmount = +(total / numPrice).toFixed(4);

    const newOrder: SimulatedOrder = {
      id: `PT-${Math.floor(1000 + Math.random() * 9000)}`,
      time: new Date().toLocaleTimeString('pt-BR'),
      pair: selectedPair,
      side: order.side,
      type: order.type,
      price: `$${numPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      amount: `${numAmount} ${selectedPair.split('/')[0]}`,
      total: `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      status: 'FILLED',
      pnl: '+$0.00',
      pnlPercent: 0
    };

    setOrders([newOrder, ...orders]);
    setIsOrderModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner with Balance and Simulator Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--st-text-primary)]">
              Paper Trading & Sandbox Simulator
            </h1>
            <p className="text-xs sm:text-sm text-[var(--st-text-secondary)]">
              Ambiente de execução virtual em tempo real sem risco financeiro • Cotações L2 ao vivo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <SmartButton
            variant="ghost"
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
            Criar Ordem Simulada
          </SmartButton>
        </div>
      </div>

      {/* Account Balance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SmartCard>
          <SmartCardContent className="p-4 space-y-1">
            <span className="text-xs text-[var(--st-text-secondary)]">Saldo Virtual Disponível</span>
            <div className="text-2xl font-bold font-mono text-[var(--st-text-primary)]">
              ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-[var(--st-text-muted)]">Equity Total da Conta Simulada</span>
          </SmartCardContent>
        </SmartCard>

        <SmartCard>
          <SmartCardContent className="p-4 space-y-1">
            <span className="text-xs text-[var(--st-text-secondary)]">P/L Não Realizado (Floating)</span>
            <div className="text-2xl font-bold font-mono text-[var(--st-success)] flex items-center gap-1">
              <TrendingUp className="w-5 h-5" />
              +${unrealizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-[var(--st-success)] font-mono font-medium">+1.42% do equity alocado</span>
          </SmartCardContent>
        </SmartCard>

        <SmartCard>
          <SmartCardContent className="p-4 space-y-1">
            <span className="text-xs text-[var(--st-text-secondary)]">Margem Utilizada em Posições</span>
            <div className="text-2xl font-bold font-mono text-[var(--st-primary)]">
              $42,720.00
            </div>
            <span className="text-[11px] text-[var(--st-text-muted)] font-mono">42.7% da banca em risco</span>
          </SmartCardContent>
        </SmartCard>
      </div>

      {/* Orders Table Container */}
      <SmartCard variant="elevated">
        <SmartCardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <SmartCardTitle className="text-base">Livro de Ordens Virtuais</SmartCardTitle>
            <SmartCardDescription>Registro em tempo real das execuções e posições abertas</SmartCardDescription>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--st-bg-surface)] border border-[var(--st-border)]">
            <button
              type="button"
              onClick={() => setActiveTab('positions')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'positions'
                  ? 'bg-[var(--st-primary)] text-white shadow-sm'
                  : 'text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)]'
              }`}
            >
              Posições Abertas ({orders.filter(o => o.status === 'FILLED').length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-[var(--st-primary)] text-white shadow-sm'
                  : 'text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)]'
              }`}
            >
              Todas as Ordens ({orders.length})
            </button>
          </div>
        </SmartCardHeader>

        <SmartCardContent className="p-0">
          <SmartTable>
            <SmartTableHeader>
              <SmartTableRow>
                <SmartTableHead>ID / Horário</SmartTableHead>
                <SmartTableHead>Ativo</SmartTableHead>
                <SmartTableHead>Operação</SmartTableHead>
                <SmartTableHead>Tipo</SmartTableHead>
                <SmartTableHead className="text-right">Preço</SmartTableHead>
                <SmartTableHead className="text-right">Qtd</SmartTableHead>
                <SmartTableHead className="text-right">Total Nocional</SmartTableHead>
                <SmartTableHead className="text-right">P/L Flutuante</SmartTableHead>
                <SmartTableHead className="text-center">Status</SmartTableHead>
              </SmartTableRow>
            </SmartTableHeader>
            <SmartTableBody>
              {(activeTab === 'positions' ? orders.filter(o => o.status === 'FILLED') : orders).map((ord) => (
                <SmartTableRow key={ord.id}>
                  <SmartTableCell>
                    <div className="flex flex-col">
                      <span className="font-mono font-medium text-[var(--st-text-primary)]">{ord.id}</span>
                      <span className="text-[11px] text-[var(--st-text-muted)]">{ord.time}</span>
                    </div>
                  </SmartTableCell>
                  <SmartTableCell className="font-bold text-[var(--st-text-primary)]">
                    {ord.pair}
                  </SmartTableCell>
                  <SmartTableCell>
                    <SmartBadge variant={ord.side === 'BUY' ? 'success' : 'danger'}>
                      {ord.side === 'BUY' ? 'COMPRA' : 'VENDA'}
                    </SmartBadge>
                  </SmartTableCell>
                  <SmartTableCell className="text-xs font-mono text-[var(--st-text-secondary)]">
                    {ord.type}
                  </SmartTableCell>
                  <SmartTableCell className="text-right font-mono font-medium">
                    {ord.price}
                  </SmartTableCell>
                  <SmartTableCell className="text-right font-mono text-[var(--st-text-secondary)]">
                    {ord.amount}
                  </SmartTableCell>
                  <SmartTableCell className="text-right font-mono font-bold text-[var(--st-text-primary)]">
                    {ord.total}
                  </SmartTableCell>
                  <SmartTableCell className="text-right font-mono font-bold">
                    {ord.pnl && ord.pnl !== '$0.00' ? (
                      <span className="text-[var(--st-success)] flex items-center justify-end gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        {ord.pnl} ({ord.pnlPercent}%)
                      </span>
                    ) : (
                      <span className="text-[var(--st-text-muted)]">-</span>
                    )}
                  </SmartTableCell>
                  <SmartTableCell className="text-center">
                    <SmartBadge 
                      variant={ord.status === 'FILLED' ? 'blue' : ord.status === 'OPEN' ? 'warning' : 'outline'}
                    >
                      {ord.status === 'FILLED' ? 'Executada' : ord.status === 'OPEN' ? 'Aberta no Book' : 'Cancelada'}
                    </SmartBadge>
                  </SmartTableCell>
                </SmartTableRow>
              ))}
            </SmartTableBody>
          </SmartTable>
        </SmartCardContent>
      </SmartCard>

      {/* Modal de Criação de Ordem */}
      <SmartModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        title="Despacho de Ordem Virtual"
        subtitle={`Simulação instantânea com cotação L2 para ${selectedPair}`}
        size="md"
      >
        <SmartOrderPanel
          symbol={selectedPair}
          currentPrice={selectedPair.includes('BTC') ? 67420.50 : selectedPair.includes('SOL') ? 186.40 : 3520.00}
          onOrderPlaced={handleOrderCreated}
        />
      </SmartModal>
    </div>
  );
};
