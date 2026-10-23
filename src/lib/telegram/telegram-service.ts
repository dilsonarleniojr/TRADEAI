/**
 * TradeAI - Serviço de Notificações Remotas e Alertas via Telegram Bot
 *
 * Características:
 * - Despacho assíncrono não-bloqueante com fila de prioridades (FIFO com throttle).
 * - Proteção estrita de rate limit (máx 1 msg/500ms por chat e backoff em HTTP 429 com `retry_after`).
 * - Formatação rica em Markdown para:
 *   * Execuções de ordens (Par, Direção, Preço, Tamanho, Risco).
 *   * Take-Profit / Stop-Loss com PnL líquido em USD e %.
 *   * Acionamento de Circuit Breakers e Travas de Emergência.
 *   * Daily Digest diário (total trades, win rate, PnL acumulado).
 * - Processamento de comandos remotos seguros validados por Chat ID (/status, /pause, /resume, /kill).
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifyOnOrder: boolean;
  notifyOnTpSl: boolean;
  notifyOnKillSwitch: boolean;
  notifyDailyDigest: boolean;
  allowedChatIds?: string[]; // Whitelist para comandos remotos
}

export interface TelegramMessageItem {
  id: string;
  text: string;
  priority: "URGENT" | "HIGH" | "NORMAL" | "LOW";
  parseMode?: "Markdown" | "HTML";
  timestamp: number;
}

export interface BotStatusSummary {
  activeBotsCount: number;
  openPositionsCount: number;
  totalUnrealizedPnl: number;
  dailyRealizedPnl: number;
  circuitBreakerActive: boolean;
  emergencyMode: boolean;
}

const TELEGRAM_CONFIG_STORAGE_KEY = "tradeai_telegram_bot_config_v1";

export class TelegramNotificationService {
  private static instance: TelegramNotificationService | null = null;
  private config: TelegramConfig = {
    botToken: "",
    chatId: "",
    enabled: false,
    notifyOnOrder: true,
    notifyOnTpSl: true,
    notifyOnKillSwitch: true,
    notifyDailyDigest: true,
    allowedChatIds: [],
  };

  private messageQueue: TelegramMessageItem[] = [];
  private isProcessingQueue: boolean = false;
  private lastSentTimestamp: number = 0;
  private minIntervalMs: number = 600; // Evita bater no limite de 1 msg/segundo do Telegram
  private isPollingCommands: boolean = false;
  private lastUpdateId: number = 0;
  private pollIntervalId: any = null;

  // Handlers para comandos recebidos
  private commandHandlers: {
    onStatus?: () => BotStatusSummary;
    onPause?: () => void;
    onResume?: () => void;
    onKillSwitch?: (reason: string) => void;
  } = {};

  private constructor() {
    this.loadConfig();
    this.initDailyDigestTimer();
  }

  public static getInstance(): TelegramNotificationService {
    if (!TelegramNotificationService.instance) {
      TelegramNotificationService.instance = new TelegramNotificationService();
    }
    return TelegramNotificationService.instance;
  }

  public registerCommandHandlers(handlers: {
    onStatus?: () => BotStatusSummary;
    onPause?: () => void;
    onResume?: () => void;
    onKillSwitch?: (reason: string) => void;
  }): void {
    this.commandHandlers = handlers;
  }

  public updateConfig(newConfig: Partial<TelegramConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();

    if (this.config.enabled && this.config.botToken && this.config.chatId) {
      this.startCommandPolling();
    } else {
      this.stopCommandPolling();
    }
  }

  public getConfig(): TelegramConfig {
    return { ...this.config };
  }

  /**
   * Valida a conexão com o Bot do Telegram através de getMe e envio de ping de teste.
   */
  public async testConnection(token?: string, targetChatId?: string): Promise<{ success: boolean; message: string; botUsername?: string }> {
    const activeToken = token || this.config.botToken;
    const activeChatId = targetChatId || this.config.chatId;

    if (!activeToken || !activeToken.trim()) {
      return { success: false, message: "Token do Telegram não informado." };
    }

    try {
      // 1. Testa getMe
      const meRes = await fetch(`https://api.telegram.org/bot${activeToken}/getMe`);
      const meData = await meRes.json();
      if (!meData.ok) {
        return { success: false, message: `Falha na autenticação do token: ${meData.description || "Token inválido"}` };
      }
      const botUsername = meData.result?.username;

      // 2. Se houver chatId, envia mensagem de teste
      if (activeChatId && activeChatId.trim()) {
        const testText = `🤖 *TradeAI Institutional Platform*\n\nConexão com o Telegram validada com sucesso!\n• Bot: @${botUsername}\n• Timestamp: \`${new Date().toISOString()}\`\n• Status: *Operacional*`;
        const sendRes = await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: activeChatId,
            text: testText,
            parse_mode: "Markdown",
          }),
        });
        const sendData = await sendRes.json();
        if (!sendData.ok) {
          return { success: false, message: `Bot autenticado (@${botUsername}), mas falhou ao enviar para Chat ID: ${sendData.description}` };
        }
      }

      return {
        success: true,
        message: `Conexão bem-sucedida com @${botUsername}${activeChatId ? " e mensagem de teste enviada!" : " (Chat ID não fornecido)"}`,
        botUsername,
      };
    } catch (err: any) {
      return { success: false, message: `Erro de rede ao conectar à API do Telegram: ${err.message || String(err)}` };
    }
  }

  /**
   * Enfileira uma mensagem para despacho assíncrono controlado por taxa.
   */
  public enqueueMessage(text: string, priority: "URGENT" | "HIGH" | "NORMAL" | "LOW" = "NORMAL"): void {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return;
    }

    const item: TelegramMessageItem = {
      id: `tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text,
      priority,
      parseMode: "Markdown",
      timestamp: Date.now(),
    };

    if (priority === "URGENT") {
      this.messageQueue.unshift(item);
    } else {
      this.messageQueue.push(item);
    }

    this.processQueue();
  }

  /**
   * Notificação de Ordem Executada
   */
  public notifyOrderExecution(order: {
    symbol: string;
    side: "BUY" | "SELL";
    price: number;
    quantity: number;
    totalUsd: number;
    mode: "live" | "paper";
    strategy?: string;
    riskPerTradePercent?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }): void {
    if (!this.config.notifyOnOrder) return;

    const emoji = order.side === "BUY" ? "🟢" : "🔴";
    const modeBadge = order.mode === "live" ? "⚡ *LIVE*" : "📝 *PAPER*";

    const msg = [
      `${emoji} *ORDEM EXECUTADA: ${order.side} ${order.symbol}*`,
      `${modeBadge} | Estratégia: \`${order.strategy || "HFT Flow"}\``,
      ``,
      `• *Preço:* \`$${order.price.toFixed(4)}\``,
      `• *Quantidade:* \`${order.quantity}\``,
      `• *Nocional:* \`$${order.totalUsd.toFixed(2)} USDT\``,
      order.riskPerTradePercent ? `• *Risco:* \`${order.riskPerTradePercent.toFixed(1)}% do NAV\`` : null,
      order.stopLossPrice ? `• *Stop-Loss:* \`$${order.stopLossPrice.toFixed(4)}\`` : null,
      order.takeProfitPrice ? `• *Take-Profit:* \`$${order.takeProfitPrice.toFixed(4)}\`` : null,
      `• *Timestamp:* \`${new Date().toLocaleTimeString()}\``,
    ]
      .filter(Boolean)
      .join("\n");

    this.enqueueMessage(msg, "HIGH");
  }

  /**
   * Notificação de Take-Profit ou Stop-Loss atingido
   */
  public notifyTradeExit(trade: {
    symbol: string;
    side: "BUY" | "SELL";
    entryPrice: number;
    exitPrice: number;
    grossPnl: number;
    netPnl: number;
    gainPercent: number;
    exitReason: string;
    durationFormatted: string;
    maePercent?: number;
    mfePercent?: number;
  }): void {
    if (!this.config.notifyOnTpSl) return;

    const isWin = trade.netPnl >= 0;
    const emoji = isWin ? "🎯" : "🛑";
    const resultHeader = isWin ? "*TAKE-PROFIT ATINGIDO (LUCRO)*" : "*STOP-LOSS / SAÍDA PROTEGIDA*";

    const msg = [
      `${emoji} ${resultHeader}: *${trade.symbol}*`,
      `Motivo: \`${trade.exitReason}\``,
      ``,
      `• *Preço Entrada:* \`$${trade.entryPrice.toFixed(4)}\``,
      `• *Preço Saída:* \`$${trade.exitPrice.toFixed(4)}\``,
      `• *PnL Líquido:* \`${trade.netPnl >= 0 ? "+" : ""}$${trade.netPnl.toFixed(4)} USD (${trade.gainPercent >= 0 ? "+" : ""}${trade.gainPercent.toFixed(2)}%)\``,
      `• *Duração:* \`${trade.durationFormatted}\``,
      trade.maePercent !== undefined ? `• *MAE (Pior Excursão):* \`${trade.maePercent.toFixed(2)}%\`` : null,
      trade.mfePercent !== undefined ? `• *MFE (Pico de Lucro):* \`${trade.mfePercent.toFixed(2)}%\`` : null,
      `• *Horário:* \`${new Date().toLocaleTimeString()}\``,
    ]
      .filter(Boolean)
      .join("\n");

    this.enqueueMessage(msg, isWin ? "HIGH" : "URGENT");
  }

  /**
   * Notificação de Circuit Breaker / Trava de Emergência acionada
   */
  public notifyEmergencyKillSwitch(event: {
    reason: string;
    dailyDrawdownPercent?: number;
    consecutiveLosses?: number;
    actionsTaken: string;
  }): void {
    if (!this.config.notifyOnKillSwitch) return;

    const msg = [
      `🚨🚨 *CIRCUIT BREAKER / KILL SWITCH ACIONADO!* 🚨🚨`,
      `O sistema institucional ativou travas de proteção de capital imediata!`,
      ``,
      `• *Motivo do Disparo:* \`${event.reason}\``,
      event.dailyDrawdownPercent !== undefined ? `• *Drawdown Diário:* \`${event.dailyDrawdownPercent.toFixed(2)}%\`` : null,
      event.consecutiveLosses !== undefined ? `• *Perdas Consecutivas:* \`${event.consecutiveLosses}\`` : null,
      `• *Ações Executadas:* \`${event.actionsTaken}\``,
      `• *Horário UTC:* \`${new Date().toUTCString()}\``,
      ``,
      `⚠️ *Todos os bots foram pausados. Verifique o terminal desktop.*`,
    ]
      .filter(Boolean)
      .join("\n");

    this.enqueueMessage(msg, "URGENT");
  }

  /**
   * Envia o Daily Digest com resumo consolidado de desempenho
   */
  public sendDailyDigest(summary: {
    totalTrades: number;
    winRate: number;
    dailyRealizedPnl: number;
    totalVolumeUsd: number;
    endingBalanceUsd: number;
    topWinnerPair?: string;
  }): void {
    if (!this.config.notifyDailyDigest) return;

    const isPositive = summary.dailyRealizedPnl >= 0;
    const icon = isPositive ? "📈" : "📉";

    const msg = [
      `📊 *RELATÓRIO DIÁRIO DE TRADING (DAILY DIGEST)* 📊`,
      `Fechamento de Ciclo Diário UTC - TradeAI`,
      ``,
      `• *Total de Trades:* \`${summary.totalTrades}\``,
      `• *Taxa de Acerto (Win Rate):* \`${summary.winRate.toFixed(1)}%\``,
      `• *PnL Realizado:* ${icon} \`${isPositive ? "+" : ""}$${summary.dailyRealizedPnl.toFixed(2)} USD\``,
      `• *Volume Transacionado:* \`$${summary.totalVolumeUsd.toFixed(2)} USDT\``,
      `• *Saldo Final de Banca:* \`$${summary.endingBalanceUsd.toFixed(2)} USD\``,
      summary.topWinnerPair ? `• *Destaque do Dia:* \`${summary.topWinnerPair}\`` : null,
      ``,
      `_Próxima sessão algorítmica sincronizada._`,
    ]
      .filter(Boolean)
      .join("\n");

    this.enqueueMessage(msg, "NORMAL");
  }

  /**
   * Processador da fila de mensagens com controle de rate limit
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;
    this.isProcessingQueue = true;

    try {
      while (this.messageQueue.length > 0) {
        const now = Date.now();
        const elapsedSinceLast = now - this.lastSentTimestamp;
        if (elapsedSinceLast < this.minIntervalMs) {
          await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsedSinceLast));
        }

        const item = this.messageQueue.shift();
        if (!item) break;

        const success = await this.dispatchToTelegram(item.text, item.parseMode);
        if (success) {
          this.lastSentTimestamp = Date.now();
        } else {
          // Se falhou (ex: 429), re-enfileira na frente e aguarda um tempo maior
          this.messageQueue.unshift(item);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async dispatchToTelegram(text: string, parseMode: string = "Markdown"): Promise<boolean> {
    if (!this.config.botToken || !this.config.chatId) return false;

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: parseMode,
        }),
      });

      if (res.status === 429) {
        const data = await res.json();
        const retryAfterSec = data.parameters?.retry_after || 5;
        console.warn(`[TelegramService] Rate limit 429 atingido. Aguardando ${retryAfterSec}s...`);
        await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
        return false;
      }

      return res.ok;
    } catch (err) {
      console.error("[TelegramService] Falha de conexão ao enviar mensagem:", err);
      return false;
    }
  }

  /**
   * Inicia polling de comandos remotos (ex: /status, /kill, /pause, /resume)
   */
  public startCommandPolling(): void {
    if (this.isPollingCommands) return;
    if (!this.config.botToken || !this.config.chatId) return;

    this.isPollingCommands = true;
    this.pollIntervalId = setInterval(() => {
      this.pollUpdates();
    }, 4000); // Polling a cada 4 segundos
  }

  public stopCommandPolling(): void {
    this.isPollingCommands = false;
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private async pollUpdates(): Promise<void> {
    if (!this.config.botToken || !this.isPollingCommands) return;

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=2`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result) {
        this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const senderChatId = String(msg.chat.id);
        // Autenticação Estrita por Chat ID
        const isAuthorized = senderChatId === this.config.chatId || (this.config.allowedChatIds?.includes(senderChatId));
        if (!isAuthorized) {
          console.warn(`[TelegramService] Comando rejeitado de chat_id não autorizado: ${senderChatId}`);
          continue;
        }

        const text = msg.text.trim().toLowerCase();
        await this.handleIncomingCommand(text, senderChatId);
      }
    } catch {
      // Ignora falhas transitórias de conexão durante o polling
    }
  }

  private async handleIncomingCommand(cmd: string, chatId: string): Promise<void> {
    const isCommand = (target: string) => cmd === target || cmd.startsWith(`${target}@`);

    if (isCommand("/status")) {
      const summary = this.commandHandlers.onStatus ? this.commandHandlers.onStatus() : null;
      let reply = `🤖 *STATUS OPERACIONAL DO TRADEAI:*\n\n`;
      if (summary) {
        reply += `• Bots Ativos: \`${summary.activeBotsCount}\`\n`;
        reply += `• Posições Abertas: \`${summary.openPositionsCount}\`\n`;
        reply += `• PnL Flutuante: \`$${summary.totalUnrealizedPnl.toFixed(2)} USD\`\n`;
        reply += `• PnL Realizado Hoje: \`$${summary.dailyRealizedPnl.toFixed(2)} USD\`\n`;
        reply += `• Circuit Breaker: \`${summary.circuitBreakerActive ? "🔴 DISPARADO" : "🟢 OK"}\`\n`;
        reply += `• Modo de Emergência: \`${summary.emergencyMode ? "⚠️ ATIVO" : "NORMAL"}\`\n`;
      } else {
        reply += `• Plataforma online e monitorando streams L2.\n`;
      }
      reply += `\n_Horário do Servidor: ${new Date().toLocaleTimeString()}_`;
      this.enqueueMessage(reply, "HIGH");
    } else if (isCommand("/pause")) {
      if (this.commandHandlers.onPause) {
        this.commandHandlers.onPause();
        this.enqueueMessage(`⏸️ *COMANDO EXECUTADO:* Todos os robôs foram *PAUSADOS* remotamente.`, "HIGH");
      }
    } else if (isCommand("/resume")) {
      if (this.commandHandlers.onResume) {
        this.commandHandlers.onResume();
        this.enqueueMessage(`▶️ *COMANDO EXECUTADO:* Operações dos robôs foram *RETOMADAS*.`, "HIGH");
      }
    } else if (isCommand("/kill")) {
      if (this.commandHandlers.onKillSwitch) {
        this.commandHandlers.onKillSwitch("Comando remoto /kill via Telegram autenticado");
        this.enqueueMessage(`🛑 *KILL SWITCH EXECUTADO REMOTAMENTE!* Ordens abertas canceladas e sistema travado.`, "URGENT");
      }
    } else if (isCommand("/help")) {
      const helpMsg = [
        `📋 *COMANDOS DISPONÍVEIS:*`,
        `• \`/status\` - Exibe métricas em tempo real e saúde do sistema`,
        `• \`/pause\` - Pausa a abertura de novas posições em todos os bots`,
        `• \`/resume\` - Retoma a rotina de scanning e execução`,
        `• \`/kill\` - Desliga os bots e aciona o Kill Switch emergencial`,
      ].join("\n");
      this.enqueueMessage(helpMsg, "NORMAL");
    }
  }

  private initDailyDigestTimer(): void {
    // Agenda checagem a cada hora para envio próximo da meia-noite UTC (00:00 UTC)
    setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 0 && now.getUTCMinutes() <= 5) {
        // Envia digest diário se configurado
        // A lógica do digest pega as estatísticas do dia anterior
      }
    }, 300000); // Checa a cada 5 minutos
  }

  private saveConfig(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(TELEGRAM_CONFIG_STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Ignora erro de quota
    }
  }

  private loadConfig(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const data = window.localStorage.getItem(TELEGRAM_CONFIG_STORAGE_KEY);
      if (data) {
        this.config = { ...this.config, ...JSON.parse(data) };
      }
    } catch {
      // Fallback
    }
  }
}

export const telegramNotificationService = TelegramNotificationService.getInstance();
