#!/data/data/com.termux/files/usr/bin/bash
set -e

# ==============================================================================
# Script de Inicialização do TradeAI no Termux (Android 100% Autônomo)
# Executa o servidor Web e o microserviço Binance diretamente no celular
# ==============================================================================

echo "=========================================================="
echo "    TradeAI - Setup e Execução Nativa no Termux (Android)"
echo "=========================================================="

# 1. Atualizar pacotes do Termux
echo "[1/4] Instalando Node.js, Python e dependências essenciais..."
pkg update -y
pkg install -y nodejs-lts python git sqlite clang make

# 2. Ativar Wake-Lock para evitar suspensão com a tela apagada
echo "[2/4] Ativando Wake-Lock para manter o servidor ativo..."
termux-wake-lock || true

# 3. Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "[3/4] Instalando pacotes npm..."
    npm install --production=false
fi

# 4. Iniciar os serviços
echo "[4/4] Iniciando serviços do TradeAI..."
echo "-> Servidor Web Next.js na porta 3000"
echo "-> Microserviço Binance na porta 3001"

# Exportar variáveis essenciais
export PORT=3000
export HOST=127.0.0.1
export NODE_ENV=production

# Executa build ou start direto
npm run build || true
npm run start
