#!/bin/bash
# TRADEAI — Daemon de Execução Contínua da Plataforma

echo "🧹 Limpando containers antigos do Caddy..."
docker kill trade-caddy-proxy 2>/dev/null || true
docker rm -f trade-caddy-proxy 2>/dev/null || true

echo "🚀 Iniciando Binance Service (Porta 3001) em segundo plano..."
cd /home/dcorrea/AntigravityApp/TRADEAI/TRADEAI/mini-services/binance-service
npx -y bun run dev > /home/dcorrea/.gemini/antigravity-ide/brain/798052e5-f2bd-48b3-916f-cb32b0f0a657/binance_service.log 2>&1 &

echo "🚀 Iniciando Next.js Dev Server (Porta 3000) em segundo plano..."
cd /home/dcorrea/AntigravityApp/TRADEAI/TRADEAI
npx -y node@20 node_modules/next/dist/bin/next dev --webpack -p 3000 -H 127.0.0.1 > /home/dcorrea/.gemini/antigravity-ide/brain/798052e5-f2bd-48b3-916f-cb32b0f0a657/next_service.log 2>&1 &

echo "⏳ Aguardando inicialização rápida dos sub-serviços..."
sleep 6

echo "🚀 Iniciando Caddy Proxy (Porta 81) em primeiro plano..."
docker run --name trade-caddy-proxy --rm --network host -v /home/dcorrea/AntigravityApp/TRADEAI/TRADEAI/Caddyfile:/etc/caddy/Caddyfile caddy caddy run --config /etc/caddy/Caddyfile
