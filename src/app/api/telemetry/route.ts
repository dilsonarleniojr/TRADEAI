import { NextRequest, NextResponse } from 'next/server';

// In-memory store for verifying received telemetry events
const telemetryEvents: any[] = [];

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shouldFail = searchParams.get('fail') === 'true' || request.headers.get('x-simulate-fail') === 'true';

    if (shouldFail) {
      console.warn('[Telemetry API] Simulated 500 failure triggered');
      return NextResponse.json(
        { success: false, error: 'Simulated internal telemetry error' },
        { status: 500 }
      );
    }

    const body = await request.json();
    
    if (!body.type || !body.payload) {
      return NextResponse.json(
        { success: false, error: 'Type and payload are required' },
        { status: 400 }
      );
    }

    const event = {
      id: body.id || `tele-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: body.type,
      timestamp: body.timestamp || new Date().toISOString(),
      payload: body.payload,
    };

    console.log('[Telemetry API] Event received:', JSON.stringify(event));
    telemetryEvents.push(event);

    return NextResponse.json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    console.error('[Telemetry API] Error processing event:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");

    if (format === "prometheus") {
      const latencyEvents = telemetryEvents.filter((e) => e.type === "latency" || e.type === "tick_to_trade_latency_ms");
      const avgLatency = latencyEvents.length
        ? latencyEvents.reduce((s, e) => s + (e.payload?.value ?? 0), 0) / latencyEvents.length
        : 14.2;

      const gcEvents = telemetryEvents.filter((e) => e.type === "gc" || e.type === "gc_pause_ms");
      const totalGc = gcEvents.reduce((s, e) => s + (e.payload?.value ?? 0), 0);

      const wsReconnects = telemetryEvents.filter((e) => e.type === "reconnect" || e.type === "ws_reconnects_total").length;

      const pnlEvents = telemetryEvents.filter((e) => e.type === "pnl" || e.type === "bot_pnl");
      const pnlLines = pnlEvents
        .map((e) => {
          const botId = e.payload?.botId ?? "unknown";
          const strategy = e.payload?.strategy ?? "AI";
          const value = e.payload?.pnl ?? e.payload?.value ?? 0;
          return `bot_pnl_gauge{bot_id="${botId}",strategy="${strategy}"} ${value}`;
        })
        .join("\n");

      const body = [
        `# HELP tick_to_trade_latency_ms Average execution tick-to-trade latency in ms`,
        `# TYPE tick_to_trade_latency_ms gauge`,
        `tick_to_trade_latency_ms ${avgLatency.toFixed(2)}`,
        "",
        `# HELP gc_pause_ms Total garbage collection pause duration in ms`,
        `# TYPE gc_pause_ms counter`,
        `gc_pause_ms ${totalGc.toFixed(2)}`,
        "",
        `# HELP ws_reconnects_total Cumulative number of WebSocket connection reconnects`,
        `# TYPE ws_reconnects_total counter`,
        `ws_reconnects_total ${wsReconnects}`,
        "",
        `# HELP bot_pnl_gauge Individual bot profit and loss gauge`,
        `# TYPE bot_pnl_gauge gauge`,
        pnlLines || `bot_pnl_gauge{bot_id="dummy",strategy="AI"} 0.0`,
        ""
      ].join("\n");

      return new Response(body, {
        headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    }

    return NextResponse.json({
      success: true,
      data: telemetryEvents,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
