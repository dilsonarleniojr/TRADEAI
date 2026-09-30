# Task 4 - Update Components with Expanded Symbols

## Summary
Updated 3 component files to use the new 51-symbol crypto metadata system from `@/lib/crypto-meta`.

## Changes Made

### 1. ticker-tape.tsx
- Removed local `symbolColors` object (12 entries)
- Imported `CRYPTO_COLORS` from `@/lib/crypto-meta`
- Now uses `CRYPTO_COLORS[ticker.symbol]` for all 51 symbol colors

### 2. chart-section.tsx
- Removed local `SYMBOLS` array (11 entries)
- Imported `ALL_SYMBOLS` from `@/lib/crypto-meta`
- Select dropdown now shows all 51 symbols
- Added "1w" (1W) and "1M" (1M) to INTERVALS

### 3. page.tsx
- Added 20 new FALLBACK_TICKERS entries (NEAR, ALGO, SUI, APT, SEI, TIA, INJ, ARB, OP, UNI, AAVE, MKR, SHIB, PEPE, FET, RENDER, FIL, LTC, TRX, XRP - some were already present)
- Added 4 new MOCK_AI_SIGNALS for INJUSDT, PEPEUSDT, TIAUSDT, FETUSDT
- No existing data modified

## Verification
- `bun run lint`: 0 errors, 0 warnings
- Dev server compiling successfully
