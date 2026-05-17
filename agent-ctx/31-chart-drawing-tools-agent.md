# Task 31: Chart Drawing Tools Agent

## Task: Add chart drawing tools (trendlines, horizontal lines)

## Work Log:
- Read worklog.md to understand previous agent work (Tasks 8-28)
- Read existing candlestick-chart.tsx (1397 lines) thoroughly to understand SVG coordinate system, scale functions, and rendering pipeline
- Read chart-section.tsx to understand the controls and state management
- Read store.ts for state management patterns
- Added DrawingTool type export ('crosshair' | 'trendline' | 'horizontal') to candlestick-chart.tsx
- Added Drawing interface export with fields for trendline points (startTime, startPrice, endTime, endPrice) and horizontal line price, plus color and id
- Extended CandlestickChartProps with drawingTool, drawings, and onDrawingAdd props
- Added drawing state to CandlestickChart: pendingDrawPoint (for trendline two-click workflow), drawMousePos (for preview lines)
- Added timeToX helper: converts candle openTime to pixel X position, works for off-screen candles by computing relative index from visibleCandles offset
- Added yToPrice helper: converts pixel Y position to price value for click-based drawing
- Added handleChartClick function: handles drawing tool interactions - horizontal lines create on single click, trendlines use two-click workflow (first click sets start, second click creates the line)
- Modified handleMouseMove: tracks drawMousePos for drawing preview lines when a drawing tool is active
- Modified handleMouseLeave: also clears drawMousePos
- Added useEffect to clear pendingDrawPoint and drawMousePos when drawingTool changes
- Added SVG cursor style: crosshair when drawing tool is active, default for crosshair mode
- Added onClick handler to SVG element for drawing interactions
- Added SVG defs section with two glow filters: drawing-glow-cyan for trendlines, drawing-glow-gold for horizontal lines
- Added SVG rendering for horizontal line drawings: dashed gold lines spanning full chart width with price label on right side and subtle glow effect
- Added SVG rendering for trendline drawings: dashed cyan lines with start/end point dots and glow effect
- Added preview line for pending trendline: semi-transparent line from start point to current mouse position
- Added preview circle for pending trendline start point
- Added preview horizontal line: semi-transparent gold dashed line at mouse Y position
- Updated chart-section.tsx: added drawingTool and drawings state, handleDrawingAdd and handleClearDrawings callbacks
- Added drawing toolbar to chart-section.tsx: Pointer (MousePointer2), Trendline (TrendingUp), H-Line (Minus), Clear (Trash2) buttons with active state highlighting
- Drawing toolbar placed in the same glass panel as chart controls, separated by a border-r divider
- Drawing count badge shown when drawings exist
- Passed drawingTool, drawings, and onDrawingAdd props to CandlestickChart
- Removed unused useMemo import from chart-section.tsx
- Ran lint: 0 errors, 0 warnings
- Dev server compiling successfully

## Stage Summary:
- Chart drawing tools system fully implemented with 3 tools: Pointer (crosshair), Trendline, Horizontal Line
- Trendlines use two-click workflow with real-time preview line while drawing
- Horizontal lines create on single click with real-time preview at mouse position
- Drawings stored in price/time space (not pixel space) so they survive chart resize and zoom
- SVG glow filters added for both cyan (trendline) and gold (horizontal line) drawings
- Drawing toolbar integrated into existing chart controls glass panel with proper visual separation
- Active tool gets cyan border/glow highlighting, Clear button with red hover effect
- Drawing count badge displayed when drawings exist
- All existing chart functionality preserved (candlesticks, overlays, indicators, zoom, crosshair, tooltip)
- Zero lint errors, dev server running normally
