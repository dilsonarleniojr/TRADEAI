import { NextResponse } from "next/server";
import { formatTelegramMessage, formatDiscordEmbed } from "@/lib/notifications/notification-service";
import type { NotificationPayload } from "@/lib/notifications/notification-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { target, botToken, chatId, webhookUrl } = body;

    const testPayload: NotificationPayload = {
      type: "SYSTEM_TEST",
      title: "✅ Teste de Conexão TradeAI",
      message: "Seu canal de notificações foi configurado com sucesso! Você receberá alertas de trades e risco em tempo real.",
      symbol: "BTCUSDT",
      price: 67850.50,
      mode: "paper",
      timestamp: Date.now(),
    };

    if (target === "telegram") {
      if (!botToken || !chatId) {
        return NextResponse.json({ success: false, error: "Bot Token e Chat ID são obrigatórios." }, { status: 400 });
      }
      const text = formatTelegramMessage(testPayload);
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return NextResponse.json({ success: false, error: data.description || `Erro HTTP ${res.status} no Telegram` }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: "Mensagem de teste enviada ao Telegram com sucesso!" });
    }

    if (target === "discord") {
      if (!webhookUrl) {
        return NextResponse.json({ success: false, error: "Webhook URL do Discord é obrigatória." }, { status: 400 });
      }
      const discordPayload = formatDiscordEmbed(testPayload);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: `Erro HTTP ${res.status} no Discord Webhook` }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: "Mensagem de teste enviada ao Discord com sucesso!" });
    }

    return NextResponse.json({ success: false, error: "Alvo inválido ('telegram' ou 'discord')" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
