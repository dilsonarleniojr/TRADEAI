import { NextResponse } from "next/server";
import { riskManager } from "@/lib/bot/risk-manager";
import { getCircuitBreakerStatus, resetCircuitBreaker } from "@/lib/bot/multi-bot-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cbStatus = getCircuitBreakerStatus();
    const rmTelemetry = riskManager.getTelemetry(90.0);
    const settings = riskManager.getProtectionSettings();

    return NextResponse.json({
      success: true,
      circuitBreaker: cbStatus,
      riskManager: rmTelemetry,
      maxSimultaneousPositions: settings.maxSimultaneousPositions || 5,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erro ao consultar status dos circuit breakers",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.maxSimultaneousPositions === "number") {
      riskManager.setProtectionSettings({
        maxSimultaneousPositions: Math.max(1, Math.min(50, body.maxSimultaneousPositions)),
      });
    }

    resetCircuitBreaker();
    riskManager.resetCircuitBreakers();

    const updatedCb = getCircuitBreakerStatus();
    const rmTelemetry = riskManager.getTelemetry(90.0);
    const settings = riskManager.getProtectionSettings();

    return NextResponse.json({
      success: true,
      message: "Circuit breakers destravados e limites atualizados com sucesso.",
      circuitBreaker: updatedCb,
      riskManager: rmTelemetry,
      maxSimultaneousPositions: settings.maxSimultaneousPositions || 5,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erro ao destravar os circuit breakers",
      },
      { status: 500 }
    );
  }
}
