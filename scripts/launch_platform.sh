#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TRADEAI Platform Build & Launch Script
# Fases 1-6: Clean, Build, Deploy with health checks and logs estruturados
# =============================================================================

PROJECT_ROOT="/home/dcorrea/AntigravityApp/TRADEAI/TRADEAI"
CADDY_CONTAINER="trade-caddy-proxy"
CADDYFILE="${PROJECT_ROOT}/Caddyfile"
LOG_DIR="${PROJECT_ROOT}/logs"
NEXT_LOG="${LOG_DIR}/next_service.log"
BINANCE_LOG="${LOG_DIR}/binance_service.log"
CADDY_LOG="${LOG_DIR}/caddy_service.log"

mkdir -p "${LOG_DIR}"

# =============================================================================
# Helpers
# =============================================================================
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "FATAL: $*"; exit 1; }

is_port_open() {
  local port=$1
  curl -sf --max-time 1 "http://localhost:${port}/" >/dev/null 2>&1 \
    || curl -sf --max-time 1 "http://localhost:${port}/health" >/dev/null 2>&1
}

wait_for_port() {
  local port=$1
  local name=$2
  local timeout=${3:-60}
  log "Waiting for ${name} on port ${port} (timeout ${timeout}s)..."
  local elapsed=0
  while [ ${elapsed} -lt ${timeout} ]; do
    if is_port_open "${port}"; then
      log "${name} is ready on port ${port}"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  log "TIMEOUT: ${name} did not become ready on port ${port}"
  return 1
}

stop_service() {
  local pid
  pid=$(lsof -ti:"$1" 2>/dev/null || true)
  if [ -n "${pid}" ]; then
    log "Stopping process on port $1 (PID: ${pid})"
    kill -TERM ${pid} 2>/dev/null || kill -KILL ${pid} 2>/dev/null || true
    sleep 1
  fi
}

# =============================================================================
# Fase 1 — Parar serviços existentes e limpar builds antigos
# =============================================================================
log "=== Fase 1: Parando serviços e limpando builds ==="

# Parar containers Caddy Docker
docker kill "${CADDY_CONTAINER}" 2>/dev/null || true
docker rm -f "${CADDY_CONTAINER}" 2>/dev/null || true

# Matar processos nas portas alvo
for port in 3000 3001 3002 81; do
  stop_service "${port}"
done

# Limpar builds antigos
rm -rf .next/standalone
rm -rf .next/static

log "Fase 1 completa"

# =============================================================================
# Fase 2 — Instalar dependências e gerar Prisma Client
# =============================================================================
log "=== Fase 2: Instalando dependências e Prisma ==="

cd "${PROJECT_ROOT}"

npx -y bun install
log "Root dependencies installed"

npx -y bun run db:generate
log "Prisma Client gerado"

npx -y bun run db:push
log "Schema aplicado ao SQLite"

log "Fase 2 completa"

# =============================================================================
# Fase 3 — Build da aplicação Next.js (standalone output)
# =============================================================================
log "=== Fase 3: Building Next.js (standalone) ==="

npx -y bun --bun run build

# Validar e copiar assets (o script de build já faz isso, mas garantimos)
if [ -d ".next/standalone" ]; then
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  cp -r public .next/standalone/ 2>/dev/null || true
fi

if [ -f ".next/standalone/server.js" ]; then
  log "BUILD OK — .next/standalone/server.js existe"
else
  fail "BUILD FAILED — .next/standalone/server.js não encontrado"
fi

log "Fase 3 completa"

# =============================================================================
# Fase 4 — Inicializar mini-service Binance
# =============================================================================
log "=== Fase 4: Instalando Binance mini-service ==="

cd "${PROJECT_ROOT}/mini-services/binance-service"
npx -y bun install
cd "${PROJECT_ROOT}"

log "Fase 4 completa"

# =============================================================================
# Fase 5 — Subir todos os serviços (ordem crítica)
# =============================================================================
log "=== Fase 5: Subindo serviços ==="

# 5.1 Binance Service (portas 3001 REST / 3002 Socket.IO)
log "Iniciando Binance Service..."
nohup npx -y bun --hot "${PROJECT_ROOT}/mini-services/binance-service/index.ts" \
  > "${BINANCE_LOG}" 2>&1 &
BINANCE_PID=$!
log "Binance Service PID: ${BINANCE_PID}"

# 5.2 Next.js em produção (porta 3000)
log "Iniciando Next.js (standalone) em produção..."
nohup env NODE_ENV=production \
  npx -y bun "${PROJECT_ROOT}/.next/standalone/server.js" \
  > "${NEXT_LOG}" 2>&1 &
NEXT_PID=$!
log "Next.js PID: ${NEXT_PID}"

# 5.3 Caddy Reverse Proxy (porta 81)
log "Iniciando Caddy Reverse Proxy..."
nohup docker run --name "${CADDY_CONTAINER}" --rm --network host \
  -v "${CADDYFILE}:/etc/caddy/Caddyfile" \
  caddy caddy run --config /etc/caddy/Caddyfile \
  > "${CADDY_LOG}" 2>&1 &
CADDY_PID=$!
log "Caddy PID (docker run): ${CADDY_PID}"

# =============================================================================
# Fase 6 — Health Checks obrigatórios
# =============================================================================
log "=== Fase 6: Health Checks ==="

wait_for_port 3000 "Next.js (produção)" 60
wait_for_port 3001 "Binance Service REST" 60
wait_for_port 81   "Caddy Proxy" 60

log ""
log "=== Resultado dos Health Checks ==="
curl -s -o /dev/null -w "localhost:3000        -> %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "localhost:3001/health -> %{http_code}\n" http://localhost:3001/health
curl -s -o /dev/null -w "localhost:81         -> %{http_code}\n" http://localhost:81/

log ""
log "=== Plataforma TRADEAI pronta ==="
log "  App    : http://localhost:81/"
log "  Next.js: http://localhost:3000/"
log "  Binance: http://localhost:3001/health"
log "  Logs   : ${LOG_DIR}/"
