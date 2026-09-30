# Task 28-B: Light Theme Polish and Contextual Details

## Agent: main

## Work Completed:

### 1. Light Theme Polish (globals.css)
- Updated `:root` theme variables for better light mode contrast:
  - `--muted-foreground`: `oklch(0.45 0.01 260)` with slight cyan tint
  - `--glass-bg`: `oklch(1 0 0 / 92%)` for more opaque cards
  - `--glass-border`: `oklch(0.82 0.01 260 / 70%)` for more visible borders
  - `--grid-line`: `oklch(0.88 0.005 260 / 30%)` for subtle dot grid
  - `--glow-opacity`: `8%` for subtler effects
- Added `:root .glass-card` with subtle box-shadow
- Added `:root .glow-cyan-sm/green-sm/red-sm` with subtle shadow effects
- Added `:root .gradient-text-cyan/green/gold` with darker gradient stops for readability
- Added `:root .card-accent-cyan/green/gold/red::after` with stronger accent lines
- Added `:root .input-glow:focus` with darker focus ring
- Added `:root .glow-breathe` with `glow-breathe-light` keyframe animation
- Added `:root .cyan-scrollbar` variants with darker colors
- Updated `.table-row-hover:hover` and `.table-row-alt` for light mode contrast

### 2. Stat Cards Tooltips (stat-cards.tsx)
- Added Tooltip with Info icon on each card title:
  - Portfolio Value: "Total portfolio value including cash and assets"
  - Total Trades Today: "Number of trades executed today"
  - Bot Status: "Current bot operational status"
  - Best Performer: "Best performing asset in the last 24h"

### 3. Fear & Greed Index (fear-greed-index.tsx)
- Added Info button with Tooltip explaining sentiment index
- Added "Current" label next to gauge value

### 4. Market Overview (market-overview.tsx)
- Added tooltips on Total Market Cap, BTC Dominance, 24h Volume, DeFi TVL, Stablecoin MCap
- MetricCard component extended with tooltip prop

### 5. Funding Rates (funding-rates.tsx)
- Added tooltips on Funding Rate, OI, and L/S Ratio column headers

### 6. P&L Tracker (pnl-tracker.tsx)
- Added tooltips on Today/7d/30d breakdown cards

### 7. Created ShortcutsHint Component (shortcuts-hint.tsx)
- Floating keyboard icon button in bottom-left
- Popover with 5 keyboard shortcuts (1-6, B, T, M, S)
- Framer Motion animation, accessible design

### 8. Integrated ShortcutsHint in page.tsx

## Verification:
- `bun run lint`: 0 errors, 0 warnings
- Dev server running normally
- All CSS light theme variants use `:root` selector, dark theme unaffected
