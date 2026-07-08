#!/usr/bin/env bash
# =============================================================================
# TRADEAI Platform Start & Hold Script
# Starts all services in the background and keeps the parent process alive.
# =============================================================================
set -euo pipefail

PROJECT_ROOT="/home/dcorrea/AntigravityApp/TRADEAI/TRADEAI"
LOG_DIR="${PROJECT_ROOT}/logs"
mkdir -p "${LOG_DIR}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 1. Stop existing services on key ports
log "=== Clean existing processes ==="
docker kill trade-caddy-proxy 2>/dev/null || true
docker rm -f trade-caddy-proxy 2>/dev/null || true
for port in 3000 3001 3002 81; do
  pid=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "${pid}" ]; then
    log "Stopping process on port ${port} (PID: ${pid})"
    kill -9 ${pid} 2>/dev/null || true
  fi
done

# Clear logs
cat /dev/null > "${LOG_DIR}/binance_service.log" || true
cat /dev/null > "${LOG_DIR}/next_service.log" || true
cat /dev/null > "${LOG_DIR}/caddy_service.log" || true

# 2. Start Binance Service (ports 3001 / 3002)
log "=== Starting Binance Service ==="
nohup npx -y bun --hot "${PROJECT_ROOT}/mini-services/binance-service/index.ts" \
  > "${LOG_DIR}/binance_service.log" 2>&1 &
BINANCE_PID=$!
log "Binance Service PID: ${BINANCE_PID}"

# 3. Start Next.js (port 3000)
log "=== Starting Next.js Production ==="
nohup env NODE_ENV=production \
  npx -y bun "${PROJECT_ROOT}/.next/standalone/server.js" \
  > "${LOG_DIR}/next_service.log" 2>&1 &
NEXT_PID=$!
log "Next.js PID: ${NEXT_PID}"

# 4. Start Caddy Proxy (port 81)
log "=== Starting Caddy Proxy ==="
nohup docker run --name trade-caddy-proxy --rm --network host \
  -v "${PROJECT_ROOT}/Caddyfile:/etc/caddy/Caddyfile" \
  caddy caddy run --config /etc/caddy/Caddyfile \
  > "${LOG_DIR}/caddy_service.log" 2>&1 &
CADDY_PID=$!
log "Caddy PID: ${CADDY_PID}"

# 5. Hold loop: print tail of logs and wait
log "=== Services are active! Tailing logs to hold process ==="
tail -f "${LOG_DIR}/next_service.log" "${LOG_DIR}/binance_service.log"
