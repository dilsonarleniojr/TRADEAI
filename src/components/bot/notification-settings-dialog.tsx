"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  Send,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  ShieldCheck,
} from "lucide-react";
import {
  getStoredNotificationSettings,
  saveNotificationSettings,
} from "@/lib/notifications/notification-service";
import type { NotificationSettings } from "@/lib/notifications/notification-types";

interface NotificationSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSettingsDialog({
  open,
  onOpenChange,
}: NotificationSettingsDialogProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>(getStoredNotificationSettings());
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [isTestingDiscord, setIsTestingDiscord] = useState(false);

  useEffect(() => {
    if (open) {
      setSettings(getStoredNotificationSettings());
    }
  }, [open]);

  const handleSave = () => {
    saveNotificationSettings(settings);
    toast({
      title: "Configurações Salvas",
      description: "Suas preferências de notificações foram atualizadas.",
    });
    onOpenChange(false);
  };

  const handleTestTelegram = async () => {
    if (!settings.telegram.botToken || !settings.telegram.chatId) {
      toast({
        title: "Campos Incompletos",
        description: "Informe o Bot Token e o Chat ID do Telegram antes de testar.",
        variant: "destructive",
      });
      return;
    }

    setIsTestingTelegram(true);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "telegram",
          botToken: settings.telegram.botToken,
          chatId: settings.telegram.chatId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Telegram Conectado! 🎉",
          description: data.message,
        });
      } else {
        throw new Error(data.error || "Falha ao enviar mensagem ao Telegram.");
      }
    } catch (err: any) {
      toast({
        title: "Erro no Teste do Telegram",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleTestDiscord = async () => {
    if (!settings.discord.webhookUrl) {
      toast({
        title: "Webhook Ausente",
        description: "Informe a URL do Webhook do Discord antes de testar.",
        variant: "destructive",
      });
      return;
    }

    setIsTestingDiscord(true);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "discord",
          webhookUrl: settings.discord.webhookUrl,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Discord Conectado! 🚀",
          description: data.message,
        });
      } else {
        throw new Error(data.error || "Falha ao enviar mensagem ao Discord.");
      }
    } catch (err: any) {
      toast({
        title: "Erro no Teste do Discord",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsTestingDiscord(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-[#0a0f1d]/95 backdrop-blur-xl border border-white/[0.1] text-foreground p-6 shadow-2xl">
        <DialogHeader className="border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                Alertas & Notificações em Tempo Real
                <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-[10px]">
                  24/7 Monitor
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Receba mensagens instantâneas no Telegram ou Discord sobre trades, lucros, stops e circuit breakers.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-3 text-sm">
          {/* Seção 1: Telegram */}
          <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.07] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    Telegram Bot
                    {settings.telegram.enabled && settings.telegram.botToken && (
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px] py-0 border-emerald-500/30">
                        Ativo
                      </Badge>
                    )}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Envio para seu chat privado ou canal via Bot Father.
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.telegram.enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    telegram: { ...prev.telegram, enabled: checked },
                  }))
                }
              />
            </div>

            {settings.telegram.enabled && (
              <div className="space-y-3 pt-2 border-t border-white/[0.05]">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Bot Token</Label>
                  <Input
                    type="password"
                    placeholder="ex: 7123456789:AAHk..."
                    value={settings.telegram.botToken}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        telegram: { ...prev.telegram, botToken: e.target.value },
                      }))
                    }
                    className="h-8 text-xs font-mono bg-black/40 border-white/[0.1]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Obtido ao criar um bot no Telegram com o @BotFather.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Chat ID</Label>
                  <Input
                    placeholder="ex: 123456789 ou -100123456789"
                    value={settings.telegram.chatId}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        telegram: { ...prev.telegram, chatId: e.target.value },
                      }))
                    }
                    className="h-8 text-xs font-mono bg-black/40 border-white/[0.1]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Seu ID de usuário ou do canal (obtenha via @userinfobot).
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestTelegram}
                  disabled={isTestingTelegram}
                  className="h-7 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                >
                  <Radio className="w-3 h-3 mr-1.5 animate-pulse" />
                  {isTestingTelegram ? "Enviando teste..." : "Enviar Mensagem de Teste"}
                </Button>
              </div>
            )}
          </div>

          {/* Seção 2: Discord */}
          <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.07] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    Discord Webhook
                    {settings.discord.enabled && settings.discord.webhookUrl && (
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px] py-0 border-emerald-500/30">
                        Ativo
                      </Badge>
                    )}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Embeds ricos com cores de PnL direto no seu servidor.
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.discord.enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    discord: { ...prev.discord, enabled: checked },
                  }))
                }
              />
            </div>

            {settings.discord.enabled && (
              <div className="space-y-3 pt-2 border-t border-white/[0.05]">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Webhook URL</Label>
                  <Input
                    type="password"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={settings.discord.webhookUrl}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        discord: { ...prev.discord, webhookUrl: e.target.value },
                      }))
                    }
                    className="h-8 text-xs font-mono bg-black/40 border-white/[0.1]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Criado nas configurações do canal do Discord &gt; Integrações &gt; Webhooks.
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestDiscord}
                  disabled={isTestingDiscord}
                  className="h-7 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
                >
                  <Radio className="w-3 h-3 mr-1.5 animate-pulse" />
                  {isTestingDiscord ? "Enviando teste..." : "Enviar Mensagem de Teste"}
                </Button>
              </div>
            )}
          </div>

          {/* Seção 3: Filtros de Eventos */}
          <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.07] space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Eventos a Notificar</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/[0.04]">
                <span>Entradas de Trade</span>
                <Switch
                  checked={settings.filters.tradeEntries}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, tradeEntries: checked },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/[0.04]">
                <span>Saídas e Stops (PnL)</span>
                <Switch
                  checked={settings.filters.tradeExits}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, tradeExits: checked },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/[0.04]">
                <span>Rotações da Frota</span>
                <Switch
                  checked={settings.filters.fleetRotations}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, fleetRotations: checked },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/[0.04]">
                <span>Circuit Breakers</span>
                <Switch
                  checked={settings.filters.circuitBreakers}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, circuitBreakers: checked },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-3 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            As credenciais ficam guardadas localmente de forma segura.
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-white/[0.1] hover:bg-white/[0.05]"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Salvar Configurações
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
