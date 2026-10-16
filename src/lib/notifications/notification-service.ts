import type {
  NotificationPayload,
  NotificationSettings,
  NotificationEventType,
} from "./notification-types";

export const NOTIFICATION_STORAGE_KEY = "tradeai_notifications_config_v1";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  telegram: {
    enabled: false,
    botToken: "",
    chatId: "",
  },
  discord: {
    enabled: false,
    webhookUrl: "",
  },
  filters: {
    tradeEntries: true,
    tradeExits: true,
    fleetRotations: true,
    circuitBreakers: true,
  },
};

/**
 * Lê as configurações salvas no navegador.
 */
export function getStoredNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      telegram: {
        enabled: Boolean(parsed.telegram?.enabled),
        botToken: (parsed.telegram?.botToken || "").trim(),
        chatId: (parsed.telegram?.chatId || "").trim(),
      },
      discord: {
        enabled: Boolean(parsed.discord?.enabled),
        webhookUrl: (parsed.discord?.webhookUrl || "").trim(),
      },
      filters: {
        tradeEntries: parsed.filters?.tradeEntries !== false,
        tradeExits: parsed.filters?.tradeExits !== false,
        fleetRotations: parsed.filters?.fleetRotations !== false,
        circuitBreakers: parsed.filters?.circuitBreakers !== false,
      },
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * Salva as configurações de notificação.
 */
export function saveNotificationSettings(settings: NotificationSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("[NotificationService] Erro ao salvar configurações:", err);
  }
}

/**
 * Verifica se um evento deve ser notificado segundo os filtros configurados.
 */
function shouldNotifyEvent(type: NotificationEventType, filters: NotificationSettings["filters"]): boolean {
  switch (type) {
    case "TRADE_ENTRY":
      return filters.tradeEntries;
    case "TRADE_EXIT":
      return filters.tradeExits;
    case "FLEET_ROTATION":
      return filters.fleetRotations;
    case "CIRCUIT_BREAKER_TRIPPED":
    case "CIRCUIT_BREAKER_RESET":
      return filters.circuitBreakers;
    case "SYSTEM_TEST":
      return true;
    default:
      return true;
  }
}

/**
 * Formata mensagem para o Telegram (HTML).
 */
export function formatTelegramMessage(payload: NotificationPayload): string {
  const modeTag = payload.mode === "live" ? "🔴 <b>LIVE (Real)</b>" : "🧪 <b>SIMULADO (Paper)</b>";
  const dateStr = new Date(payload.timestamp || Date.now()).toLocaleTimeString("pt-BR");

  let body = `<b>TradeAI</b> | ${modeTag} - <i>${dateStr}</i>\n\n`;

  if (payload.type === "TRADE_ENTRY") {
    body += `⚡ <b>NOVA ENTRADA DE TRADE</b>\n`;
    body += `• <b>Robô:</b> ${payload.botName || "Bot"}\n`;
    body += `• <b>Par:</b> ${payload.symbol}\n`;
    body += `• <b>Lado:</b> ${payload.side === "BUY" ? "🟢 COMPRA (LONG)" : "🔴 VENDA"}\n`;
    if (payload.price) body += `• <b>Preço:</b> $${payload.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}\n`;
    if (payload.quantity) body += `• <b>Qtd:</b> ${payload.quantity}\n`;
    if (payload.strategy) body += `• <b>Estratégia:</b> ${payload.strategy}\n`;
  } else if (payload.type === "TRADE_EXIT") {
    const isProfit = (payload.pnlUsdt ?? 0) >= 0;
    const pnlIcon = isProfit ? "💰" : "🛡️";
    body += `${pnlIcon} <b>POSIÇÃO ENCERRADA</b>\n`;
    body += `• <b>Robô:</b> ${payload.botName || "Bot"}\n`;
    body += `• <b>Par:</b> ${payload.symbol}\n`;
    body += `• <b>Resultado:</b> ${isProfit ? "🟢 Lucro" : "🔴 Prejuízo"}\n`;
    if (payload.pnlUsdt !== undefined) {
      body += `• <b>PnL USDT:</b> ${isProfit ? "+" : ""}$${payload.pnlUsdt.toFixed(2)} USDT\n`;
    }
    if (payload.pnlPercent !== undefined) {
      body += `• <b>Retorno:</b> ${payload.pnlPercent >= 0 ? "+" : ""}${payload.pnlPercent.toFixed(2)}%\n`;
    }
    if (payload.reason) body += `• <b>Motivo:</b> ${payload.reason}\n`;
  } else if (payload.type === "FLEET_ROTATION") {
    body += `🔄 <b>ROTAÇÃO DA FROTA EXECUTADA</b>\n`;
    body += `• <b>Robô:</b> ${payload.botName || "Bot"}\n`;
    body += `• <b>Par Atualizado:</b> ${payload.symbol}\n`;
    if (payload.reason) body += `• <b>Detalhes:</b> ${payload.reason}\n`;
  } else if (payload.type.startsWith("CIRCUIT_BREAKER")) {
    const isTripped = payload.type === "CIRCUIT_BREAKER_TRIPPED";
    body += `${isTripped ? "🚨" : "✅"} <b>CIRCUIT BREAKER: ${isTripped ? "DISPARADO" : "DESTRAVADO"}</b>\n`;
    body += `• <b>Aviso:</b> ${payload.message}\n`;
    if (payload.reason) body += `• <b>Motivo:</b> ${payload.reason}\n`;
  } else {
    body += `ℹ️ <b>${payload.title}</b>\n${payload.message}\n`;
  }

  return body;
}

/**
 * Formata payload de Embed para Discord.
 */
export function formatDiscordEmbed(payload: NotificationPayload) {
  let color = 0x06b6d4; // Cyan padrão
  if (payload.type === "TRADE_ENTRY") {
    color = 0x10b981; // Verde
  } else if (payload.type === "TRADE_EXIT") {
    color = (payload.pnlUsdt ?? 0) >= 0 ? 0x10b981 : 0xef4444; // Verde ou Vermelho
  } else if (payload.type === "FLEET_ROTATION") {
    color = 0x8b5cf6; // Roxo
  } else if (payload.type === "CIRCUIT_BREAKER_TRIPPED") {
    color = 0xf59e0b; // Laranja
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (payload.symbol) fields.push({ name: "Par", value: payload.symbol, inline: true });
  if (payload.botName) fields.push({ name: "Robô", value: payload.botName, inline: true });
  if (payload.strategy) fields.push({ name: "Estratégia", value: payload.strategy, inline: true });

  if (payload.price !== undefined) {
    fields.push({ name: "Preço", value: `$${payload.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, inline: true });
  }

  if (payload.pnlUsdt !== undefined) {
    const sign = payload.pnlUsdt >= 0 ? "+" : "";
    fields.push({ name: "PnL USDT", value: `${sign}$${payload.pnlUsdt.toFixed(2)}`, inline: true });
  }

  if (payload.pnlPercent !== undefined) {
    const sign = payload.pnlPercent >= 0 ? "+" : "";
    fields.push({ name: "Retorno %", value: `${sign}${payload.pnlPercent.toFixed(2)}%`, inline: true });
  }

  if (payload.reason) {
    fields.push({ name: "Motivo / Gatilho", value: payload.reason, inline: false });
  }

  return {
    username: "TradeAI Institutional Bot",
    avatar_url: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png",
    embeds: [
      {
        title: payload.title,
        description: payload.message,
        color,
        fields,
        footer: {
          text: `TradeAI · Modo: ${payload.mode?.toUpperCase() || "PAPER"} · ${new Date().toLocaleTimeString("pt-BR")}`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Despacha a notificação assincronamente sem travar o motor.
 */
export async function dispatchNotification(payload: NotificationPayload) {
  if (typeof window === "undefined") return;

  const settings = getStoredNotificationSettings();
  if (!settings.telegram.enabled && !settings.discord.enabled) {
    return;
  }

  if (!shouldNotifyEvent(payload.type, settings.filters)) {
    return;
  }

  // Despacha via API interna sem esperar retorno no fluxo de trading
  fetch("/api/notifications/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload,
      settings,
    }),
  }).catch((err) => {
    console.warn("[NotificationService] Falha no despacho assíncrono:", err.message);
  });
}
