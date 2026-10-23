# Manual de Uso e Operação Técnica Completa
## Plataforma de Trading Algorítmico de Alta Performance (TradeAI Desktop)

---

> [!IMPORTANT]
> **LEITURA OBRIGATÓRIA ANTES DE INICIAR QUALQUER SESSÃO LIVE.**  
> Este manual documenta os procedimentos operacionais padrão (SOP), diretrizes de segurança, governança de risco financeiro e protocolos de contingência da plataforma TradeAI conectada à Binance (Spot e USDT-M Futures). A inobservância destas regras pode acarretar perda total ou parcial de capital.

---

## 1. Visão Geral do Sistema e Arquitetura

O **TradeAI** é uma estação de trabalho de negociação algorítmica de baixa latência projetada para operadores quantitativos e traders desktop. A aplicação opera sob o modelo **Event-Driven Assíncrono**, combinando recepção contínua de fluxo de dados via WebSockets com despacho de ordens otimizado via REST HTTP/2.

```mermaid
flowchart LR
    subgraph Binance_Exchange ["Binance Infrastructure"]
        WS_Mkt["Market Data WS (Streams)"]
        WS_User["User Data Stream (Fills/Orders)"]
        REST_API["REST API v3 / fapi (Orders)"]
    end

    subgraph TradeAI_Desktop ["TradeAI Engine (Desktop App)"]
        Coalescer["V-Sync Tick Coalescer (60-144 FPS)"]
        RingBuffer["Typed Ring Buffer (Float64Array)"]
        RiskEngine["Pre-Trade Risk Gate & Circuit Breakers"]
        BotEngine["Autonomous Bot Execution Engine"]
        ChartUI["Canvas/SVG Offscreen Chart & Order Book"]
        Logger["Structured Logger (FIFO Buffer)"]
    end

    WS_Mkt -->|Raw Ticks & Depth| Coalescer
    WS_User -->|Execution Reports| RiskEngine
    Coalescer --> RingBuffer
    RingBuffer --> BotEngine
    RingBuffer --> ChartUI
    BotEngine -->|Order Proposals| RiskEngine
    RiskEngine -->|Signed Orders (HMAC-SHA256)| REST_API
    RiskEngine --> Logger
```

### 1.1 Ecossistemas Conectados
- **Binance Spot:** Negociação à vista com alavancagem 1x, livre de custos de financiamento (Funding Rates) e risco de liquidação forçada.
- **Binance USDT-M Futures:** Contratos perpétuos marginais em USDT para posições direcionais (Long/Short) com hedge e alavancagem controlada.

### 1.2 Pipeline de Dados e Renderização
- **Streams Contínuos:** Klines de 1s/1m, `bookTicker` e L2 Depth (`@depth20@100ms`).
- **V-Sync Coalescer:** Agrupamento de ticks de alta frequência no ciclo de renderização do monitor (`requestAnimationFrame`), eliminando travamentos de interface (*jank*) e consumo indevido de CPU.
- **Typed Ring Buffer:** Vetores contíguos em memória (`Float64Array`) para cálculo vetorizado de indicadores técnicos (ATR, EMA, RSI, Bollinger Bands) com zero alocação de objetos temporários e zero pausas de Garbage Collector (GC).

### 1.3 Requisitos Mínimos de Sistema

| Componente | Requisito Mínimo | Requisito Recomendado (HFT/Scalp) |
| :--- | :--- | :--- |
| **Processador (CPU)** | Intel Core i5 / AMD Ryzen 5 (4 núcleos) | Intel Core i7/i9 ou Apple Silicon M-Series (8+ núcleos) |
| **Memória (RAM)** | 8 GB DDR4 | 16 GB DDR4/DDR5 |
| **Conexão de Rede** | Banda larga de 50 Mbps com cabo Ethernet | Fibra óptica dedicada, jitter < 5 ms, ping < 50 ms até AWS/Binance |
| **Sistema Operacional** | Linux (Ubuntu 22.04+ / Debian 12), Windows 11, macOS 13+ | Linux x86_64 otimizado com kernel low-latency |
| **Sincronização NTP** | Desvio temporal máximo $< 500\text{ ms}$ | NTP contínuo via `chrony` com desvio $< 50\text{ ms}$ |

---

## 2. Configuração Inicial e Credenciais

A segurança operacional da plataforma depende da política de privilégios mínimos nas credenciais de API.

```
                  ┌──────────────────────────────────────────────┐
                  │       BINANCE API KEY PERMISSIONS            │
                  ├──────────────────────────────┬───────────────┤
                  │ [✓] Enable Reading           │ OBRIGATÓRIO   │
                  │ [✓] Enable Spot & Margin     │ OBRIGATÓRIO   │
                  │ [✓] Enable Futures           │ SE FOR USAR   │
                  │ [✗] Enable Withdrawals       │ PROIBIÇÃO ABSOLUTA
                  │ [✗] Enable Internal Transfer │ PROIBIÇÃO ABSOLUTA
                  └──────────────────────────────┴───────────────┘
```

> [!CAUTION]
> **PROIBIÇÃO ESTRITA DE PERMISSÃO DE SAQUES (WITHDRAWALS)**  
> Nunca, sob hipótese alguma, ative a opção **"Enable Withdrawals"** (Permitir Saques) ou **"Permitir Transferência Universal"** na chave de API da Binance. O TradeAI necessita apenas de leitura e despacho de ordens comerciais. Uma chave com permissão de saque vazada expõe o saldo total da conta a furto direto.

### 2.1 Passo a Passo para Criação das Chaves na Binance
1. Acesse sua conta na Binance, vá até o menu do perfil e selecione **Gerenciamento de API (API Management)**.
2. Clique em **Criar API (Create API)** e selecione **Chave Gerada pelo Sistema (System Generated)**.
3. Atribua um rótulo identificador (ex: `TradeAI-Desktop-Trading`).
4. Conclua as verificações de dois fatores (2FA / Passkey / E-mail).
5. No painel da chave recém-criada, clique em **Editar Restrições (Edit Restrictions)**:
   - Marque: `Enable Reading`.
   - Marque: `Enable Spot & Margin Trading` (e `Enable Futures`, se operar derivativos).
   - Certifique-se de que `Enable Withdrawals` permaneça **desmarcado**.
6. **Configuração de Restrição de IP (IP Whitelist):**
   - Selecione a opção **"Restrict access to trusted IPs only (Recommended)"**.
   - Insira o endereço IP público fixo da sua máquina desktop.
   - *Nota:* Caso seu provedor utilize IP dinâmico, utilize um serviço de IP fixo/VPN corporativa ou renove a lista periodicamente. Nunca deixe a chave aberta para qualquer IP (`Unrestricted`) em ambiente Live com saldo real.
7. Copie o **API Key** e o **Secret Key** e configure-os no arquivo `.env` da raiz do projeto ou no modal de credenciais do aplicativo:

```env
BINANCE_API_KEY="sua_api_key_publica_aqui"
BINANCE_API_SECRET="seu_api_secret_privado_aqui"
NEXT_PUBLIC_APP_MODE="live" # ou 'dry_run' para simulação
```

### 2.2 Sincronização de Relógio e Parâmetro `recvWindow`
A Binance valida o timestamp de toda requisição assinada. Se a diferença entre o relógio da máquina local e o servidor da Binance ultrapassar o `recvWindow`, a requisição será rejeitada com o erro `-1021 (Timestamp outside recvWindow)`.

#### Ajuste no Linux (Ubuntu/Debian):
Execute o utilitário `chrony` para calibração contínua de nanossegundos:
```bash
sudo apt-get install -y chrony
sudo chronyd -q 'server pool.ntp.br iburst'
sudo timedatectl set-ntp true
```

#### No Windows:
1. Abra as Configurações do Windows -> **Hora e Idioma** -> **Data e Hora**.
2. Clique no botão **"Sincronizar agora"** sob *Sincronizar seu relógio*.

---

## 3. Regras de Ouro e Parametrização para Banca Reduzida ($70.00 USD)

Operar com uma banca reduzida de **$70.00 USD** exige conformidade matemática estrita. Pequenos descuidos percentuais têm impacto direto na sobrevivência da conta.

```
       Banca Total: $70.00 USD
       ├── Lote Operacional por Trade: $12.00 a $14.00 USD (atende MIN_NOTIONAL)
       ├── Risco Financeiro por Trade (SL 2%): ~$0.24 a $0.28 USD (0.35% a 0.40% da banca)
       ├── Limite Diário de Perda (Circuit Breaker): $3.50 USD (5.0% da banca)
       └── Regra de Posição: Estritamente 1 Posição Ativa por Vez
```

### 3.1 Tabela de Limites de Risco Institucional

| Métrica | Parâmetro Configurado | Valor em Dólares ($) | Ação de Proteção |
| :--- | :--- | :--- | :--- |
| **Banca Total (NAV)** | Base inicial | **$70.00 USD** | Ponto de referência do equity da conta. |
| **Tamanho da Posição** | 17% a 20% do saldo Spot | **$12.00 a $14.00 USD** | Garante passagem acima do `MIN_NOTIONAL` de $10 USD. |
| **Stop-Loss Obrigatório** | 1.5% a 2.0% do preço de entrada | **$0.24 a $0.28 USD** | Risco máximo por operação limitado a < 0.40% da banca. |
| **Take-Profit Alvo** | 3.0% a 5.0% (R:R mínimo 1:1.5) | **$0.36 a $0.70 USD** | Retorno bruto esperado por trade vencedor. |
| **Breakeven Anchor** | Entrada + 0.25% líquido | **$0.00 risco residual** | Cobre round-trip fees (0.20%) + slippage (0.05%). |
| **Circuit Breaker Diário**| Perda diária $\ge 5.0\%$ do NAV | **$3.50 USD** | **Kill-Switch Ativado:** Desliga todos os bots até 00:00 UTC. |
| **Consecutive Loss Brake**| 3 stops seguidos no mesmo dia | **~$0.80 USD** | Pausa obrigatória de 60 minutos para reavaliação de regime. |

### 3.2 Adequação ao `MIN_NOTIONAL` da Binance
A Binance rejeita ordens cujo valor nocional ($\text{Quantidade} \times \text{Preço}$) seja inferior ao filtro `MIN_NOTIONAL` estabelecido para o par (padronizado em **$10.00 USD** para pares Spot USDT como BTCUSDT, ETHUSDT e SOLUSDT).

> [!WARNING]
> **POR QUE NÃO ALOCAR $5 OU $7 POR OPERAÇÃO?**  
> Se o bot tentar despachar uma ordem de $7.00 USD, a Binance responderá imediatamente com o erro `HTTP 400: -1013 Filter failure: NOTIONAL`.  
> Por isso, no TradeAI com banca de $70.00 USD, o dimensionador de ordens aloca uma fatia de **$12.00 a $14.00 USD**.  
> **Atenção:** Como o Stop Loss é colocado a 2.0% do preço, você não está arriscando $12 USD, mas sim **$0.24 USD** por operação. Seu capital total está 100% protegido.

### 3.3 Política de Posição Única (Single Active Trade)
- **Regra:** O motor de execução bloqueia a abertura de uma nova posição se qualquer bot já estiver com uma operação em aberto.
- **Racional:** Abrir 3 posições simultâneas de $12 USD comprometeria mais de 50% da liquidez livre da conta, deixando a margem sem capacidade de manobra para ordens de proteção ou ajustes de preço médio controlado.

---

## 4. Interface e Ergonomia Operacional (Desktop First)

A interface do TradeAI foi projetada para minimizar a carga cognitiva e permitir tomada de decisão em milissegundos.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [● LIVE] BTCUSDT $64,250.20 | E2E: 42ms | FPS: 120 | Kill-Switch Diário: 0/3.50$ │
├──────────────────────────────┬───────────────────────────────────┬───────────────┤
│        ORDER BOOK L2         │     GRÁFICO TÉCNICO (CANVAS)      │ COCKPIT BOTS  │
│                              │                                   │               │
│ 64,255.00  1.42 BTC [====]   │ [TP] $65,535.00 (+$15.40 | +2.0%) │ Bot Momentum  │
│ 64,252.50  0.85 BTC [==]     │                                   │ Pos: 0.002 BTC│
│ 64,250.20  SPREAD: $0.10     │ ── Preço Atual: $64,250.20 ───    │ PnL: +$1.42   │
│ 64,249.90  2.10 BTC [======] │                                   │               │
│ 64,248.00  3.80 BTC [======] │ ⚓ [BE ANCHOR] $64,410.80 (+0.25%) │ Bot Scalper   │
│                              │ [SL] $62,965.00 (-$15.40 | -2.0%) │ Status: STANDBY│
├──────────────────────────────┴───────────────────────────────────┴───────────────┤
│ FITA DE TRADES (TIME & SALES)    │ TERMINAL DE LOGS ESTRUTURADOS (JSON)          │
└──────────────────────────────────┴───────────────────────────────────────────────┘
```

### 4.1 Módulos Principais da Tela
1. **Global Status Bar (Topo):** Exibe o modo de execução (`LIVE` / `DRY_RUN`), latência ponta a ponta (`p50/p95`), taxa de quadros (FPS), status do WebSocket e termômetro do Circuit Breaker diário.
2. **Order Book L2 (Esquerda):** Livro de ofertas institucional em slots virtuais estáticos (Zero-DOM), barras horizontais de profundidade volumétrica e micro-tick flashes verdes/vermelhos em mudanças de cota.
3. **Gráfico Técnico Central:** Renderizador desacoplado de candles, com crosshair magnético de aproximação, identificador de pavios de absorção (*Stop Hunt Rejections*), anomalias de RVOL e linhas interativas de posição.
4. **Cockpit Lateral de Bots:** Painel com cartões individuais de cada estratégia configurada, permitindo inicialização, pausa, ajuste de parâmetros de risco e visualização do PnL não-realizado.
5. **Terminal de Logs & Time & Sales (Base):** Registro em tempo real de execuções de ordens, rejeições de filtros, despachos de rede e histórico contínuo de fluxo.

### 4.2 Tabela de Atalhos de Teclado (Hotkeys de Alta Velocidade)

| Tecla / Combinação | Função Operacional | Comportamento Imediato |
| :--- | :--- | :--- |
| **`Duplo Esc`**<br>(pressionar 2x rápido) | **KILL-SWITCH GLOBAL DE EMERGÊNCIA** | Cancela todas as ordens abertas na Binance, pausa todos os bots ativos e fecha conexões de despacho. |
| **`Espaço`** | Pausar / Retomar Auto-Scroll | Congela a rolagem da fita de trades e do terminal de logs para auditoria de eventos sem perder dados em buffer. |
| **`Ctrl + K`** ou **`Cmd + K`** | Paleta de Comandos Rápidos | Abre modal de busca rápida para alternar pares (ex: `BTCUSDT`, `ETHUSDT`, `SOLUSDT`) ou acionar ações globais. |
| **`R`** | Régua de Risco:Retorno | Ativa o modo de medição visual sobre o gráfico. Clique no ponto de entrada e arraste para projetar caixas de ganho/perda. |
| **`Duplo Clique no SL`** | **Ativar BE Anchor** | Trava o Stop-Loss instantaneamente no preço de entrada $+ 0.25\%$ (preço com taxas cobertas). |

### 4.3 Ajuste Interativo de Alvos no Gráfico
Você não precisa digitar preços em formulários para alterar a proteção de uma posição aberta:
1. **Modificar Take-Profit:** Posicione o cursor do mouse sobre a linha verde horizontal de `TP` ou sobre o círculo de arraste na extremidade direita. Clique com o botão esquerdo e arraste para o novo nível de preço desejado. O badge calculará dinamicamente o ganho em USD e porcentagem em tempo real. Solte o mouse para despachar a modificação.
2. **Modificar Stop-Loss:** Clique e arraste a linha vermelha de `SL` para ajustar o ponto de saída de emergência.
3. **Travar em Breakeven com Risco Zero:** 
   - Dê um **duplo clique** na linha de Stop-Loss ou no círculo de arraste.
   - Alternativamente, clique no botão rápido **`⚡ FIXAR BE`** exibido ao lado do badge de SL.
   - A linha mudará instantaneamente para a cor **Dourada (`🛡️ SL (BE PROTEGIDO)`)**, emitirá um sinal sonoro de confirmação e registrará a trava de risco no log do sistema.

---

## 5. Operação dos Bots: Do Início ao Fim da Sessão

Siga este procedimento operacional padrão diariamente para assegurar estabilidade operacional.

```
       [ 1. PRÉ-ABERTURA ] ──> Sincronizar NTP + Purga de Ordens Órfãs + Teste de Latência
              │
       [ 2. AMBIENTE ]     ──> Confirmar modo DRY_RUN ou LIVE + Verificação de Saldo Livre
              │
       [ 3. INICIALIZAÇÃO] ──> Seleção de Ativo por Liquidez + Start no Cockpit de Bots
              │
       [ 4. MONITORAMENTO] ──> Acompanhar BE Anchor + Spread < 0.15% + Termômetro de Risco
              │
       [ 5. ENCERRAMENTO ] ──> Exportação do Diário de Trades + Cancelamento Preventivo
```

### 5.1 Checklist de Pré-Abertura (Antes de Iniciar as Operações)
- [ ] **Sincronização de Relógio:** Verificar se o desvio NTP está inferior a 100 ms.
- [ ] **Limpeza de Ordens Órfãs:** Acessar a Binance ou verificar a fita de posições da plataforma para assegurar que não há ordens limites esquecidas da sessão anterior.
- [ ] **Checagem de Latência:** Confirmar se o indicador no cabeçalho exibe `p50 < 80ms` (cor verde). Se estiver amarelo ou vermelho (> 200 ms), não opere scalping.
- [ ] **Alimentação e Rede:** Assegurar que o computador não entrará em suspensão automática/hibernação e que a conexão com a internet esteja estável.

### 5.2 Seleção de Ativos: Manual vs. IA Quantitativa
- **Operação Manual:** O operador escolhe diretamente o par no cabeçalho ou via `Ctrl + K`.
- **Seleção Dinâmica via IA / Scanner Quantitativo:**
  - O sistema avalia a lista de pares monitorados e seleciona aqueles com:
    1. **Spread Relativo:** $< 0.15\%$ do preço.
    2. **Volume 24h:** Superior a $50.000.000 USD (garantindo que ordens a mercado não sofram slippage severo).
    3. **Amplitude ATR:** Potencial de ganho do setup superior a $1.5\%$ líquido de taxas de corretagem.

### 5.3 Chaveamento Live vs. Paper Trading (Modo Dry Run)
A plataforma conta com um interruptor seguro de modo de execução:
- **Modo Dry Run (Paper Trading com Fila Real):**
  - O motor conecta-se aos WebSockets reais da Binance e processa cotações e livros de ofertas em tempo real.
  - Ao disparar ordens, elas são simuladas com base na liquidez real do book, calculando taxas de corretagem Maker/Taker e derrapagem sem consumir saldo real da conta.
  - *Recomendação:* Execute no mínimo 20 operações em modo Dry Run antes de migrar qualquer estratégia para dinheiro real.
- **Modo Live (Dinheiro Real):**
  - Ao alternar a chave no cabeçalho para `LIVE`, o sistema solicita confirmação explícita.
  - A partir desse momento, todo sinal validado pelo portão de risco enviará chamadas `POST /api/v3/order` autenticadas à Binance.

---

## 6. Notificações Remotas e Telemetria

O TradeAI integra um despachante assíncrono para o **Telegram**, permitindo monitorar execuções e intervir remotamente mesmo longe do terminal de trading.

### 6.1 Configuração do Bot do Telegram
1. No Telegram, converse com o `@BotFather` e envie o comando `/newbot`.
2. Escolha o nome e o nome de usuário do bot (ex: `TradeAI_Alerts_Bot`).
3. Copie o **HTTP API Token** gerado.
4. Para obter o seu ID de usuário, inicie uma conversa com o `@userinfobot` e copie o número exibido em `Id`.
5. Insira as credenciais no arquivo `.env` ou na aba de configurações da plataforma:

```env
TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
TELEGRAM_CHAT_ID="987654321"
```

6. Na aba **Telegram Bot** da plataforma, clique no botão **"Testar Conexão"**. Você receberá uma mensagem imediata confirmando a integração.

### 6.2 Tipos de Alertas Disparados
- **Execução de Ordem:** Mensagem imediata informando par, lado (COMPRA/VENDA), preço de execução, quantidade, Stop-Loss e Take-Profit associados.
- **Encerramento de Posição:** Resumo com resultado líquido em USD, rentabilidade percentual, duração da operação, métricas de **MAE** (pior derrapagem contra) e **MFE** (máxima excursão favorável).
- **Alerta de Circuit Breaker:** Notificação prioritária informando travamento do Kill Switch diário em decorrência de perda acumulada.
- **Relatório Noturno Consolidado (Daily Digest):** Às 00:00 UTC com Win Rate do dia, PnL consolidado e fator de lucro.

### 6.3 Comandos Remotos Seguros (Whitelist de Chat ID)
O bot aceita comandos de controle remoto enviados exclusivamente a partir do `TELEGRAM_CHAT_ID` cadastrado:
- `/status` — Retorna o estado atual da banca, bots ativos e PnL não-realizado da posição aberta.
- `/pause` — Pausa temporariamente novos disparos de ordens pelos bots.
- `/resume` — Retoma a operação normal dos robôs.
- `/kill` — **Acionamento remoto do Kill Switch de Emergência** (cancela ordens pendentes e fecha a operação ativa a mercado).

### 6.4 Canais de Logs Estruturados no Terminal
Os logs da plataforma são categorizados por canais para diagnóstico rápido:

| Canal | Propósito | Exemplo de Evento |
| :--- | :--- | :--- |
| **`MARKET_DATA`** | Monitoramento de WebSockets e telemetria | `[WS_CONNECTED] Stream kline_1m conectado para BTCUSDT` |
| **`SIGNALS`** | Sinais analíticos e confluência de indicadores | `[ORDER_FLOW] Absorção detectada em suporte com RVOL 3.4σ` |
| **`RISK_ENGINE`** | Validações pré-ordem e travas de segurança | `[BE ANCHOR] Stop Loss travado em Breakeven ($64,410.80)` |
| **`BINANCE_API`** | Chamadas REST, rate limit e respostas | `[REST_ORDER] Ordem #10842 preenchida via POST em 38ms` |

---

## 7. Gestão de Contingências e Resolução de Erros (Troubleshooting)

Em negociações automatizadas, falhas operacionais e desconexões de rede são inevitáveis. A equipe de operação deve dominar os procedimentos de contingência descritos abaixo.

### 7.1 Tabela de Códigos de Erro da Binance e Soluções Imediatas

| Código de Erro | Mensagem da Exchange | Causa Raiz | Ação Corretiva Imediata |
| :--- | :--- | :--- | :--- |
| **`-1013`** | `Filter failure: NOTIONAL` | O valor financeiro da ordem é inferior ao limite mínimo ($10.00 USD). | Ajuste o lote para no mínimo $11.50 a $13.00 USD. Verifique se o saldo livre não está fracionado. |
| **`-1013`** | `Filter failure: LOT_SIZE` | Quantidade possui mais casas decimais que o permitido pelo `stepSize` do par. | O motor sanitiza o lote automaticamente. Se persistir, reinicie o bot para atualizar o cache de `exchangeInfo`. |
| **`-1021`** | `Timestamp outside recvWindow` | O relógio da máquina local está adiantado ou atrasado em relação à Binance. | Sincronize o relógio do sistema via NTP imediatamente (ver Seção 2.2). Em conexões com jitter, aumente o `recvWindow` para 10000ms. |
| **`-2010`** | `Account has insufficient balance` | Saldo livre em USDT insuficiente para honrar a ordem. | Ordens paradas ou posições em outros pares estão bloqueando margem. Verifique e cancele ordens manuais presas na exchange. |
| **`-1003`** | `Too many requests / IP banned` | O sistema excedeu o limite de requisições por minuto (`request weight` $\ge 1200$). | O circuit breaker pausará requisições automaticamente. Não force novas chamadas manuais. Aguarde a liberação do IP. |
| **`STALE DATA`**| `Market Data Stale (>3000ms)` | Queda ou lentidão severa no stream WebSocket de cotações. | O FeedWatchdog suspende novas entradas preventivamente e tenta reconectar com backoff exponencial. |

### 7.2 Procedimento Emergencial de Fechamento Manual e Isolamento de Falha
Caso o sistema apresente comportamento anômalo, congelamento de interface ou perda total de sinal de internet:

```
PASSO 1: Pressione DUPLO ESC no teclado da plataforma ou clique em "KILL SWITCH GLOBAL".
                           │
PASSO 2: Abra o aplicativo oficial da Binance no celular (via 4G/5G, fora do Wi-Fi).
                           │
PASSO 3: Acesse "Ordens Abertas" e cancele todas as ordens pendentes.
                           │
PASSO 4: Acesse a carteira Spot/Futures e encerre qualquer posição ativa a mercado.
                           │
PASSO 5: Inspecione o canal RISK_ENGINE nos logs para auditoria de causa-raiz.
```

1. **Tentativa Local:** Pressione imediatamente **`Duplo Esc`** no terminal desktop. Isso aciona o cancelamento assíncrono prioritário de ordens.
2. **Redundância Mobile (Plano B):** Mantenha o aplicativo oficial da Binance instalado e autenticado no seu smartphone conectado à rede móvel 4G/5G (isolado da rede de internet local do computador).
3. **Cancelamento Manual na Exchange:**
   - Acesse **Trades** -> **Ordens Abertas** -> **Cancelar Todas**.
   - Se houver posição comprada ativa desprotegida, execute uma venda a mercado imediata para neutralizar o risco direcional.
4. **Auditoria Pós-Incidente:**
   - Não reinicie os robôs imediatamente.
   - Abra o arquivo de log estruturado ou o terminal do TradeAI e filtre pelo canal `BINANCE_API` e `RISK_ENGINE` para identificar o timestamp exato e a causa raiz do problema.

---

> [!TIP]
> **DIRETRIZ FINAL DE SUCESSO OPERACIONAL:**  
> A consistência em trading algorítmico não depende de ter 100% de trades vencedores, mas sim da aplicação rígida da disciplina de risco. Respeite sempre o teto diário do Circuit Breaker ($3.50 USD para a banca de $70 USD). Quando o Circuit Breaker disparar, desligue a máquina e volte apenas na sessão do dia seguinte.
