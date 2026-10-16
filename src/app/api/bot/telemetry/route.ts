import { NextResponse } from "next/server";
import { latencyTelemetry } from "@/lib/bot/latency-telemetry";

export async function GET() {
  try {
    const snapshot = latencyTelemetry.getSnapshot();
    return NextResponse.json({
      success: true,
      data: snapshot,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Erro ao obter telemetria." },
      { status: 500 }
    );
  }
}
