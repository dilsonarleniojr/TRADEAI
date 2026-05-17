---
Task ID: 30
Agent: portfolio-rebalancing-agent
Task: Create portfolio rebalancing suggestions widget

Work Log:
- Read worklog.md to understand previous agent work (Tasks 8-28+)
- Read store.ts for data types (PortfolioData, TickerData, etc.)
- Read existing dashboard components for styling patterns (pnl-tracker.tsx, portfolio-allocation.tsx, fear-greed-index.tsx)
- Read globals.css for available CSS utility classes (glass-card, card-accent-*, gradient-text-*, number-animate, btn-gradient-*)
- Created `src/components/dashboard/portfolio-rebalancing.tsx` (307 lines) with:
  - **Risk Meter Gauge**: Semi-circular SVG gauge (same style as Fear & Greed Index) with green→yellow→orange→red gradient, animated needle with glow, and risk score display
  - **Diversification Score**: Circular progress ring using SVG with animated strokeDasharray, percentage display, and qualitative label (Well Diversified / Needs Improvement / Poorly Diversified)
  - **Current Allocation Display**: Cash vs Asset breakdown with animated progress bars, color-coded dots, and dollar values
  - **Suggested Actions**: List of up to 5 rebalancing actions (BUY/SELL/INVEST) with current→target percentages, estimated amounts, and staggered framer-motion animations
  - **Risk Assessment Algorithm**: Computes risk score (0-100) based on concentration risk, cash drag, and market volatility; diversification score penalizes single-asset concentration
  - **Rebalancing Algorithm**: Uses market cap weighting heuristic to suggest target allocations (25% cash, 75% assets weighted by market cap); generates specific actions with estimated amounts
  - **Apply Suggestions Button**: btn-gradient-cyan with touch-target; shows confirmation dialog with AnimatePresence modal
  - **Confirmation Dialog**: Glass card overlay with action summary, Cancel/Apply buttons, mock application with success state that auto-resets after 3s
- Integrated component into page.tsx:
  - Added PortfolioRebalancing import
  - Placed after PnlTracker in the dashboard section
- Fixed pre-existing bug in chart-section.tsx: duplicate opening div tag causing JSX parsing error (removed duplicate `<div className="flex flex-wrap items-center gap-2 glass rounded-xl p-3 border border-border/50">`)
- Ran lint: 0 errors, 0 warnings
- Dev server running normally

Stage Summary:
- Portfolio Rebalancing widget with Risk Meter gauge, Diversification Score ring, Current Allocation display, Suggested Actions list, and Apply button with confirmation dialog
- Uses glass-card, card-accent-cyan, gradient-text-cyan, btn-gradient-cyan, number-animate, framer-motion animations consistently
- Heuristic-based rebalancing algorithm using market cap weights (no AI call needed)
- Responsive 3-column grid (mobile stacks to 1 column)
- Fixed pre-existing JSX parsing error in chart-section.tsx
- Component is 307 lines (under 400 line limit)
- Zero lint errors
