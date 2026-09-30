# Task 5 - Crypto Selector Agent

## Summary
Created CryptoSelector component and updated all hardcoded symbol/color references across the project.

## Files Created
- `/home/z/my-project/src/components/header/crypto-selector.tsx` - New CryptoSelector popover component

## Files Modified
- `/home/z/my-project/src/components/header.tsx` - Replaced Badge with CryptoSelector
- `/home/z/my-project/src/components/dashboard/watchlist.tsx` - Replaced hardcoded symbolColors with CRYPTO_COLORS
- `/home/z/my-project/src/components/dashboard/market-highlights.tsx` - Replaced hardcoded symbolColors with CRYPTO_COLORS
- `/home/z/my-project/src/components/dashboard/correlation-heatmap.tsx` - Added CRYPTO_SHORTS for labels
- `/home/z/my-project/src/components/dashboard/whale-tracker.tsx` - Added CRYPTO_SHORTS and full names
- `/home/z/my-project/src/components/dashboard/portfolio-allocation.tsx` - Replaced hardcoded COLORS with CRYPTO_COLORS
- `/home/z/my-project/src/components/dashboard/market-overview.tsx` - Replaced hardcoded BTC color with CRYPTO_COLORS

## Verification
- `bun run lint` - 0 errors, 0 warnings
- Dev server responding on port 3000
