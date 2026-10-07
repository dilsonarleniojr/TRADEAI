---
trigger: always_on
---

# Padrões Arquiteturais e Pilares de Trading Algorítmico Institucional

Este documento define os requisitos mandatórios para a transformação do TradeAI em uma plataforma institucional de trading algorítmico de alta frequência e baixa latência.

---

## Pilar 1: Camada de Infraestrutura e Execução (I/O & Rede)
1. **Arquitetura Orientada a Eventos (Event-Driven)**:
   - Proibido o uso de loops bloqueantes com polling REST repetitivo no caminho crítico.
   - Utilizar conexões WebSocket persistentes com streams contínuos de klines, bookTicker e profundidade de mercado L2.
2. **Connection Pooling e Keep-Alive**:
   - Reutilizar sessões TCP/HTTP persistentes (`keep-alive`) para evitar o overhead de 3-way handshakes e negociação TLS no momento de despacho de ordens críticas.
3. **Failover e Heartbeat Contínuo**:
   - Detecção em milissegundos de quedas de WebSocket (`ping/pong` heartbeat).
   - Reconexão com backoff e reconciliação atômica de livro de ofertas (snapshot inicial + buffer de deltas sequenciais).

---

## Pilar 2: Gestão de Risco Automatizada (Safety Nets)
1. **Circuit Breakers (Kill Switch Global e Local)**:
   - Trava de perda diária máxima ($\le 3.0\%$ do equity/NAV da banca).
   - Trava de perdas consecutivas (*Consecutive Loss Brake* $\ge 3$ perdas).
   - Trava de volatilidade e liquidez extrema (bloqueio imediato se o spread relativo abrir além de $0.35\%$).
2. **Filtros Pré-Ordem em Memória**:
   - Sanitização de preço por `tickSize` e lote por `stepSize`.
   - Garantia de que o valor nocional atinja `minNotional` antes do pacote sair para a rede.
   - Verificação em memória do saldo livre e da exposição total antes do despacho.
3. **Gerenciador de Ordens e Posições Órfãs**:
   - Rotina periódica de auditoria cruzada entre a exchange e o estado local do bot, cancelando resquícios não executados via requisições idempotentes.

---

## Pilar 3: Motor de Dados e Backtesting / Validação
1. **Simulação Realista com Fricção**:
   - Modelagem de taxas de corretagem diferenciadas (*Maker* vs *Taker*).
   - Slippage dinâmico dependente da profundidade volumétrica do book no instante da execução.
   - Injeção de latência sintética (*tick-to-trade delay*) simulando tempo de trânsito de rede.
2. **Validação Walk-Forward e Monte Carlo**:
   - Vetar parametrização com sobreajuste (*overfitting*). Validação obrigatória fora da amostra (*out-of-sample*) e análise de robustez com reordenação de trades.
3. **Tick Data e L1/L2 Local**:
   - Coleta e compactação colunar de dados tick-by-tick para simulações e calibração de modelos matemáticos.

---

## Pilar 4: Observabilidade, Métricas e Telemetria
1. **Métricas Financeiras Dinâmicas**:
   - Apuração contínua de PnL Realizado, PnL Não Realizado, Drawdown Máximo, Sharpe Ratio, Sortino Ratio, Profit Factor e Payoff Ratio.
2. **Logs Estruturados em JSON**:
   - Emissão de eventos estruturados com campos `timestamp`, `level`, `subsystem`, `event` e `details`.
   - Notificações de alerta (Telegram/Discord/Webhooks) para eventos de criticidade `ERROR` ou `CRITICAL`.
3. **Cockpit e Dashboard Centralizado**:
   - Painel institucional em tempo real com telemetria de latência p50/p95, saúde dos nós e distribuição de risco.

---

## Pilar 5: Segurança Operacional e Governança
1. **Gerenciamento Seguro de Credenciais**:
   - Proibição absoluta de chaves de API *hardcoded*. Uso de variáveis de ambiente isoladas (`.env`).
2. **Privilégios Mínimos na Exchange**:
   - Chaves restritas estritamente a Trading (Spot/Margin). **Permissão de Saque (Withdrawal) estritamente revogada**.
   - Vinculação obrigatória a IP fixo na whitelist da exchange.
3. **Isolamento de Processo**:
   - Execução em contêiner Docker supervisionado com políticas de auto-restart (`restart: unless-stopped` / `Restart=always`).
