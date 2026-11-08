# Controle de Melhorias de UI / Frontend — TRADEAI

Este documento registra o backlog priorizado e o histórico de iterações de melhorias na interface de usuário do TRADEAI.

## Áreas Revisadas
- `src/components/dashboard/` (Open Orders, Recent Trades, Export, PnL Panel)
- `src/components/smart-trading/` (Order Panel, Bots Screen, Smart Trading UI)
- `src/components/bot/` (Direct AI Trade Modal)
- `src/components/chart/` (Candlestick Chart Wrapper, Order Book, Quick Trade)
- `src/components/header/` e `src/components/header.tsx` (Global Status Bar, Theme Toggle, User Profile)
- `src/components/sidebar.tsx` (Navegação lateral, Mobile Drawer, Safe Areas)
- `src/components/institutional/` (Microstructure Panel, Bot Health Panel)

---

## Decisões de Design (Padrões Adotados)
1. **Números Financeiros:** Todos os valores numéricos de preços, saldos, PnLs e quantidades DEVEM obrigatoriamente usar as classes `font-mono tabular-nums` para evitar saltos horizontais durante atualizações em tempo real do WebSocket.
2. **Modo REAL vs PAPER:** Operações em modo REAL (`live`) DEVEM ter um indicador visual explícito em vermelho (`bg-red-500/10 border-red-500 text-red-500`) e requerer confirmação dupla/modal de aviso de risco pré-ordem.
3. **Acessibilidade de Ícones e Botões:** Todo botão composto apenas por ícone DEVE possuir o atributo `aria-label` descritivo e estados `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`.
4. **Alvos de Toque no Mobile:** Elementos interativos em telas móveis DEVEM possuir dimensões mínimas de 44×44px (`min-h-[44px] min-w-[44px]`).
5. **Acessibilidade de PnL:** Lucros e perdas numéricas não podem depender apenas da cor (verde/vermelho); devem exibir sinal explícito `+` em lucros e rótulo acessível `(Ganho)` / `(Perda)` via `sr-only` ou ícones direcionais.

---

## Backlog Priorizado

| ID | Prioridade | Categoria | Tela/Componente (arquivo:linha) | Problema | Impacto no Usuário | Status |
|---|---|---|---|---|---|---|
| UI-001 | Crítico | Segurança da Operação | `src/components/smart-trading/trading/order-panel.tsx:377` | Ausência de modal de confirmação prévia no envio de ordem no modo REAL (Spot Live). | Risco de envio acidental de ordens reais por clique não intencional. | concluído (252374df, ui-audit/2026-11-08-UI-001-after) |
| UI-002 | Crítico | Segurança da Operação | `src/components/bot/direct-ai-trade-modal.tsx:2100` | Falta de badge e aviso de confirmação inequívoca de PAPER vs LIVE antes da execução de trade por IA. | Usuário pode executar ordens assistidas por IA com dinheiro real achando que está em ambiente simulado. | concluído (670cb815, ui-audit/2026-11-08-UI-002-after) |
| UI-003 | Crítico | Segurança da Operação | `src/components/chart/quick-trade.tsx:120` | Botões de Quick Trade sem trava anti-duplo clique durante requisições assíncronas. | Risco de envio de ordens duplicadas em sequência por duplo clique do usuário. | pendente |
| UI-004 | Alto | Leitura Financeira | `src/components/dashboard/open-orders.tsx:85` | Tabela de ordens abertas sem `tabular-nums` nos preços e quantidades. | Salto e oscilação horizontal dos números ao atualizar dados via WebSocket. | pendente |
| UI-005 | Alto | Leitura Financeira | `src/components/chart/order-book.tsx:140` | Livro de ofertas L2 sem `tabular-nums` e sem indicador de cotação desatualizada/desconexão. | Dificuldade de leitura de números e falta de aviso sobre dados de mercado obsoletos. | pendente |
| UI-006 | Alto | Acessibilidade | `src/components/header.tsx:110` | Botões compostos apenas por ícones sem o atributo `aria-label`. | Leitores de tela não conseguem narrar a função dos botões no cabeçalho. | pendente |
| UI-007 | Alto | Responsividade | `src/components/dashboard/recent-trades.tsx:60` | Tabela de trades recentes quebra o layout e gera rolagem na página inteira em 390px (mobile). | Experiência de navegação móvel degradada e desalinhamento de tela. | pendente |
| UI-008 | Alto | Acessibilidade | `src/components/sidebar.tsx:90` | Links/botões da navegação lateral mobile com área de toque inferior a 44x44px e sem foco visível. | Dificuldade de seleção no mobile e problemas na navegação por teclado. | pendente |
| UI-013 | Alto | Leitura Financeira | `src/components/institutional/microstructure-panel.tsx:30` | Painel de microestrutura e profundidade L2 sem `tabular-nums` nos preços, volumes e slippage. | Oscilação horizontal nos números de cotação durante atualizações de alta frequência. | pendente |
| UI-009 | Médio | Leitura Financeira | `src/components/dashboard/realtime-net-pnl-panel.tsx:320` | Variação de PnL dependendo unicamente da cor verde/vermelho sem sinal `+` nem suporte a leitores de tela. | Prejuízo de acessibilidade para usuários com daltonismo. | pendente |
| UI-010 | Médio | Desempenho | `src/components/chart/candlestick-chart-wrapper.tsx:450` | Re-renderização excessiva do wrapper do gráfico de candlestick a cada tick do WebSocket. | Alto uso de CPU e pequenos travamentos na animação do gráfico. | pendente |
| UI-011 | Médio | Consistência | `src/components/smart-trading/ui/modal.tsx:40` | Modais do Smart Trading utilizando cores e bordas inline fora dos tokens semânticos do Tailwind/shadcn. | Inconsistência de contraste e bordas entre os temas claro e escuro. | pendente |
| UI-014 | Médio | Acessibilidade | `src/components/journal/trade-journal-panel.tsx:1330` | Botões de filtros rápidos sem `aria-label` e falta de descrições acessíveis para leitores de tela na tabela pós-trade. | Usuários de leitor de tela não recebem narração adequada dos filtros e do estado do diário. | pendente |
| UI-012 | Baixo | Consistência | `src/components/footer.tsx:30` | Desalinhamento pontual de margens do rodapé em telas ultra-wide (1440px+). | Pequeno impacto estético visual em monitores grandes. | pendente |

---

## Histórico

### [Iteração 2] — 08/11/2026
- **Item Executado:** `UI-002` (Badges de ambiente PAPER vs LIVE e modal de confirmação dupla no Direct AI Trade Modal em `src/components/bot/direct-ai-trade-modal.tsx`).
- **Ações:**
  - Adicionado banner/badge inequívoco destacando o modo operacional ativo (`LIVE SPOT BINANCE` em vermelho x `PAPER SIMULADO` em ciano) na tela de configuração e no botão de ação.
  - Implementado modal de confirmação de risco pré-ordem para execuções no modo REAL (`live`), detalhando valor em USDT, estratégia, duração e ativo alvo.
  - Criado helper e suite de testes unitários `tests/unit/direct-ai-trade-confirmation.test.ts` (3 novos testes adicionados, 344/344 aprovados no total).
  - Verificação de tipos TypeScript (`npx tsc --noEmit`) e linter (`eslint`) sem erros.
  - Screenshots "DEPOIS" capturados em `ui-audit/2026-11-08-UI-002-after/`.
- **Exploração:** Auditada a área `src/components/journal/` e mapeado o item `UI-014` (acessibilidade de botões e leitor de tela no painel do diário pós-trade).
- **Commit:** `670cb815` (`fix(ui-bot): adicionar badges e confirmação de modo real no direct ai trade modal [UI-002]`).

### [Iteração 1] — 08/11/2026
- **Item Executado:** `UI-001` (Modal de confirmação de ordem em modo REAL em `src/components/smart-trading/trading/order-panel.tsx`).
- **Ações:**
  - Implementado modal de confirmação prévia com resumo da operação (lado, símbolo, cotação, quantidade estimada e valor total em USDT) ao submeter ordens com `tradingMode === 'live'`.
  - Adicionado alerta vermelho de risco de dinheiro real e botão duplo de confirmação.
  - Criado teste unitário `tests/unit/smart-order-panel-confirmation.test.ts` (3 novos testes adicionados, todos aprovados).
  - Verificação de tipos TypeScript (`npx tsc --noEmit`) e linter (`eslint`) sem erros.
  - Screenshots "DEPOIS" capturados em `ui-audit/2026-11-08-UI-001-after/`.
- **Exploração:** Auditada a área `src/components/institutional/` e mapeado o item `UI-013` (falta de `tabular-nums` no painel de microestrutura e profundidade L2).
- **Commit:** `252374df` (`fix(ui-smart-trading): adicionar modal de confirmação de ordem em modo real [UI-001]`).

### [Iteração 0] — 08/11/2026
- **Ações:**
  - Worktree `melhoria-ui` criado a partir da branch `uxnew`.
  - Exclusões de git configuradas em `.git/info/exclude` (`ui-audit/` e `db/ui-dev.db`).
  - Servidor de desenvolvimento seguro iniciado na porta 3100 com banco de dados isolado `ui-dev.db` e sem chaves de API ativas da Binance.
  - Testes unitários (`bun test tests/unit`) executados com sucesso (338/338 aprovados).
  - Checagem de tipos TypeScript (`npx tsc --noEmit -p tsconfig.json`) aprovada sem erros.
  - Captura inicial de screenshots de auditoria do app em 3 larguras (390px, 768px, 1440px) x 2 temas (claro e escuro) salvas em `ui-audit/2026-11-08/`.
  - Elaboração do backlog priorizado inicial em `MELHORIAS-UI.md`.
