#!/usr/bin/env bash
set -u
set -o pipefail

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== Início do Shutdown da Plataforma TRADEAI ==="

log "🐳 Parando Caddy Reverse Proxy (Docker)..."
docker kill trade-caddy-proxy 2>/dev/null || true
docker rm -f trade-caddy-proxy 2>/dev/null || true

log "🛑 Parando serviços escutando nas portas chave..."
for port in 3000 3001 3002 81; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    log "Matando processo na porta $port (PID: $pid)"
    kill -TERM $pid 2>/dev/null || kill -KILL $pid 2>/dev/null || true
  fi
done

log "✨ Todos os serviços da plataforma foram finalizados."
exit 0
