import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { guardApiRequest } from "@/lib/auth/request-guard";

export async function POST(request: NextRequest) {
  const blocked = guardApiRequest(request, { rateLimit: { limit: 3, windowMs: 60_000, scope: "system-shutdown" } });
  if (blocked) return blocked;

  try {
    // Send a response first, then initiate shutdown so the client doesn't get a connection error
    setTimeout(() => {
      const scriptPath = path.join(process.cwd(), "scripts", "stop_platform.sh");
      
      const child = spawn("bash", [scriptPath], {
        detached: true,
        stdio: "ignore",
      });
      
      child.unref(); // allow the node process to exit independently
    }, 1000);

    return NextResponse.json({ success: true, message: "System shutdown initiated." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
