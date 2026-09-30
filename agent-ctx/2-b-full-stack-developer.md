---
Task ID: 2-b
Agent: full-stack-developer
Task: Build main frontend layout and dashboard UI

Work Log:
- Updated globals.css with crypto dark theme colors (deep blue-tinted dark background, crypto-green, crypto-red, crypto-cyan, crypto-gold CSS variables) and custom scrollbar styling
- Updated layout.tsx with ThemeProvider (next-themes), className="dark" on html tag, updated metadata
- Created Zustand store at /src/lib/store.ts with comprehensive state management (activeSection, selectedSymbol, tradingMode, tickers, klines, botConfig, portfolio, trades, aiSignals, chatMessages, loading states)
- Created format utilities at /src/lib/format.ts (formatPrice, formatVolume, formatPercent, formatTime, formatDate)
- Built sidebar navigation component with icon-based nav, tooltips, active indicator animation, and mobile bottom nav
- Built header component with logo, trading mode toggle (Paper/Live switch), connection status, and bot active badge
- Built footer component with portfolio summary (total value, cash, assets, PnL)
- Created dashboard stat-cards component (Portfolio Value, Total Trades Today, Bot Status, Best Performer)
- Created dashboard market-table component (12 crypto assets with price, 24h change, high/low, volume, trend bar)
- Created dashboard ai-signals component (AI signals with BUY/SELL/HOLD badges and confidence bars)
- Created dashboard recent-trades component (last 5 trades with side icons, price, PnL)
- Built main page.tsx with full dashboard layout, mock data initialization, and coming soon placeholders for other sections
- Ran lint and fixed unused eslint-disable directive warning

Stage Summary:
- Complete dashboard UI with dark crypto theme, responsive layout (sidebar + header + footer + main content), and realistic mock data for 12 crypto symbols, 5 trades, 6 AI signals, and portfolio data
- All components use shadcn/ui, Lucide icons, Framer Motion animations, and Zustand store
- Lint passes with 0 errors and 0 warnings

Files Created/Modified:
- src/app/globals.css - Updated with crypto dark theme and custom scrollbar
- src/app/layout.tsx - Updated with ThemeProvider and dark mode
- src/lib/store.ts - New Zustand store with all state slices
- src/lib/format.ts - New format utility functions
- src/components/sidebar.tsx - New sidebar navigation component
- src/components/header.tsx - New header component
- src/components/footer.tsx - New footer component
- src/components/dashboard/stat-cards.tsx - New stat cards component
- src/components/dashboard/market-table.tsx - New market overview table component
- src/components/dashboard/ai-signals.tsx - New AI signals component
- src/components/dashboard/recent-trades.tsx - New recent trades component
- src/app/page.tsx - New main page with dashboard layout and mock data
