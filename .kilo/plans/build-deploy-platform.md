# Build and Deploy Plan — TRADEAI Platform

## Objetivo
Executar um build limpo e deploy completo da plataforma TRADEAI, garantindo que todos os serviços estejam online e estáveis antes dos testes de usuário.

---

## Pré-condições
- Node.js/Bun disponíveis no ambiente
- Docker disponível (para Caddy proxy)
- Python 3 disponível (scripts auxiliares)
- Variáveis de ambiente em `.env` já configuradas

---

## Fase 1 — Parar serviços existentes e limpar builds antigos
```bash
# Parar processos que possam estar rodando nas portas 3000, 3001, 3002, 81
# Matar containers Caddy Docker se existirem
docker kill trade-caddy-proxy 2>/dev/null || true
docker rm -f trade-caddy-proxy 2>/dev/null || true

# Limpar build anterior (forçar rebuild limpo)
rm -rf .next/standalone
rm -rf .next/static
```

## Fase 2 — Instalar dependências e gerar Prisma Client
```bash
# Na raiz do projeto
bun install

# Gerar Prisma Client
bun run db:generate

# Aplicar schema no banco SQLite de produção
bun run db:push
```

## Fase 3 — Build da aplicação Next.js (standalone output)
```bash
# Build principal (gera .next/standalone/server.js)
bun run build

# O script já copia static e public, mas validar manualmente:
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# Validar que server.js existe
test -f .next/standalone/server.js && echo "BUILD OK" || echo "BUILD FAILED"
```

## Fase 4 — Inicializar mini-service Binance
```bash
# Na pasta mini-services/binance-service
cd mini-services/binance-service
bun install
cd ../..
```

## Fase 5 — Subir todos os serviços (ordem crítica)

### 5.1 Binance Service (portas 3001 REST / 3002 Socket.IO)
```bash
cd mini-services/binance-service
bun run dev &
# Aguardar health check: http://localhost:3001/health
```

### 5.2 Next.js em produção (porta 3000)
```bash
cd /home/dcorrea/Documentos/Trade/TRADEAI
NODE_ENV=production bun .next/standalone/server.js 2>&1 | tee server.log &
# Aguardar health check: http://localhost:3000/ retornar 200
```

### 5.3 Caddy Reverse Proxy (porta 81)
```bash
docker run --name trade-caddy-proxy --rm --network host \
  -v /home/dcorrea/Documentos/Trade/TRADEAI/Caddyfile:/etc/caddy/Caddyfile \
  caddy caddy run --config /etc/caddy/Caddyfile &
# Aguardar health check: http://localhost:81/ retornar 200
```

## Fase 6 — Health Checks obrigatórios
```bash
# Validar cada serviço individualmente
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/        # Esperado: 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health  # Esperado: 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:81/         # Esperado: 200
```

## Fase 7 — Testes de regressão (pré-UAT)
```bash
# Executar testes E2E via runner existente
bun run tests/run_all.ts

# Verificar relatório
cat regression_report.json | jq '.status'
```

## Fase 8 — Validação final para início dos testes de usuário
- [ ] App acessível via `http://localhost:81/`
- [ ] API Next.js respondendo em `http://localhost:81/api/market/ticker`
- [ ] Binance WebSocket conectado (socket.io em 3002)
- [ ] Banco SQLite populado (Prisma db push executado)
- [ ] Testes de regressão com status `pass`
- [ ] Logs sem erros críticos em `server.log`

---

## Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Porta já em uso | Matar processos antes do deploy (`pkill -f "next\|bun\|caddy"`) |
| Build do Next.js falhar | `typescript.ignoreBuildErrors: true` já configurado; validar warnings |
| Binance API rate limit | Mini-service já usa caching e batches; tolera falhas |
| Docker/Caddy indisponível | App funciona diretamente na 3000 como fallback |
| DB SQLite corrompido | `bun run db:reset` como recovery (perde dados de paper trading) |

---

## Comando único de deploy (orquestração sugerida)
Criar `scripts/launch_platform.sh` encapsulando Fases 1-6 com health checks, timeouts e logs estruturados.
