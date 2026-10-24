import { NextRequest, NextResponse } from 'next/server';
import { quantAIClient } from '@/lib/ai/quant-ai-client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subpath = (path || []).join('/');
    const body = await req.json();

    if (subpath === 'conformal/predict') {
      const { residuals, point_predictions, alpha } = body;
      const result = await quantAIClient.predictConformal(
        residuals || [],
        point_predictions || [],
        alpha || 0.05
      );
      return NextResponse.json(result);
    }

    if (subpath === 'adversarial/audit') {
      const {
        features,
        decision_threshold,
        epsilon,
        flip_tolerance_pct,
        noise_type,
        n_trials,
        seed,
      } = body;
      const result = await quantAIClient.auditAdversarialRobustness(features || [], {
        decisionThreshold: decision_threshold,
        epsilon,
        flipTolerancePct: flip_tolerance_pct,
        noiseType: noise_type,
        nTrials: n_trials,
        seed,
      });
      return NextResponse.json(result);
    }

    if (subpath === 'vision/analyze-chart') {
      const { symbol, timeframe, image_base64, additional_context } = body;
      const result = await quantAIClient.analyzeChart(
        symbol || 'BTCUSDT',
        timeframe || '1h',
        image_base64 || '',
        additional_context
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Unknown subpath: ${subpath}` }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Quant AI proxy execution failed' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const subpath = (path || []).join('/');

  if (subpath === 'health') {
    const isPythonHealthy = await quantAIClient.checkHealth();
    return NextResponse.json({
      status: 'ok',
      service: 'tradeai-quant-ai-proxy',
      python_microservice_online: isPythonHealthy,
    });
  }

  return NextResponse.json({ error: `Not found: ${subpath}` }, { status: 404 });
}
