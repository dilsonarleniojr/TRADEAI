import { spawn, execSync, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ARTIFACT_DIR = "/home/dcorrea/.gemini/antigravity-ide/brain/44b6530d-b50b-4f0c-9276-075b32d99d70";
const NEXT_LOG = path.join(ARTIFACT_DIR, "next_service.log");
const BINANCE_LOG = path.join(ARTIFACT_DIR, "binance_service.log");
const CADDY_LOG = path.join(ARTIFACT_DIR, "caddy_service.log");

const childProcesses: ChildProcess[] = [];

async function isPortOpen(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`).catch(() => null);
    if (port === 3000) {
      // Next.js doesn't have /health under root by default, it might return 404 or check root /
      const resRoot = await fetch(`http://localhost:${port}/`).catch(() => null);
      return resRoot !== null;
    }
    if (port === 81) {
      // Caddy proxying to Next.js
      const resRoot = await fetch(`http://localhost:${port}/`).catch(() => null);
      return resRoot !== null;
    }
    return res !== null && res.status === 200;
  } catch {
    return false;
  }
}

async function waitOnPort(port: number, name: string, timeoutSec = 60): Promise<boolean> {
  console.log(`⏳ Waiting for ${name} on port ${port}...`);
  for (let i = 0; i < timeoutSec; i++) {
    if (await isPortOpen(port)) {
      console.log(`✅ ${name} is ready on port ${port}!`);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error(`❌ Timeout waiting for ${name} on port ${port}`);
  return false;
}

function runService(
  command: string,
  args: string[],
  cwd: string,
  logPath: string,
  name: string
): ChildProcess {
  console.log(`🚀 Starting ${name} in background...`);
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  child.on("error", (err) => {
    console.error(`❌ Error in ${name}:`, err.message);
  });

  child.on("exit", (code) => {
    console.log(`ℹ️ ${name} exited with code ${code}`);
  });

  childProcesses.push(child);
  return child;
}

async function main() {
  console.log(`📂 Logs will be written to ${ARTIFACT_DIR}`);

  // Ensure directories exist
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  // 1. Clean up any existing caddy docker proxy
  console.log("🧹 Stopping any existing Caddy Docker container...");
  try {
    execSync("docker kill trade-caddy-proxy 2>/dev/null || true");
    execSync("docker rm -f trade-caddy-proxy 2>/dev/null || true");
  } catch {}

  // 2. Start Binance service on port 3001, Socket.IO on 3002
  const binanceCwd = "/home/dcorrea/Documentos/Trade/TRADEAI/mini-services/binance-service";
  runService("bun", ["run", "dev"], binanceCwd, BINANCE_LOG, "Binance Service");

  // 3. Start Next.js dev server on port 3000
  const nextCwd = "/home/dcorrea/Documentos/Trade/TRADEAI";
  runService("bun", ["run", "dev"], nextCwd, NEXT_LOG, "Next.js Dev Server");

  // 4. Start Caddy on port 81 (Docker host network)
  console.log("🚀 Starting Caddy Proxy in Docker container...");
  const caddyLogStream = fs.createWriteStream(CADDY_LOG, { flags: "w" });
  const caddyChild = spawn(
    "docker",
    [
      "run",
      "--name",
      "trade-caddy-proxy",
      "--rm",
      "--network",
      "host",
      "-v",
      "/home/dcorrea/Documentos/Trade/TRADEAI/Caddyfile:/etc/caddy/Caddyfile",
      "caddy",
      "caddy",
      "run",
      "--config",
      "/etc/caddy/Caddyfile",
    ],
    { cwd: nextCwd }
  );
  caddyChild.stdout?.pipe(caddyLogStream);
  caddyChild.stderr?.pipe(caddyLogStream);
  childProcesses.push(caddyChild);

  // 5. Wait for all services to be ready
  const nextReady = await waitOnPort(3000, "Next.js");
  const binanceReady = await waitOnPort(3001, "Binance Service REST");
  const caddyReady = await waitOnPort(81, "Caddy Proxy");

  if (!nextReady || !binanceReady || !caddyReady) {
    console.error("❌ One or more services failed to start. Aborting test execution.");
    cleanup();
    process.exit(1);
  }

  console.log("🌟 All services are online! Running e2e tests...");
  
  let success = false;
  try {
    execSync("bun run tests/regression.ts", {
      stdio: "inherit",
      env: { ...process.env, PW_TEST_SCREENSHOT_NO_FONTS_READY: "1" }
    });
    
    // Check if regression report was successfully written and verify status
    const reportPath = path.join(ARTIFACT_DIR, "regression_report.json");
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      success = report.status === "pass";
    }
  } catch (err: any) {
    console.error("💥 Error executing tests:", err.message);
  } finally {
    cleanup();
    if (success) {
      console.log("💚 Regression tests PASSED successfully!");
      process.exit(0);
    } else {
      console.error("❤️ Regression tests FAILED.");
      process.exit(1);
    }
  }
}

function cleanup() {
  console.log("🛑 Stopping and cleaning up services...");
  
  // Kill caddy docker container
  try {
    console.log("🐳 Killing trade-caddy-proxy docker container...");
    execSync("docker kill trade-caddy-proxy 2>/dev/null || true");
    execSync("docker rm -f trade-caddy-proxy 2>/dev/null || true");
  } catch {}

  // Kill child processes
  for (const child of childProcesses) {
    if (child.pid) {
      try {
        console.log(`💀 Killing process PID ${child.pid}...`);
        child.kill("SIGTERM");
      } catch {}
    }
  }
  console.log("✨ Cleanup complete.");
}

// Trap signals
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

main().catch((err) => {
  console.error("💥 Unhandled Error:", err);
  cleanup();
  process.exit(1);
});
