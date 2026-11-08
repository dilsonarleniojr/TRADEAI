# Loop de enxugamento — TRADEAI (código morto e dependências)

Você está em um loop de enxugamento. Cada execução é UMA iteração. O estado entre iterações
fica em `MELHORIAS-ENXUTO.md` na raiz deste worktree. Leia esse arquivo primeiro.

## Contexto
- Worktree: `/media/DCORREA/TradeAi/TRADEAI.worktrees/melhoria-enxuto`, branch `melhoria-enxuto`
  (criado de `uxnew` @ 540b601d). Nunca edite `/media/DCORREA/TradeAi/TRADEAI/` (trabalho do dono).
- Este worktree tem `node_modules` PRÓPRIO (instalado com `bun install --frozen-lockfile`). Não é symlink:
  remover pacote aqui não afeta a pasta principal. Nunca rode `bun`/`npm` em outro diretório.
- Lockfile real: `bun.lock`. O `package-lock.json` está dessincronizado (item E-07); não mexa nele.
- Outro loop (backend, branch `melhoria-continua`) altera: `src/app/api/trades/route.ts`,
  `src/app/api/account/route.ts`, `src/app/api/binance/**`, `src/lib/binance/**`,
  `src/lib/bot/pilot/pilot-order-executor.ts`, `src/lib/bot/pilot/direct-operation-manager.ts`,
  `src/lib/bot/order-reconciliation-engine.ts`, `src/lib/bot/trading-guardrails.ts`, `src/lib/bot/risk-manager.ts`.
  NÃO edite nem remova esses arquivos (evita conflito de merge).
- Next.js 16: leia `AGENTS.md`. Entradas do App Router (page/layout/route…) nunca são "código morto".

## Ferramentas
- Analisador de código morto: `node .claude/tools/deadcode.cjs "$PWD"` (grafo de imports a partir das
  entradas do Next, testes, scripts e mini-services; lista arquivos inalcançáveis e dependências sem import).
  Ele não enxerga referências por string montada em tempo de execução; por isso confirme com grep.
- Não baixe nem execute ferramentas de fora do projeto (`npx --yes <pacote>` foi bloqueado pela política de permissões).
- Testes: `bun test tests/unit` (base 338/0). Depois de rodar, `git checkout -- db` (a suíte altera `db/*.json`).
- Tipos: `npx tsc --noEmit -p tsconfig.json` (base 0). Lint: `npx eslint <arquivos tocados>`.
- Build: `npx next build` (base: ok em ~43 s). Bundle: soma dos `.js` em `.next/static/chunks`
  (base: 3,66 MB / 0,99 MB gzip).

## Regras invioláveis
1. Só o branch `melhoria-enxuto`, neste worktree. Sem push, merge, rebase ou commit em outros branches.
2. Remover só o que comprovadamente não é usado: analisador + `grep -rn` do nome do arquivo (sem extensão),
   do export e do pacote em `src/`, `tests/`, `mini-services/`, `scripts/`, `public/`, configs e `Dockerfile`.
   Na dúvida, não remova: registre como "a confirmar".
3. Não altere comportamento. Nada de reescrever lógica "para ficar mais curto". Enxugar = remover o que
   não roda, dependências sem uso e duplicações triviais com equivalente já existente.
4. [APROVAÇÃO] para: telas/funcionalidades que parecem trabalho em andamento (commits recentes do dono),
   trocar biblioteca por outra, remover lockfile, mexer em `mini-services/*/requirements` Python, reescrever histórico git.
5. Uma melhoria por iteração (um grupo coeso: ex. "componentes shadcn sem uso + suas dependências").
6. Para dependências: `bun remove <pacotes>` (atualiza `package.json` e `bun.lock`). Confirme antes com grep
   que nenhum arquivo restante importa o pacote.
6b. Preserve as quebras de linha de cada arquivo (alguns usam CRLF). Em scripts Python use `open(..., newline="")`; antes do commit, `git diff --stat` deve ser igual a `git diff --stat --ignore-cr-at-eol`.
7. Se testes, `tsc` ou build já estiverem quebrados no início, a iteração é dedicada a isso.

## Iteração
1. Leia o `MELHORIAS-ENXUTO.md`; rode testes, `tsc` e build para confirmar o ponto de partida.
2. Escolha o item `pendente` de maior prioridade (empate → menor ID).
3. Confirme cada remoção com grep (regra 2). Anote o que foi verificado.
4. Remova. Rode testes, `tsc`, eslint nos arquivos que referenciavam algo removido, e `npx next build`.
5. Meça: linhas removidas (`git diff --stat`), dependências removidas, tamanho do bundle antes/depois.
6. Se algo quebrar e não resolver em 2 tentativas: `git checkout -- .` (+ `bun install --frozen-lockfile`
   se mexeu em dependência), marque [BLOQUEADO: motivo] e vá ao passo 8.
7. Commit: `chore(enxuto): descrição [ID]` com os números no corpo, terminando com
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Marque o item `concluído (hash)`.
8. Exploração: rode o analisador de novo (remoções liberam novos órfãos) e revise UMA área da lista
   "Próximas análises"; acrescente achados ao backlog sem duplicar.
9. Atualize "Placar" e "Histórico", faça commit do `MELHORIAS-ENXUTO.md` e responda em 3 linhas:
   item feito (com números), achados novos, próximo item.

## Critério de parada
Pare (avise para cancelar o cron) quando: não houver item Alto/Médio `pendente` e as "Próximas análises"
tiverem sido feitas; 3 iterações seguidas sem item executável nem achado; build/suíte quebrar por causa
externa; ou surgir decisão que só o dono pode tomar. Ao parar, escreva o resumo no `MELHORIAS-ENXUTO.md`.
