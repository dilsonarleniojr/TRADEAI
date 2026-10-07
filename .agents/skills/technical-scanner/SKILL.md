---
name: technical-scanner
description: Multi-timeframe technical analysis scanner. Use when user asks to analyze a symbol, scan technicals, check indicators, find support/resistance levels, perform chart analysis, or evaluate entry/exit points for any trading instrument (stocks, forex, crypto).
version: 1.0.0
tags:
  - trading
  - technical-analysis
  - quant
  - charting
  - market-analysis
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - WebFetch
  - WebSearch
---

# Technical Scanner — Multi-Timeframe Technical Analysis

Automated technical analysis workflow. Analyze any trading instrument across multiple timeframes with consistent, reproducible methodology.

## Trigger Conditions

Activate when user mentions:
- "analyze [SYMBOL]", "scan [SYMBOL]", "technical analysis [SYMBOL]"
- "support resistance [SYMBOL]", "indicator check [SYMBOL]"
- "entry point [SYMBOL]", "exit point [SYMBOL]"
- "chart [SYMBOL]", "TA [SYMBOL]", "price action [SYMBOL]"
- Any question about a specific trading instrument's technical posture

## Analysis Framework

### 1. Data Fetching
Fetch OHLCV data across 3 timeframes:
- **Daily** (D1) — primary trend identification
- **4-Hour** (H4) — intermediate structure
- **1-Hour** (H1) — entry/execution timing

Data sources (in priority order):
- Yahoo Finance (`yfinance`) for stocks/ETFs
- Binance API for crypto (`! curl -s "https://api.binance.com/api/v3/klines?symbol=${SYMBOL}USDT&interval=${INTERVAL}&limit=100"`)
- MT5 terminal for forex (check `g:/xau-ea/` for existing data)

### 2. Key Levels Identification
Compute and report:

**Support Levels (S1, S2, S3):**
- S1: Nearest swing low (last 20 candles on D1)
- S2: Previous month low / major structure level
- S3: Previous quarter low / long-term structure

**Resistance Levels (R1, R2, R3):**
- R1: Nearest swing high (last 20 candles on D1)
- R2: Previous month high / major structure level
- R3: Previous quarter high / all-time structure

**Pivot Point (Daily):**
- PP = (H + L + C) / 3
- R1 = 2*PP - L, S1 = 2*PP - H
- R2 = PP + (H - L), S2 = PP - (H - L)

### 3. Indicator Matrix

Run these indicators on D1 and H4 timeframes:

| Indicator | Parameters | D1 Signal | H4 Signal | Combined |
|-----------|-----------|-----------|-----------|----------|
| EMA Cross | 9/21 EMA | — | — | — |
| RSI | 14 period | — | — | — |
| MACD | 12/26/9 | — | — | — |
| Bollinger Bands | 20,2 | — | — | — |
| ATR(14) | Current vs 20-avg | — | — | — |
| Volume | vs 20-day avg | — | — | — |

### 4. Signal Scoring

Score each indicator on a -2 to +2 scale:
- **+2**: Strong bullish signal
- **+1**: Moderate bullish
- **0**: Neutral / conflicting
- **-1**: Moderate bearish
- **-2**: Strong bearish

Composite Score = Sum of all indicator scores
- **>= 6**: Strong Buy
- **3 to 5**: Buy
- **-2 to 2**: Neutral / Wait
- **-5 to -3**: Sell
- **<= -6**: Strong Sell

### 5. Market Regime Detection

Classify current market condition:
- **Trending Up**: Price > 21 EMA, 9 EMA > 21 EMA, ADX > 25
- **Trending Down**: Price < 21 EMA, 9 EMA < 21 EMA, ADX > 25
- **Ranging**: ADX < 20, price oscillating between clear S/R
- **Volatile**: ATR > 1.5x 20-period average, Bollinger Bands expanding
- **Compressing**: Bollinger Band width at 20-period low, ATR declining

## Output Format

```markdown
# [SYMBOL] Technical Analysis Report
**Generated**: [timestamp] | **Data Source**: [source] | **Regime**: [regime]

## Price Snapshot
- Current: $X.XX
- D1 Change: ±X.XX%
- 20-day Range: $LOW — $HIGH
- ATR(14): X.XX

## Key Levels
| Type | Level | Price | Strength |
|------|-------|-------|----------|
| R3   | ...   | $X.XX | Weak/Moderate/Strong |
| R2   | ...   | $X.XX | ... |
| R1   | ...   | $X.XX | ... |
| **PP** | Pivot | $X.XX | — |
| S1   | ...   | $X.XX | ... |
| S2   | ...   | $X.XX | ... |
| S3   | ...   | $X.XX | ... |

## Indicator Dashboard
| Indicator | D1 | H4 | Signal |
|-----------|----|----|--------|
| EMA 9/21 | — | — | 🟢/🔴/⚪ |
| RSI(14) | XX | XX | Overbought/Neutral/Oversold |
| MACD | — | — | Bull/Bear Cross |
| BB(20,2) | — | — | Upper/Mid/Lower |
| ATR(14) | X.XX | X.XX | Normal/Elevated/Low |
| Volume | X.XX | X.XX | Above/Below Avg |

## Composite Score: X/12 → [BUY/SELL/NEUTRAL]

## Risk Considerations
- Nearest stop level: $X.XX (S1 / recent swing low)
- Risk per unit: $X.XX (entry — stop)
- R:R to R1: X.XX (target / risk)
- R:R to R2: X.XX

## Notes
- [Key observation 1]
- [Key observation 2]
- [Divergences, patterns, or unusual conditions]
```

## Execution Constraints

1. Always verify data freshness — warn if data is > 24h old
2. Never provide position sizing advice without knowing account size
3. Cross-reference support/resistance from multiple methods (swing points + pivot formula + round numbers)
4. Flag conflicting signals explicitly — don't force consensus where none exists
5. For crypto: note that TA is less reliable due to 24/7 trading and news-driven moves
6. Always include a disclaimer that this is not financial advice

## Premium Features (Paid Tier)

The full `quant-trader-toolkit` bundle adds:
- **`backtest-engine`**: Full multi-asset backtesting with Sharpe/MDD/win-rate
- **`risk-manager`**: Position sizing, Kelly criterion, portfolio correlation matrix
- **`strategy-optimizer`**: Grid search + walk-forward validation + Monte Carlo simulation
- **`market-data`**: Multi-source ETL pipeline with automated data quality checks

Upgrade at: [GUMROAD_LINK] | [AGENSI_LINK]

## Example Usage

```
User: "analyze BTCUSD"
→ Fetch D1, H4, H1 data from Binance
→ Calculate all levels and indicators
→ Score and classify regime
→ Output formatted report
```

```
User: "scan XAUUSD for entry"
→ Fetch data via MT5 (g:/xau-ea/)
→ Full analysis with emphasis on entry levels and R:R
→ Include nearest swing structure for stop placement
```
