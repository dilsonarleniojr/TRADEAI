import { NextResponse } from "next/server";
import { formatTelegramMessage, formatDiscordEmbed } from "@/lib/notifications/notification-service";
import type { NotificationPayload, NotificationSettings } from "@/lib/notifications/notification-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload: NotificationPayload = body.payload;
    const settings: NotificationSettings = body.settings;

    if (!payload) {
      return NextResponse.json({ error: "Payload ausente" }, { status: 400 });
    }

    const promises: Promise<any>[] = [];

    // 1. Envio para Telegram
    const tgToken = settings?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = settings?.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;
    const tgEnabled = settings?.telegram?.enabled ?? Boolean(tgToken && tgChatId);

    if (tgEnabled && tgToken && tgChatId) {
      const text = formatTelegramMessage(payload);
      const url = `https://api.telegram.org/bot${tgToken}/sendMessage`;
      promises.push(
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgChatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        }).then(async (res) => {
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            console.warn("[NotificationDispatch] Telegram erro:", errJson);
          }
        })
      );
    }

    // 2. Envio para Discord Webhook
    const dcUrl = settings?.discord?.webhookUrl || process.env.DISCORD_WEBHOOK_URL;
    const dcEnabled = settings?.discord?.enabled ?? Boolean(dcUrl);

    if (dcEnabled && dcUrl) {
      const discordPayload = formatDiscordEmbed(payload);
      promises.push(
        fetch(dcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discordPayload),
        }).then(async (res) => {
          if (!res.ok) {
            console.warn("[NotificationDispatch] Discord webhook erro:", res.status);
          }
        })
      );
    }

    await Promise.allSettled(promises);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[NotificationDispatch] Falha geral:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
