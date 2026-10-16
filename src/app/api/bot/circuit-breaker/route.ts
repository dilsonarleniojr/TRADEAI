import { NextResponse } from "next/server";
import { riskManager } from "@/lib/bot/risk-manager";
import { getCircuitBreakerStatus, resetCircuitBreaker } from "@/lib/bot/multi-bot-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cbStatus = getCircuitBreakerStatus();
    const rmTelemetry = riskManager.getTelemetry(90.0);

    return NextResponse.json({
      success: true,
      circuitBreaker: cbStatus,
      riskManager: rmTelemetry,
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

export async function POST() {
  try {
    resetCircuitBreaker();
    riskManager.resetCircuitBreakers();

    const updatedCb = getCircuitBreakerStatus();
    const rmTelemetry = riskManager.getTelemetry(90.0);

    return NextResponse.json({
      success: true,
      message: "Circuit breakers destravados com sucesso. Limites e robôs redefinidos.",
      circuitBreaker: updatedCb,
      riskManager: rmTelemetry,
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
