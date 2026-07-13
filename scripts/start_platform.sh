#!/bin/bash
# TRADEAI — Inicialização do Ambiente HFT

echo "🧹 Limpando containers antigos do Caddy..."
docker kill trade-caddy-proxy 2>/dev/null || true
docker rm -f trade-caddy-proxy 2>/dev/null || true

echo "🚀 Iniciando Binance Service (Porta 3001) em segundo plano..."
cd /home/dcorrea/AntigravityApp/TRADEAI/TRADEAI/mini-services/binance-service
nohup npx -y bun run dev > /home/dcorrea/.gemini/antigravity-ide/brain/798052e5-f2bd-48b3-916f-cb32b0f0a657/binance_service.log 2>&1 &

echo "🚀 Iniciando Next.js Dev Server (Porta 3000) em segundo plano..."
cd /home/dcorrea/AntigravityApp/TRADEAI/TRADEAI
nohup npx -y node@20 node_modules/next/dist/bin/next dev --webpack -p 3000 > /home/dcorrea/.gemini/antigravity-ide/brain/798052e5-f2bd-48b3-916f-cb32b0f0a657/next_service.log 2>&1 &

echo "🚀 Iniciando Caddy Proxy (Porta 81) via Docker Daemon..."
docker run -d --name trade-caddy-proxy --network host -v /home/dcorrea/AntigravityApp/TRADEAI/TRADEAI/Caddyfile:/etc/caddy/Caddyfile caddy caddy run --config /etc/caddy/Caddyfile

echo "⏳ Aguardando inicialização dos servidores..."
sleep 8

echo "📊 Verificando se os servidores estão ouvindo nas portas:"
ss -tulpn | grep -E "3000|3001|81" || netstat -tulpn 2>/dev/null | grep -E "3000|3001|81"

echo "✅ Plataforma iniciada! Acesse a interface em: http://localhost:81"
