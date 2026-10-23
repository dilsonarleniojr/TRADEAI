#!/usr/bin/env bash
# ==============================================================================
# run_audit.sh — Automação de Análise Estática & Profiling de Processo Desktop
# ==============================================================================

set -euo pipefail

OUTPUT_DIR="./audit_reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_PATH="${OUTPUT_DIR}/audit_${TIMESTAMP}"
PID=""

mkdir -p "${REPORT_PATH}"

log_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

log_warn() {
    echo -e "\033[1;33m[WARN]\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

echo "=========================================================="
echo "    AUDITORIA TÉCNICA E PROFILING - APP TRADING DESKTOP   "
echo "=========================================================="

# ------------------------------------------------------------------------------
# 1. VERIFICAÇÃO DE DRIFT DE RELÓGIO (CRÍTICO PARA BINANCE)
# ------------------------------------------------------------------------------
log_info "Verificando sincronização temporal do sistema (NTP)..."
if command -v timedatectl &> /dev/null; then
    timedatectl status | grep -E "NTP service|synchronized" | tee "${REPORT_PATH}/ntp_status.txt" || true
else
    log_warn "timedatectl não encontrado. Certifique-se de que o NTP está ativo."
fi

# ------------------------------------------------------------------------------
# 2. ANÁLISE ESTÁTICA AUTOMATIZADA
# ------------------------------------------------------------------------------
log_info "Executando análise estática de código..."

if [ -f "./gradlew" ]; then
    log_info "Projeto Gradle/Kotlin detectado. Executando linters e checagens estáticas..."
    ./gradlew lint ktlintCheck detekt --continue > "${REPORT_PATH}/static_analysis_gradle.log" 2>&1 || {
        log_warn "Foram encontrados avisos ou inconsistências no relatório do Gradle. Verifique o log."
    }
elif [ -f "./package.json" ]; then
    log_info "Projeto Node/Electron detectado. Executando ESLint e verificação de tipos..."
    npm run lint --if-present > "${REPORT_PATH}/static_analysis_eslint.log" 2>&1 || true
    npx tsc --noEmit > "${REPORT_PATH}/typecheck.log" 2>&1 || true
else
    log_warn "Nenhum wrapper de build padrão (Gradle/NPM) detectado na raiz."
fi

# ------------------------------------------------------------------------------
# 3. IDENTIFICAÇÃO DO PROCESSO EM EXECUÇÃO
# ------------------------------------------------------------------------------
echo ""
INPUT_PROCESS="${1:-${AUDIT_PID:-${AUDIT_PROCESS:-}}}"

if [ -z "$INPUT_PROCESS" ]; then
    if [ -t 0 ]; then
        echo "Digite o PID do aplicativo de trading rodando (ou o nome do binário/processo):"
        read -r INPUT_PROCESS
    else
        log_warn "Entrada não interativa detectada e nenhum PID/processo fornecido via argumento ou \$AUDIT_PID."
    fi
fi

if [[ "$INPUT_PROCESS" =~ ^[0-9]+$ ]]; then
    PID="$INPUT_PROCESS"
elif [ -n "$INPUT_PROCESS" ]; then
    PID=$(pgrep -f -o "$INPUT_PROCESS" || true)
fi

if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
    log_warn "Processo não encontrado ou inválido. Pulando telemetria de runtime."
    log_info "Os relatórios de análise estática foram salvos em: ${REPORT_PATH}"
    exit 0
fi

log_success "Monitorando Processo PID: ${PID}"

# ------------------------------------------------------------------------------
# 4. TELEMETRIA DE CPU, MEMÓRIA E THREADS (RUNTIME SNAPSHOT)
# ------------------------------------------------------------------------------
DURATION_SECONDS="${AUDIT_DURATION:-30}"
SAMPLE_INTERVAL="${AUDIT_INTERVAL:-1}"
METRICS_FILE="${REPORT_PATH}/telemetry_samples.csv"

echo "Timestamp,CPU_Percent,Memory_KB,Threads_Count" > "${METRICS_FILE}"

log_info "Coletando telemetria por ${DURATION_SECONDS} segundos (amostragem a cada ${SAMPLE_INTERVAL}s)..."

for ((i=1; i<=DURATION_SECONDS; i++)); do
    if ! kill -0 "$PID" 2>/dev/null; then
        log_warn "O processo ${PID} foi encerrado durante a coleta."
        break
    fi

    SAMPLE_TIME=$(date +"%H:%M:%S")
    # Extrai CPU (%) e RSS (KB) usando ps
    PS_DATA=$(ps -p "$PID" -o %cpu,rss --no-headers | awk '{print $1","$2}')
    # Contagem de threads do processo
    THREADS_COUNT=$(cat "/proc/${PID}/status" 2>/dev/null | grep -i "Threads:" | awk '{print $2}' || echo "N/A")

    echo "${SAMPLE_TIME},${PS_DATA},${THREADS_COUNT}" >> "${METRICS_FILE}"
    sleep "$SAMPLE_INTERVAL"
done

# ------------------------------------------------------------------------------
# 5. DIAGNÓSTICO DE DESCRITORES DE ARQUIVO E SOCKETS ABERTOS
# ------------------------------------------------------------------------------
log_info "Auditando conexões abertas e sockets do processo..."
lsof -p "$PID" 2>/dev/null | grep -E "TCP|LISTEN|ESTABLISHED" > "${REPORT_PATH}/open_sockets.txt" || true
OPEN_FDS=$(ls -1 "/proc/${PID}/fd" 2>/dev/null | wc -l || echo "N/A")
echo "Total de Descritores de Arquivos (FDs) abertos: ${OPEN_FDS}" | tee "${REPORT_PATH}/fd_summary.txt"

# ------------------------------------------------------------------------------
# 6. SUMÁRIO DA AUDITORIA
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================="
log_success "Auditoria concluída com sucesso!"
echo "Artefatos gerados em: ${REPORT_PATH}"
echo " - Telemetria de CPU/Memória: telemetry_samples.csv"
echo " - Conexões e Sockets:        open_sockets.txt"
echo " - Descritores de Arquivo:    fd_summary.txt"
echo "=========================================================="
