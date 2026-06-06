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

export async function GET() {
  return NextResponse.json({
    success: true,
    data: telemetryEvents,
  });
}
