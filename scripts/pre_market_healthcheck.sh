#!/usr/bin/env bash
# TradeAI - Pre-Market Healthcheck Gate (ExecStartPre)
# Retorna 0 apenas se a rede e a exchange estiverem operacionais.
# Falhas genuínas impedem o startup desnecessário e preservam slots de reinício.

set -euo pipefail

# 1. Checagem de conectividade com a API pública da Binance (timeout de 4s)
if ! curl -sf --max-time 4 "https://api.binance.com/api/v3/ping" > /dev/null 2>&1; then
    echo "[ERROR] Binance REST API inalcançável no pre-market check." >&2
    exit 1
fi

# 2. Checagem de integridade do arquivo de banco de dados
DB_PATH="/media/DCORREA/TradeAi/TRADEAI/db/custom.db"
if [ ! -f "$DB_PATH" ]; then
    echo "[WARN] Banco de dados $DB_PATH não encontrado localmente." >&2
fi

echo "[INFO] Pre-market healthcheck passou com sucesso."
exit 0
