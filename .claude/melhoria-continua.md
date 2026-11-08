# Loop de melhoria contínua — TRADEAI (bots Binance)

Você está em um loop de melhoria. Cada execução é UMA iteração. O estado entre
iterações fica em `MELHORIAS.md` na raiz deste worktree. Leia esse arquivo primeiro.

## Contexto do projeto
- Diretório de trabalho: `/media/DCORREA/TradeAi/TRADEAI.worktrees/melhoria-continua` (worktree do repositório `/media/DCORREA/TradeAi/TRADEAI`). Nunca edite o diretório principal `TRADEAI/`; lá há trabalho do dono em andamento no branch `uxnew`.
- Stack: Next.js 16 + TypeScript + Prisma (SQLite), Bun; mini-serviços Python em `mini-services/`.
- Leia `AGENTS.md`: esta versão do Next.js tem mudanças incompatíveis. Consulte `node_modules/next/dist/docs/` antes de mexer em rotas, middleware ou proxy.
- Mercado: Binance Spot (`api.binance.com` / testnet `testnet.binance.vision`).
- Caminho crítico de ordens: `src/app/api/trades/route.ts`, `src/lib/bot/pilot/pilot-order-executor.ts`, `src/lib/bot/multi-bot-engine.ts`.
- Testes: `bun test tests/unit` (base: 338 pass / 0 fail).
- Tipos: `npx tsc --noEmit -p tsconfig.json` (base: 0 erros).
- Testes novos: `tests/unit/<area>.test.ts` usando `bun:test`, com `fetch` mockado. Nada de rede real em teste novo.

## Regras invioláveis
1. Trabalhe só no branch `melhoria-continua`, dentro deste worktree. Nunca faça commit em `uxnew`/`main`, push, merge, rebase ou force-push.
2. Nunca envie ordens para a conta real. Não leia, não imprima e não altere o `.env` nem chaves. Execução só com mock (ou testnet, se o dono configurar).
3. Não altere a lógica de sinais nem os parâmetros das estratégias. O foco é segurança, correção, resiliência, testes e qualidade.
4. Não invente endpoints, limites ou códigos de erro da Binance. Confira na documentação oficial (developers.binance.com) e cite a fonte no commit. Na dúvida, registre "a confirmar" e não implemente.
5. Itens [APROVAÇÃO] ficam só registrados, sem implementação. Use [APROVAÇÃO] para itens novos que envolvam arquitetura, schema de banco, infraestrutura, autenticação, regras de risco ou qualquer mudança no comportamento financeiro.
6. Uma melhoria por iteração, com mudança pequena e testada. Mantenha o estilo do arquivo (mensagens de erro em português).
6b. Preserve as quebras de linha de cada arquivo (alguns usam CRLF, ex.: `src/app/api/trades/route.ts`, `src/app/api/alerts/route.ts`). Em scripts Python use `open(..., newline="")`. Antes do commit, confira `git diff --stat` contra `git diff --stat --ignore-cr-at-eol`: devem ser iguais.
7. Se a suíte de testes ou o `tsc` já estiverem vermelhos no início, dedique a iteração a entender e corrigir isso, ou registre o bloqueio.

## Iteração
1. Leia o `MELHORIAS.md`; rode testes e `tsc` para confirmar o ponto de partida.
2. Escolha o item `pendente` de maior prioridade (Crítico > Alto > Médio > Baixo; empate → menor ID).
3. Escreva um teste que reproduza o problema (ele deve falhar).
4. Implemente a correção mínima.
5. Rode a suíte completa e o `tsc`. Se algo quebrar e não for resolvido em 2 tentativas, reverta (`git checkout -- .` e remova arquivos novos), marque o item como [BLOQUEADO: motivo] e vá para o passo 8.
6. Faça um commit: `fix|feat|refactor|test(área): descrição [ID]`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
7. Marque o item como `concluído (hash)`.
8. Exploração: revise o código ao redor do que você mexeu e mais UMA área da lista "Ainda não revisadas". Mova-a para "Áreas revisadas" e acrescente ao backlog os problemas novos (próximo ID livre da prioridade), sem duplicar itens.
9. Acrescente uma linha ao "Histórico" e faça commit do `MELHORIAS.md`.
10. Responda em 3 linhas: item feito, achados novos, próximo item.

## Critério de parada
Encerre o loop (chame ScheduleWakeup com `stop: true`, se estiver no /loop) e diga o motivo quando acontecer qualquer uma destas situações:
- Não há item Crítico/Alto/Médio `pendente` e não há área não revisada.
- 3 iterações seguidas sem item executável e sem achado novo.
- A suíte quebrou por causa externa (ambiente, dependência, rede).
- Surgiu uma dúvida que exige decisão do dono.
Ao parar, escreva no `MELHORIAS.md` um resumo: o que foi feito, o que aguarda aprovação e o que está bloqueado.
