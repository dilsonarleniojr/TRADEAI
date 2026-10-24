'use client';

import React, { useState, useEffect } from 'react';
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
  ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';

type ScreenId = 
  | 'dashboard' 
  | 'charts' 
  | 'ai' 
  | 'bots' 
  | 'backtest' 
  | 'paper' 
  | 'settings' 
  | 'design-system' 
  | 'login';

export default function SmartTradingPage() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('dashboard');
  const [isDark, setIsDark] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [unreadNotifications, setUnreadNotifications] = useState(3);
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  // Alterna o tema
  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'charts', label: 'Gráficos L2', icon: <CandlestickChart className="w-4 h-4" />, badge: 'Ao Vivo' },
    { id: 'ai', label: 'IA Insights', icon: <Sparkles className="w-4 h-4" />, badge: 'Markov' },
    { id: 'bots', label: 'Robôs Quant', icon: <Bot className="w-4 h-4" /> },
    { id: 'backtest', label: 'Backtesting', icon: <History className="w-4 h-4" /> },
    { id: 'paper', label: 'Paper Trading', icon: <Wallet className="w-4 h-4" />, badge: '$100k' },
    { id: 'settings', label: 'Configurações', icon: <Settings className="w-4 h-4" /> },
    { id: 'design-system', label: 'Design System', icon: <Palette className="w-4 h-4" /> },
  ];

  return (
    <div className={`min-h-screen ${isDark ? 'smart-trading-dark' : 'smart-trading-light'} bg-[var(--st-bg)] text-[var(--st-text-primary)] flex flex-col font-sans transition-colors duration-200`}>
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

          {/* Quick Ticker Pill */}
          <div className="hidden lg:flex items-center gap-4 border-l border-[var(--st-border)] pl-4 ml-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--st-text-secondary)] font-bold">BTC:</span>
              <span className="text-[var(--st-text-primary)] font-semibold">$67,420.50</span>
              <span className="text-[var(--st-success)] flex items-center text-[11px]">+3.42%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--st-text-secondary)] font-bold">ETH:</span>
              <span className="text-[var(--st-text-primary)] font-semibold">$3,520.10</span>
              <span className="text-[var(--st-success)] flex items-center text-[11px]">+2.15%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--st-text-secondary)] font-bold">SOL:</span>
              <span className="text-[var(--st-text-primary)] font-semibold">$186.40</span>
              <span className="text-[var(--st-success)] flex items-center text-[11px]">+6.36%</span>
            </div>
          </div>
        </div>

        {/* Right: Actions, Notifications, Theme & Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Link back to Main TradeAI Suite */}
          <Link
            href="/"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:bg-[var(--st-bg-elevated)] text-xs text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] transition-all font-medium"
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

          {/* Notifications Bell */}
          <button
            type="button"
            onClick={() => {
              setUnreadNotifications(0);
              alert('Notificações: 4 robôs em execução regular. Conformal Interval calibrado para BTC/USDT.');
            }}
            title="Notificações do Sistema"
            className="relative p-2 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] hover:text-[var(--st-text-primary)] transition-all"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--st-primary)] text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unreadNotifications}
              </span>
            )}
          </button>

          {/* User Profile Capsule */}
          <div 
            onClick={() => setActiveScreen('settings')}
            className="flex items-center gap-2.5 pl-2 py-1 pr-3 rounded-full border border-[var(--st-border)] bg-[var(--st-bg-surface)] hover:border-[var(--st-primary)] cursor-pointer transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--st-primary)] to-[var(--st-secondary)] flex items-center justify-center text-white font-bold text-xs ring-2 ring-[var(--st-bg)]">
              DC
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-semibold text-[var(--st-text-primary)] leading-tight">Trader Quant</span>
              <span className="text-[10px] text-[var(--st-text-muted)] font-mono">$124,580.40</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar + Dynamic Screen Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Desktop Sidebar (Modular Notion/TradingView Style) */}
        <aside className="hidden md:flex flex-col justify-between w-60 border-r border-[var(--st-border)] bg-[var(--st-bg-surface)]/80 backdrop-blur-sm p-3 shrink-0">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--st-text-muted)]">
              Navegação Principal
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
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
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

          {/* Sidebar Footer: System Status & Auth */}
          <div className="space-y-3 pt-3 border-t border-[var(--st-border)]">
            <div className="p-3 rounded-xl border border-[var(--st-border)] bg-[var(--st-bg-elevated)] space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--st-text-secondary)] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--st-success)] animate-pulse" />
                  Binance Feed
                </span>
                <span className="font-mono text-[var(--st-success)] font-bold">24ms</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--st-text-muted)] font-mono">
                <span>Risco NAV:</span>
                <span>Max 3% Trava</span>
              </div>
            </div>

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
            <div className="w-72 h-full bg-[var(--st-bg-surface)] p-4 flex flex-col justify-between border-r border-[var(--st-border)] animate-in slide-in-from-left">
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

              <div className="pt-3 border-t border-[var(--st-border)]">
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

        {/* Active Screen Viewport */}
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
            />
          )}

          {activeScreen === 'charts' && (
            <ChartsScreen initialSymbol={selectedPair} />
          )}

          {activeScreen === 'ai' && (
            <AIInsightsScreen />
          )}

          {activeScreen === 'backtest' && (
            <BacktestScreen />
          )}

          {activeScreen === 'bots' && (
            <BotsScreen />
          )}

          {activeScreen === 'paper' && (
            <PaperTradingScreen />
          )}

          {activeScreen === 'settings' && (
            <SettingsScreen
              isDark={isDark}
              onToggleTheme={toggleTheme}
            />
          )}

          {activeScreen === 'design-system' && (
            <DesignSystemScreen />
          )}
        </main>
      </div>
    </div>
  );
}
