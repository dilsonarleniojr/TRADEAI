import { NextResponse } from 'next/server';
import { fetchFromBinanceService } from '@/lib/binance-service';

export async function GET() {
  try {
    const res = await fetchFromBinanceService('/health', 400);
    if (res && res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
    return NextResponse.json({
      status: 'ok',
      engine: 'tradeai-internal',
      service: 'degraded',
      message: 'Direct Binance fallback active',
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({
      status: 'ok',
      engine: 'tradeai-internal',
      service: 'degraded',
      timestamp: Date.now(),
    });
  }
}
