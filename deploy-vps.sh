#!/bin/bash
set -e

# ==============================================================================
# Script de Implantação do TradeAI em VPS (Ubuntu / Debian / AlmaLinux)
# Executa a suíte de contêineres Docker do TradeAI 24/7 com reinício automático
# ==============================================================================

echo "=========================================================="
echo "    TradeAI - Instalação e Deploy em Servidor VPS"
echo "=========================================================="

# 1. Atualizar pacotes e instalar dependências básicas
if [ -x "$(command -v apt-get)" ]; then
    echo "[1/4] Atualizando sistema via apt..."
    sudo apt-get update -y
    sudo apt-get install -y git curl ufw ca-certificates gnupg
elif [ -x "$(command -v dnf)" ]; then
    echo "[1/4] Atualizando sistema via dnf..."
    sudo dnf update -y
    sudo dnf install -y git curl ca-certificates
fi

# 2. Instalar Docker e Docker Compose caso não existam
if ! [ -x "$(command -v docker)" ]; then
    echo "[2/4] Instalando Docker Engine..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable --now docker
    sudo usermod -aG docker $USER
fi

# 3. Configurar Firewall básico (portas Web e Caddy)
if [ -x "$(command -v ufw)" ]; then
    echo "[3/4] Ajustando firewall UFW..."
    sudo ufw allow 22/tcp || true
    sudo ufw allow 80/tcp || true
    sudo ufw allow 443/tcp || true
    sudo ufw allow 3000/tcp || true
    sudo ufw allow 3001/tcp || true
    sudo ufw allow 3002/tcp || true
fi

# 4. Iniciar Contêineres
echo "[4/4] Subindo contêineres do TradeAI..."
docker compose down || true
docker compose up -d --build

echo ""
echo "=========================================================="
echo "    TradeAI implantado com sucesso na VPS!"
echo "    Acesse no navegador ou no App Android:"
echo "    http://$(curl -s ifconfig.me):3000"
echo "=========================================================="
