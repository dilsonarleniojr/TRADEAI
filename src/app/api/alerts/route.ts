import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
    const { symbol, targetPrice, direction } = await request.json();

    if (!symbol || !targetPrice || !direction) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const alert = await db.priceAlert.create({
      data: {
        symbol,
        targetPrice: parseFloat(targetPrice),
        direction,
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

    await db.priceAlert.delete({ where: { id } });

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
