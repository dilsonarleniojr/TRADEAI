---
trigger: always_on
---

# Guardrails Estritos de Execução & Governança de Risco do TradeAI

Este documento estabelece as regras mandatórias de segurança operacional, mitigação de risco e conformidade algorítmica para o TradeAI. Toda e qualquer ação de análise, despacho de ordens ou orquestração de robôs deve respeitar os princípios abaixo.

---

## 1. Validação Estrita de Temporalidade (Data Freshness)
- **Regra**: Toda rotina, função ou skill que consultar preços, volumes ou order books deve obrigatoriamente validar e registrar o timestamp (`timestamp` ou `transactTime`) do dado retornado.
- **Tolerâncias Máximas de Latência**:
  - **Scalping / Alta Frequência**: Latência máxima permitida $\le 1.000\text{ ms}$ (1 segundo).
  - **Day Trade**: Latência máxima permitida $\le 30.000\text{ ms}$ (30 segundos).
  - **Swing Trade**: Latência máxima permitida $\le 300.000\text{ ms}$ (5 minutos).
- **Ação em Caso de Violação**: Abortar imediatamente a etapa de execução caso o atraso da cotação ultrapasse o limite definido.
- **Proibição Absoluta**: É estritamente proibido tomar decisões financeiras ou acionar compras/vendas usando dados de cache não verificados ou obsoletos.
- **Racional Técnico**: Previne execuções baseadas em *stale data* em mercados de alta volatilidade (Binance, OKX, Bybit), onde centésimos de segundo aumentam exponencialmente o slippage e a derrapagem de preço.

---

## 2. Guardrails de Risco Embutidos (Risk Limits)
- **Regra**: Antes de despachar qualquer payload de ordem de compra ou venda (seja na Binance, OKX, Mynt ou via WebSocket), os parâmetros devem ser submetidos à camada mandatória de **Validação de Risco**.
- **Limites Rígidos Pré-Configurados**:
  - **Tamanho Máximo de Posição**: Máximo de **5% do saldo total da banca (NAV)** por ativo individual.
  - **Stop-Loss Obrigatório**: Stop-loss estrito configurado em até **2.0%** do preço de entrada (ou trailing stop equivalente). Nenhuma ordem de entrada a mercado pode ser enviada sem o respectivo parâmetro de SL calculado.
  - **Alavancagem Máxima**: Limitada a $1\times$ (Spot) ou teto configurado de margem com circuit breaker.
  - **Sanitização Numérica**: Verificação estrita contra valores `NaN`, infinitos, casas decimais fora do tick size ou falhas de conversão de string para float.
- **Ação em Caso de Violação**: Se qualquer métrica for violada, a ordem é sumariamente bloqueada no portão pré-trade e o agente reporta a falha detalhada.
- **Racional Técnico**: Impede que alucinações matemáticas de LLMs, erros de precisão decimal ou falhas de parsing enviem ordens acidentais que possam liquidar a conta ou gerar drawdowns descontrolados.

---

## 3. Explicabilidade de Sinais Matemáticos (Clear-Box Strategy)
- **Regra**: Ao gerar uma análise de trade ou sinal de entrada/saída, o relatório do agente e o log de execução devem separar explicitamente os gatilhos matemáticos da análise qualitativa de sentimento (notícias).
- **Transparência de Indicadores**:
  - Listar expressamente quais indicadores quantitativos (ex: RSI, MACD, OBV, ATR, Bandas de Bollinger, ADX) cruzaram limiares.
  - Especificar os períodos exatos analisados (ex: EMA 9, EMA 21, SMA 50, RSI 14).
  - Apresentar os pesos e votos individuais do comitê quantitativo (Trend, Momentum, Order Flow).
  - Separar os gatilhos quantitativos dos dados de notícias e sentimento social.
- **Racional Técnico**: Remove o efeito "caixa-preta" (*black box*) do modelo de inteligência artificial. Garante rastreabilidade técnica e auditabilidade para que você possa debugar se a lógica algorítmica do TradeAI está alinhada à estratégia antes de comprometer capital.

---

## 4. Gestão Autônoma de Rate Limits (Anti-Ban)
- **Regra**: Durante a Fase 1 (Planejamento), se a tarefa exigir múltiplas consultas a APIs de exchanges (Binance, OKX, Mynt), o agente deve calcular o peso acumulado (*request weight*) das chamadas.
- **Controle de Vazão e Resiliência**:
  - Monitorar ativamente cabeçalhos de resposta HTTP (`X-MBX-USED-WEIGHT-1M`, etc.) e capturar códigos `HTTP 429` (Too Many Requests) ou `HTTP 418` (IP Banned).
  - Injetar pausas automáticas (*exponential backoff* com jitter) caso a cota por minuto atinja 80% do limite operacional.
  - Fila de despacho em lote com throttling nativo para prevenir rajadas desnecessárias de requisições.
- **Racional Técnico**: APIs de exchanges aplicam punições e banimentos de IP severos por excesso de requisições. O sistema não pode paralelizar buscas massivas sem autogerenciar a própria pressão de rede.

---

## 5. Execução em "Dry Run" por Padrão (Paper Trading Nativo)
- **Regra**: O sistema opera obrigatoriamente com uma variável global de estado `execution_mode: 'dry_run' | 'live'`.
- **Comportamento em Modo Dry Run**:
  - Monta o payload JSON completo da ordem.
  - Valida parâmetros de lot size, step size e tick size da exchange.
  - Calcula a estimativa exata de taxas de corretagem (*trading fees*: Maker/Taker) e o slippage projetado no book.
  - Gera as assinaturas criptográficas de verificação (se aplicável).
  - **Interrompe o fluxo exatamente antes do dispatch do POST** de rede para a exchange real.
  - O relatório final exibe o JSON exato que seria enviado e a estimativa de custos operacionais.
- **Racional Técnico**: Valida toda a esteira do TradeAI em condições de tempo real sem risco de capital até que a integridade matemática e os parâmetros estejam 100% verificados.

---

## 6. Filtro de Amplitude Mínima ATR (Anti-Overtrading)
- **Regra**: Proibido abrir operações em ativos cujo potencial de ganho até o alvo ATR seja inferior a 1.5% líquido de taxas operacionais.
- **Racional Técnico**: Evita micro-operações de alta frequência com retorno nominal quase zero, protegendo a banca contra o desgaste e a erosão contínua por taxas de corretagem.

---

## 7. Fim do DCA Cego (Anti-Martingale)
- **Regra**: Proibido realizar entradas de DCA baseadas apenas em RSI sobrevendido sem confirmação de candle de reversão no price action e sem validação de tendência macro (15m/1h).
- **Racional Técnico**: Previne acúmulo desproporcional de perdas ao comprar facas caindo (*falling knives*).
