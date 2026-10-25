'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '../../design-system/smart-trading.css';
import { LoginScreen } from '@/components/smart-trading/screens/login-screen';
import { DashboardScreen } from '@/components/smart-trading/screens/dashboard-screen';
import { ChartsScreen } from '@/components/smart-trading/screens/charts-screen';
import { AIInsightsScreen } from '@/components/smart-trading/screens/ai-insights-screen';
import { BacktestScreen } from '@/components/smart-trading/screens/backtest-screen';
import { BotsScreen } from '@/components/smart-trading/screens/bots-screen';
import { PaperTradingScreen } from '@/components/smart-trading/screens/paper-trading-screen';
import { SettingsScreen } from '@/components/smart-trading/screens/settings-screen';
import { DesignSystemScreen } from '@/components/smart-trading/screens/design-system-screen';
import { SmartBadge } from '@/components/smart-trading/ui/badge';
import { SmartButton } from '@/components/smart-trading/ui/button';
import { GlobalStatusBar } from '@/components/header/global-status-bar';
import { GlobalCommandSearch } from '@/components/header/global-command-search';
import { BotActivityLog } from '@/components/bot/bot-activity-log';
import { BotBackgroundRunner } from '@/components/bot/bot-background-runner';
import { HistoryBootstrap } from '@/components/bot/history-bootstrap';
import { BotReadinessWatcher } from '@/components/bot/bot-readiness';
import { BotExecutionReportDialog } from '@/components/bot/bot-execution-report-dialog';
import { AlertNotification } from '@/components/dashboard/alert-notification';
import { ApiSettingsDialog } from '@/components/header/api-settings-dialog';
import { AiSettingsDialog } from '@/components/header/ai-settings-dialog';
import { DirectAiTradeModal } from '@/components/bot/direct-ai-trade-modal';
import { RiskProfileSelector } from '@/components/bot/risk-profile-selector';
import { DataProvider, useDataProvider } from '@/lib/data-provider';
import { useBinanceData } from '@/hooks/use-binance-data';
import { useBinanceStream } from '@/hooks/use-binance-stream';
import { useDesktopHotkeys } from '@/hooks/use-desktop-hotkeys';
import { useCryptoStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { useShallow } from 'zustand/react/shallow';
import { 
  LayoutDashboard, 
  CandlestickChart, 
  Sparkles, 
  Bot, 
  History, 
  Wallet, 
  Settings, 
  Palette, 
  LogIn, 
  LogOut, 
  Sun, 
  Moon, 
  Bell, 
  ShieldCheck, 
  ChevronRight, 
  Menu, 
  X, 
  Zap, 
  TrendingUp, 
  Activity, 
  ArrowUpRight, 
  Terminal, 
  ChevronUp, 
  ChevronDown, 
  Command, 
  RefreshCw, 
  KeyRound, 
  Brain, 
  Gauge, 
  LineChart, 
  BookOpen, 
  FileText,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

function ModuleLoadingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="text-xs text-neutral-400 font-mono animate-pulse">Carregando módulo avançado...</span>
    </div>
  );
}

// Módulos da Primeira UI integrados com code-splitting
const InstitutionalCockpit = dynamic(
  () => import('@/components/institutional/institutional-cockpit').then((m) => m.InstitutionalCockpit),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const TradeJournalPanel = dynamic(
  () => import('@/components/journal/trade-journal-panel').then((m) => m.TradeJournalPanel),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const TradeHubSection = dynamic(
  () => import('@/components/trade-hub').then((m) => m.TradeHubSection),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const HistorySection = dynamic(
  () => import('@/components/history/history-section').then((m) => m.HistorySection),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const EducationSection = dynamic(
  () => import('@/components/education/education-section').then((m) => m.EducationSection),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);
const ChatSection = dynamic(
  () => import('@/components/ai/chat-section').then((m) => m.ChatSection),
  { ssr: false, loading: () => <ModuleLoadingSkeleton /> }
);

type ScreenId = 
  | 'dashboard' 
  | 'institutional'
  | 'charts' 
  | 'journal'
  | 'bots' 
  | 'trade-hub'
  | 'ai' 
  | 'ai-chat'
  | 'backtest' 
  | 'history'
  | 'paper' 
  | 'education'
  | 'settings' 
  | 'design-system' 
  | 'login';

function SmartTradingPageContent() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('dashboard');
  const [tradingMode, setTradingMode] = useState<'paper' | 'live'>('live');
  const [isDark, setIsDark] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  const [isSyncingBinance, setIsSyncingBinance] = useState(false);

  // Modais de Governança
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [directTradeModalOpen, setDirectTradeModalOpen] = useState(false);

  const { toast } = useToast();
  const { syncBinanceCoins } = useDataProvider();

  // Iniciar feeds de dados e conexões WebSocket da Binance
  useBinanceData();
  useBinanceStream();

  // Registrar Hotkeys Globais: Duplo Esc (Kill-switch), Espaço (Auto-scroll), Ctrl+K (Command palette)
  useDesktopHotkeys({
    enableKillSwitch: true,
    enableSpaceAutoScroll: true,
    enableCommandPalette: true,
  });

  const {
    activeExecutionReport,
    setActiveExecutionReport,
    isCommandSearchOpen,
    setIsCommandSearchOpen,
    isLogAutoScrollPaused,
    toggleLogAutoScroll,
    binanceConnected,
    tickers,
  } = useCryptoStore(
    useShallow((s) => ({
      activeExecutionReport: s.activeExecutionReport,
      setActiveExecutionReport: s.setActiveExecutionReport,
      isCommandSearchOpen: s.isCommandSearchOpen,
      setIsCommandSearchOpen: s.setIsCommandSearchOpen,
      isLogAutoScrollPaused: s.isLogAutoScrollPaused,
      toggleLogAutoScroll: s.toggleLogAutoScroll,
      binanceConnected: s.binanceConnected,
      tickers: s.tickers,
    }))
  );

  // Cotações e saldo real
  const [btcPrice, setBtcPrice] = useState<number>(80935.0);
  const [ethPrice, setEthPrice] = useState<number>(3520.0);
  const [solPrice, setSolPrice] = useState<number>(186.4);
  const [liveNav, setLiveNav] = useState<number>(38.85);

  // Sincronizar cotações e saldo
  useEffect(() => {
    let isMounted = true;
    const syncData = async () => {
      try {
        // 1. Tickers em tempo real
        if (tickers['BTCUSDT']?.price) setBtcPrice(tickers['BTCUSDT'].price);
        if (tickers['ETHUSDT']?.price) setEthPrice(tickers['ETHUSDT'].price);
        if (tickers['SOLUSDT']?.price) setSolPrice(tickers['SOLUSDT'].price);

        // 2. Saldo da conta
        const accRes = await fetch(`/api/account?mode=${tradingMode}`);
        if (accRes.ok) {
          const accJson = await accRes.json();
          if (accJson.success && accJson.data && isMounted) {
            setLiveNav(accJson.data.totalValue || (tradingMode === 'live' ? 38.85 : 9857.14));
          }
        }
      } catch (err: any) {
        console.warn('[SmartTradingPage] Erro ao sincronizar tickers/saldo:', err.message);
      }
    };

    syncData();
    const interval = setInterval(syncData, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [tradingMode, tickers]);

  // Handler de sincronização global com a Binance
  const handleSyncBinanceAll = async () => {
    if (isSyncingBinance) return;
    setIsSyncingBinance(true);
    toast({
      title: "🔄 Sincronizando com a Binance...",
      description: "Carregando todos os pares Spot USDT, livro de ofertas e status de trading.",
    });

    try {
      const result = await syncBinanceCoins();
      if (result.success) {
        toast({
          title: "✅ Sincronização Concluída!",
          description: `${result.count} pares e binários Spot USDT sincronizados diretamente da Binance.`,
        });
      } else {
        toast({
          title: "⚠️ Erro na Sincronização",
          description: "Não foi possível sincronizar agora. Exibindo dados locais.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message || "Falha na comunicação com a Binance",
        variant: "destructive",
      });
    } finally {
      setIsSyncingBinance(false);
    }
  };

  // Alterna o tema
  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'institutional', label: 'Cockpit Institucional', icon: <Gauge className="w-4 h-4" />, badge: 'PnL L2' },
    { id: 'charts', label: 'Gráficos & Boleta', icon: <CandlestickChart className="w-4 h-4" />, badge: 'Ao Vivo' },
    { id: 'journal', label: 'Diário & Analytics', icon: <LineChart className="w-4 h-4" />, badge: 'MAE/MFE' },
    { id: 'bots', label: 'Robôs Quant', icon: <Bot className="w-4 h-4" /> },
    { id: 'trade-hub', label: 'Estúdio Quant & IA', icon: <Sparkles className="w-4 h-4" />, badge: '7 Módulos' },
    { id: 'ai', label: 'IA Insights', icon: <Brain className="w-4 h-4" />, badge: 'Markov' },
    { id: 'ai-chat', label: 'Assistente IA', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'backtest', label: 'Backtesting', icon: <History className="w-4 h-4" /> },
    { id: 'history', label: 'Histórico & Ordens', icon: <FileText className="w-4 h-4" /> },
    { id: 'paper', label: 'Paper Trading', icon: <Wallet className="w-4 h-4" />, badge: '$100k' },
    { id: 'education', label: 'Academia Cripto', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'settings', label: 'Configurações', icon: <Settings className="w-4 h-4" /> },
    { id: 'design-system', label: 'Design System', icon: <Palette className="w-4 h-4" /> },
  ];

  return (
    <div className={`min-h-screen ${isDark ? 'smart-trading-dark' : 'smart-trading-light'} bg-[var(--st-bg)] text-[var(--st-text-primary)] flex flex-col font-sans transition-colors duration-200`}>
      {/* Runners e Notificadores em Background da Primeira UI */}
      <AlertNotification />
      <BotBackgroundRunner />
      <HistoryBootstrap />
      <BotReadinessWatcher />
      <BotExecutionReportDialog
        report={activeExecutionReport}
        open={!!activeExecutionReport}
        onOpenChange={(open) => {
          if (!open) setActiveExecutionReport(null);
        }}
      />

      {/* Diálogos de Governança e Configurações */}
      <ApiSettingsDialog open={apiDialogOpen} onOpenChange={setApiDialogOpen} />
      <AiSettingsDialog open={aiDialogOpen} onOpenChange={setAiDialogOpen} />
      <DirectAiTradeModal open={directTradeModalOpen} onOpenChange={setDirectTradeModalOpen} />

      {/* Barra de Status Global da Exchange (Telemetria, Ping, NTP, Stale Data) */}
      <GlobalStatusBar />

      {/* Topbar Fixa */}
      <header className="sticky top-0 z-40 h-16 border-b border-[var(--st-border)] bg-[var(--st-bg-surface)]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between">
        {/* Left: Mobile Toggle & Brand */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] hover:bg-[var(--st-bg-elevated)]"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div 
            onClick={() => setActiveScreen('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[var(--st-primary)] to-[var(--st-secondary)] flex items-center justify-center text-white font-black text-sm shadow-[0_0_15px_rgba(59,130,246,0.3)] group-hover:scale-105 transition-transform">
              ST
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-[var(--st-text-primary)]">
                  Smart<span className="bg-gradient-to-r from-[var(--st-primary)] to-[var(--st-secondary)] bg-clip-text text-transparent">Trading</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--st-primary)]/15 text-[var(--st-primary)] font-bold">
                  PRO
                </span>
              </div>
              <span className="hidden sm:inline-block text-[10px] text-[var(--st-text-muted)] tracking-wider uppercase font-semibold">
                Fintech Quant AI Platform
              </span>
            </div>
          </div>

          {/* Quick Ticker Pill (Live Binance Data) */}
          <div className="hidden xl:flex items-center gap-4 border-l border-[var(--st-border)] pl-4 ml-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--st-text-secondary)] font-bold">BTC:</span>
              <span className="text-[var(--st-text-primary)] font-semibold">
                ${btcPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--st-text-secondary)] font-bold">ETH:</span>
              <span className="text-[var(--st-text-primary)] font-semibold">
                ${ethPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--st-text-secondary)] font-bold">SOL:</span>
              <span className="text-[var(--st-text-primary)] font-semibold">
                ${solPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live / Paper Mode Switcher & Sync Button */}
        <div className="flex items-center gap-2">
          {/* Botão Sincronizar Binance */}
          <button
            type="button"
            onClick={handleSyncBinanceAll}
            disabled={isSyncingBinance}
            title="Sincronizar todos os binários e livros de ofertas com a Binance"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-xs font-bold text-blue-400 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBinance ? 'animate-spin text-blue-300' : 'text-blue-400'}`} />
            <span className="hidden sm:inline">{isSyncingBinance ? 'Sincronizando...' : 'Sincronizar Binance'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (tradingMode === 'paper') {
                if (confirm('Atenção: Deseja mudar para o modo DINHEIRO REAL (Binance Spot)?\n\nNeste modo, ordens despachadas pela boleta consom saldo real e executam diretamente na Binance.')) {
                  setTradingMode('live');
                }
              } else {
                setTradingMode('paper');
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all shadow-sm ${
              tradingMode === 'live'
                ? 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25 ring-2 ring-red-500/20 animate-pulse'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
            }`}
            title="Alternar entre Modo Simulado e Dinheiro Real"
          >
            <span className={`w-2 h-2 rounded-full ${tradingMode === 'live' ? 'bg-red-500' : 'bg-emerald-400'}`} />
            <span>{tradingMode === 'live' ? 'DINHEIRO REAL' : 'SIMULADO'}</span>
          </button>
        </div>

        {/* Right: Actions, API Dialog, AI Dialog, Command Search, Theme & Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Botão Boleta IA Rápida */}
          <button
            type="button"
            onClick={() => setDirectTradeModalOpen(true)}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-xs text-purple-300 font-semibold transition-all"
            title="Boleta Expressa com Análise de IA"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Trade IA</span>
          </button>

          {/* Botão Chaves Binance API */}
          <button
            type="button"
            onClick={() => setApiDialogOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:bg-[var(--st-bg-elevated)] text-xs text-[var(--st-text-secondary)] hover:text-white transition-all font-medium"
            title="Configurar Chaves da API Binance"
          >
            <KeyRound className={`w-3.5 h-3.5 ${binanceConnected ? 'text-emerald-400' : 'text-neutral-400'}`} />
            <span className="hidden md:inline">{binanceConnected ? 'Binance OK' : 'API Key'}</span>
          </button>

          {/* Botão Provedores de IA */}
          <button
            type="button"
            onClick={() => setAiDialogOpen(true)}
            className="p-2 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] hover:text-white transition-all"
            title="Configurar Provedores de IA (Gemini, OpenAI, Groq, Ollama)"
          >
            <Brain className="w-4 h-4 text-purple-400" />
          </button>

          {/* Quick Command Palette Button (Ctrl + K) */}
          <button
            type="button"
            onClick={() => setIsCommandSearchOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:bg-[var(--st-bg-elevated)] text-xs text-[var(--st-text-muted)] hover:text-white transition-all font-mono"
            title="Buscar comandos e ativos (Ctrl + K / Cmd + K)"
          >
            <Command className="w-3.5 h-3.5 text-[var(--st-primary)]" />
            <kbd className="text-[10px] bg-neutral-800 px-1 py-0.5 rounded border border-neutral-700">⌘K</kbd>
          </button>

          {/* Link back to Main TradeAI Hub */}
          <Link
            href="/"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:bg-[var(--st-bg-elevated)] text-xs text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] transition-all font-medium"
          >
            <span>TradeAI Hub</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--st-primary)]" />
          </Link>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
            className="p-2 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] transition-all"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-[var(--st-warning)]" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--st-primary)]" />
            )}
          </button>

          {/* User Profile Capsule */}
          <div 
            onClick={() => setActiveScreen('settings')}
            className="flex items-center gap-2 pl-2 py-1 pr-2.5 rounded-full border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:border-[var(--st-primary)] cursor-pointer transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] flex items-center justify-center text-white font-bold text-xs ring-2 ring-[var(--st-bg)]">
              DC
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-[var(--st-text-primary)] leading-tight">
                {tradingMode === 'live' ? 'Conta Real (Spot)' : 'Paper Trader'}
              </span>
              <span className="text-[10px] text-[var(--st-text-muted)] font-mono">
                ${liveNav.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar + Dynamic Screen Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Desktop Sidebar */}
        <aside className="hidden md:flex flex-col justify-between w-64 border-r border-[var(--st-border)] bg-[var(--st-bg-surface)]/80 backdrop-blur-sm p-3 shrink-0 overflow-y-auto st-scrollbar">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--st-text-muted)]">
              Módulos da Plataforma
            </div>

            {navItems.map((item) => {
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveScreen(item.id as ScreenId);
                    if (!isLoggedIn && item.id !== 'login') {
                      setIsLoggedIn(true);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[var(--st-primary)] text-white font-semibold shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                      : 'text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] hover:bg-[var(--st-bg-elevated)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isActive ? 'text-white' : 'text-[var(--st-text-muted)]'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : 'bg-[var(--st-bg-elevated)] text-[var(--st-primary)] border border-[var(--st-border)]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sidebar Footer: System Status, Hotkeys & Terminal Toggle */}
          <div className="space-y-3 pt-3 border-t border-[var(--st-border)] mt-4">
            {/* Quick Hotkey Cheat Badge */}
            <div className="p-2.5 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-elevated)] text-[10px] space-y-1 font-mono text-[var(--st-text-muted)]">
              <div className="flex items-center justify-between text-neutral-300 font-bold">
                <span>Atalhos Desktop:</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Kill-Switch:</span>
                <span className="text-red-400 font-bold">Duplo Esc</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto-Scroll Logs:</span>
                <span className="text-blue-400 font-bold">Espaço</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Paleta Comandos:</span>
                <span className="text-cyan-400 font-bold">Ctrl+K</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span>Terminal de Logs</span>
              </div>
              {isTerminalExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isLoggedIn) {
                  setIsLoggedIn(false);
                  setActiveScreen('login');
                } else {
                  setIsLoggedIn(true);
                  setActiveScreen('dashboard');
                }
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[var(--st-text-secondary)] hover:text-[var(--st-danger)] hover:bg-[var(--st-danger)]/10 transition-colors"
            >
              {isLoggedIn ? (
                <>
                  <LogOut className="w-4 h-4 text-[var(--st-danger)]" />
                  <span>Sair do Cockpit</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-[var(--st-primary)]" />
                  <span>Tela de Login</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Mobile Flyout Drawer */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="w-72 h-full bg-[var(--st-bg-surface)] p-4 flex flex-col justify-between border-r border-[var(--st-border)] animate-in slide-in-from-left overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--st-border)] pb-3">
                  <span className="font-bold text-sm text-[var(--st-text-primary)]">Smart Trading Menu</span>
                  <button 
                    type="button" 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-[var(--st-text-muted)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-1">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveScreen(item.id as ScreenId);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium ${
                        activeScreen === item.id
                          ? 'bg-[var(--st-primary)] text-white font-semibold'
                          : 'text-[var(--st-text-secondary)] hover:bg-[var(--st-bg-elevated)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-white font-mono">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--st-border)] mt-4">
                <Link
                  href="/"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-[var(--st-border)] text-xs text-[var(--st-text-primary)]"
                >
                  Voltar ao TradeAI Hub
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Active Screen Viewport + Bottom Dockable Terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {activeScreen === 'login' && (
              <LoginScreen
                onLoginSuccess={() => {
                  setIsLoggedIn(true);
                  setActiveScreen('dashboard');
                }}
                isDark={isDark}
              />
            )}

            {activeScreen === 'dashboard' && (
              <DashboardScreen
                onNavigateTab={(tab) => setActiveScreen(tab as ScreenId)}
                onSelectSymbol={setSelectedPair}
                tradingMode={tradingMode}
              />
            )}

            {activeScreen === 'institutional' && (
              <div className="space-y-4">
                <InstitutionalCockpit />
              </div>
            )}

            {activeScreen === 'charts' && (
              <ChartsScreen 
                initialSymbol={selectedPair} 
                tradingMode={tradingMode}
              />
            )}

            {activeScreen === 'journal' && (
              <div className="space-y-4">
                <TradeJournalPanel />
              </div>
            )}

            {activeScreen === 'bots' && (
              <BotsScreen />
            )}

            {activeScreen === 'trade-hub' && (
              <div className="space-y-4">
                <TradeHubSection />
              </div>
            )}

            {activeScreen === 'ai' && (
              <AIInsightsScreen />
            )}

            {activeScreen === 'ai-chat' && (
              <div className="space-y-4">
                <ChatSection />
              </div>
            )}

            {activeScreen === 'backtest' && (
              <BacktestScreen />
            )}

            {activeScreen === 'history' && (
              <div className="space-y-4">
                <HistorySection />
              </div>
            )}

            {activeScreen === 'paper' && (
              <PaperTradingScreen />
            )}

            {activeScreen === 'education' && (
              <div className="space-y-4">
                <EducationSection />
              </div>
            )}

            {activeScreen === 'settings' && (
              <SettingsScreen
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onOpenApiSettings={() => setApiDialogOpen(true)}
                onOpenAiSettings={() => setAiDialogOpen(true)}
              />
            )}

            {activeScreen === 'design-system' && (
              <DesignSystemScreen />
            )}
          </main>

          {/* Embedded Categorized Log Terminal Dock */}
          {isTerminalExpanded && (
            <div className="h-72 border-t border-[var(--st-border)] bg-[#0a0d14] p-3 overflow-hidden flex flex-col shrink-0 animate-in slide-in-from-bottom-6 duration-200 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800 text-xs">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-white tracking-wide">Terminal de Telemetria e Logs Embutido</span>
                  <SmartBadge variant="blue" size="sm">
                    {isLogAutoScrollPaused ? 'Auto-Scroll: PAUSADO [Espaço]' : 'Auto-Scroll: ATIVO [Espaço]'}
                  </SmartBadge>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleLogAutoScroll()}
                    className="px-2 py-0.5 rounded text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono"
                  >
                    {isLogAutoScrollPaused ? '▶️ Retomar' : '⏸️ Pausar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTerminalExpanded(false)}
                    className="p-1 rounded text-neutral-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden pt-2">
                <BotActivityLog />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Command Search Modal (Ctrl + K / Cmd + K) */}
      <GlobalCommandSearch />
    </div>
  );
}

export default function SmartTradingPage() {
  return (
    <DataProvider>
      <SmartTradingPageContent />
    </DataProvider>
  );
}
