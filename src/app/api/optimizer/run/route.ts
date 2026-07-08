import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const strategy = body.strategy || "Momentum";
    const method = body.method || "Bayesian";
    const scenario = body.scenario || "normal_market";
    const iterations = parseInt(body.iterations || "15");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Spawn the python process with uv run
        const pyProcess = spawn("uv", [
          "run",
          "--with",
          "numpy",
          "--with",
          "pandas",
          "python3",
          "scripts/hyperparameter_optimizer.py",
          "--strategy",
          strategy,
          "--method",
          method,
          "--scenario",
          scenario,
          "--iterations",
          iterations.toString()
        ]);

        pyProcess.stdout.on("data", (data) => {
          controller.enqueue(encoder.encode(data.toString()));
        });

        pyProcess.stderr.on("data", (data) => {
          controller.enqueue(encoder.encode(data.toString()));
        });

        pyProcess.on("close", (code) => {
          controller.enqueue(encoder.encode(`\nPROCESS_CLOSED_CODE_${code}`));
          controller.close();
        });

        pyProcess.on("error", (err) => {
          controller.enqueue(encoder.encode(`\nERROR: ${err.message}`));
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
