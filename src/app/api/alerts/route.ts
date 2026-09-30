import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRateLimited } from '@/lib/rate-limit';

// GET /api/alerts - Get all price alerts
export async function GET() {
  try {
    const alerts = await db.priceAlert.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: alerts,
    });
  } catch (error: any) {
    console.error('[Alerts API] GET error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Create a price alert
export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting Check
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    if (isRateLimited(ip, 30)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait before creating more alerts.' },
        { status: 429 }
      );
    }

    const { symbol, targetPrice, direction } = await request.json();

    if (!symbol || targetPrice === undefined || !direction) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 2. Input Sanitization and Validation
    const targetPriceVal = parseFloat(targetPrice);
    if (isNaN(targetPriceVal) || targetPriceVal <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid targetPrice. Must be a positive number.' },
        { status: 400 }
      );
    }

    const directionClean = direction === "above" ? "above" : "below";
    const symbolClean = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();

    const alert = await db.priceAlert.create({
      data: {
        symbol: symbolClean,
        targetPrice: targetPriceVal,
        direction: directionClean,
      },
    });

    return NextResponse.json({
      success: true,
      data: alert,
    });
  } catch (error: any) {
    console.error('[Alerts API] POST error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts - Delete an alert
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Alert ID is required' },
        { status: 400 }
      );
    }

    // Sanitize alert ID input to prevent malicious string manipulation
    const idClean = id.replace(/[^a-z0-9_-]/gi, "");

    await db.priceAlert.delete({ where: { id: idClean } });

    return NextResponse.json({
      success: true,
      message: 'Alert deleted',
    });
  } catch (error: any) {
    console.error('[Alerts API] DELETE error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

