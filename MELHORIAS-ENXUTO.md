# Backlog de enxugamento — TRADEAI

Branch `melhoria-enxuto` (worktree `/media/DCORREA/TradeAi/TRADEAI.worktrees/melhoria-enxuto`), criado de `uxnew` @ 540b601d.

## Placar
| Métrica | Início (08/11/2026) | Atual |
|---|---|---|
| Arquivos em `src/` | 405 | 405 |
| Arquivos inalcançáveis (analisador) | 51 (9.880 linhas) | 51 |
| Dependências em `package.json` | ver `package.json` | — |
| Dependências sem import | 31 (2 falsos positivos: `react-dom`, `sharp`) | 31 |
| Bundle JS (`.next/static/chunks`) | 3,66 MB / 0,99 MB gzip | — |
| Testes / tsc / build | 338/0 · 0 erros · ok (43 s) | — |

Status: pendente / concluído (hash) / [APROVAÇÃO] / [BLOQUEADO: motivo] / [COORDENAR] (depende do loop de backend)

| ID | Prioridade | Tipo | Alvo | Evidência | Ganho estimado | Status |
|----|-----------|------|------|-----------|----------------|--------|
| E-01 | Alto | Arquivos | Componentes shadcn sem uso em `src/components/ui/`: `sidebar`, `chart`, `menubar`, `context-menu`, `carousel`, `calendar`, `navigation-menu`, `form`, `pagination`, `breadcrumb`, `input-otp`, `toggle-group`, `accordion`, `resizable`, `avatar`, `toggle`, `radio-group`, `hover-card`, `collapsible`, `sonner`, `aspect-ratio` + `src/hooks/use-mobile.ts` (só usado por `ui/sidebar`) | Analisador: nenhum import a partir das entradas | ~3.300 linhas, 22 arquivos (podem voltar via CLI do shadcn) | pendente |
| E-02 | Alto | Dependências | Pacotes usados só pelos arquivos de E-01: `@radix-ui/react-{accordion,aspect-ratio,avatar,collapsible,context-menu,hover-card,menubar,navigation-menu,radio-group,toggle,toggle-group}`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-resizable-panels`, `react-hook-form`, `@hookform/resolvers` (confirmar `sonner`, `recharts`, `date-fns` antes) | Analisador + depende de E-01 | ~17 pacotes | pendente (após E-01) |
| E-03 | Alto | Dependências | Pacotes sem nenhum import no projeto: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@reactuses/core`, `@tanstack/react-query`, `@tanstack/react-table`, `next-auth`, `next-intl`, `react-syntax-highlighter`, `uuid`, `zod`, `date-fns` | Analisador; grep em `src`, `tests`, `next.config.ts`, `mini-services/*/index.ts` sem ocorrência | ~12 pacotes | pendente |
| E-04 | Médio | Arquivos | Componentes de app sem import: `dashboard/{market-overview,telemetry-panel,portfolio-allocation,mobile-section}`, `bot/{decision-gate,surgical-panel,drawdown-meter,telemetry-ribbon,execution-queue}`, `gamification/trader-level-card` | Analisador | ~1.400 linhas, 10 arquivos | pendente (checar `git log` de cada um: se editado nas últimas 2 semanas → [APROVAÇÃO]) |
| E-05 | Médio | Arquivos | `src/components/smart-trading/{screens,trading,ui}/*` (18 arquivos): `src/app/smart-trading/page.tsx` não importa nenhum | Analisador; commits recentes (b9744076, e8e841be, deb26dbc) | ~4.400 linhas | [APROVAÇÃO] Parece trabalho em andamento no `uxnew`. Remover ou ligar à página? |
| E-06 | Médio | Arquivos | `src/lib/bot/trading-guardrails.ts`, `src/lib/bot/order-reconciliation-engine.ts` sem import no `uxnew` | Analisador | ~600 linhas | [COORDENAR] O loop de backend usa/edita esses arquivos (A-12, A-02). Não mexer aqui. |
| E-07 | Médio | Build | Dois lockfiles: `bun.lock` (real) e `package-lock.json` dessincronizado (falta `@tanstack/react-virtual`); `Dockerfile` usa `npm ci \|\| npm install` → cai no `npm install` sem trava de versão | `npm ci` falha com EUSAGE | Build reprodutível | [APROVAÇÃO] Escolher um gerenciador (Bun no Docker, ou regenerar o `package-lock.json`). |

## Próximas análises (uma por iteração, na exploração)
- Exports sem uso dentro de arquivos usados (funções/constantes exportadas que ninguém importa).
- Maiores chunks do bundle (812 KB, 433 KB, 354 KB): identificar a origem e se há biblioteca pesada importada inteira.
- Código duplicado trivial (ex.: várias implementações de sincronização de relógio, helpers de formatação).
- `console.log` em caminhos quentes (ticks de preço) e logs de debug esquecidos.
- `scripts/*.kt`, `scratch/`, `examples/`, `download/`, `upload/`: o que é usado pelo app ou pelo build.
- Dependências Python dos `mini-services` (só análise; mudanças = [APROVAÇÃO]).

## Observações para o dono
- Fora do escopo deste loop, mas relevante: há uma rota `src/app/api/system/shutdown` e as rotas da API não exigem login (ver C-02 no loop de backend).
- O repositório tem ~6.100 arquivos de skills duplicadas (`agent/skills` × `.agents/skills`) e `.git` de 403 MB; limpeza do repositório não foi escolhida para este loop.

## Histórico
- 08/11/2026 — Iteração 0 — worktree com `node_modules` próprio; linha de base (338/0, tsc 0, build ok 43 s, bundle 3,66 MB); analisador em `.claude/tools/deadcode.cjs`; backlog E-01…E-07.
