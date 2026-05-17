# Task 7-9: Mobile-optimize Chart, AI Chat, Bot, Backtest, and History sections

## Summary
All 5 section components have been mobile-optimized with responsive layouts, horizontally scrollable controls, touch-friendly targets, and proper mobile/desktop adaptive layouts.

## Files Modified
1. `/home/z/my-project/src/components/chart/chart-section.tsx` - Chart controls split into 2 scrollable rows, 36px mobile touch targets
2. `/home/z/my-project/src/components/ai/chat-section.tsx` - Sheet-based mobile signal panel, dvh height, 85% bubble width
3. `/home/z/my-project/src/components/bot/bot-section.tsx` - Vertical stacking control panel on mobile
4. `/home/z/my-project/src/components/backtest/backtest-section.tsx` - Responsive padding
5. `/home/z/my-project/src/components/backtest/backtest-results.tsx` - Horizontally scrollable metrics, responsive charts
6. `/home/z/my-project/src/components/history/history-section.tsx` - Responsive cards, scrollable table

## Key Changes
- Chart: 2-row scrollable controls (drawing tools+symbol+intervals / indicator toggles), h-9 mobile buttons
- Chat: "Sinais" button opens Sheet from right on mobile, right panel hidden on mobile, h-[calc(100dvh-12rem)]
- Bot: flex-col sm:flex-row control panel, full-width button on mobile
- Backtest: flex-based horizontal scroll for metric cards on mobile, grid on lg
- History: mobile-scroll-x on trade table, responsive padding/sizing

## Lint
- 0 errors, 0 warnings
