#!/bin/bash
set -e

echo "[Container] Iniciando Binance Market Mini-Service (Porta 3001)..."
cd /app/mini-services/binance-service
bun index.ts &

echo "[Container] Aguardando inicialização do Binance Mini-Service..."
sleep 2

echo "[Container] Iniciando Aplicação Next.js (Porta 3000)..."
cd /app
exec node server.js
