"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Brain, CheckCircle2, ExternalLink, Loader2, Eye, EyeOff, PlugZap, Trash2, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/ai/providers";
import { cn } from "@/lib/utils";

interface ProviderState {
  id: AIProviderId;
  model: string;
  configured: boolean;
  keySource: "app" | "env" | null;
  envKey: string | null;
}

interface SettingsData {
  provider: AIProviderId;
  providers: ProviderState[];
}

interface TestResult {
  ok: boolean;
  text: string;
}

interface AiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Escolha do motor de IA (Claude, OpenAI, Gemini, Qwen), do modelo e da chave de cada um. */
export function AiSettingsDialog({ open, onOpenChange }: AiSettingsDialogProps) {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [editing, setEditing] = useState<AIProviderId>("claude");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "test" | "models" | "activate" | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);

  // Troca o provedor em edição e redefine os campos temporários com o que está salvo.
  const selectProvider = (id: AIProviderId, d: SettingsData | null = data) => {
    setEditing(id);
    setModel(d?.providers.find((p) => p.id === id)?.model ?? "");
    setApiKey("");
    setShowKey(false);
    setModels([]);
    setTest(null);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/ai/settings")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.success) return;
        const d = json.data as SettingsData;
        setData(d);
        // mesma redefinição de selectProvider, sem depender do estado anterior
        setEditing(d.provider);
        setModel(d.providers.find((p) => p.id === d.provider)?.model ?? "");
        setApiKey("");
        setModels([]);
        setTest(null);
      })
      .catch(() => {
        // sem dados: o diálogo continua mostrando "Carregando..."
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const current = data?.providers.find((p) => p.id === editing);
  const info = AI_PROVIDERS.find((p) => p.id === editing)!;

  const put = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.details || json.error || "Falha ao salvar");
    setData(json.data);
  };

  const handleSave = async () => {
    setBusy("save");
    try {
      await put({ target: editing, model, ...(apiKey.trim() ? { apiKey } : {}) });
      setApiKey("");
      toast({ title: "Configuração salva", description: `${info.name}: modelo ${model || info.defaultModel}.` });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleActivate = async () => {
    setBusy("activate");
    try {
      await put({ provider: editing, target: editing, model, ...(apiKey.trim() ? { apiKey } : {}) });
      setApiKey("");
      toast({ title: "Motor de IA alterado", description: `Todas as análises agora usam ${info.name}.` });
    } catch (e: any) {
      toast({ title: "Erro ao ativar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleClearKey = async () => {
    setBusy("save");
    try {
      await put({ target: editing, clearKey: true });
      toast({ title: "Chave removida", description: `A chave salva do ${info.name} foi apagada do servidor.` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    setTest(null);
    try {
      // Salva antes para testar exatamente o que está na tela.
      await put({ target: editing, model, ...(apiKey.trim() ? { apiKey } : {}) });
      setApiKey("");
      const res = await fetch("/api/ai/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: editing }),
      });
      const json = await res.json();
      setTest(
        json.success
          ? { ok: true, text: `Conectado: ${json.model} respondeu em ${(json.latencyMs / 1000).toFixed(1)}s.` }
          : { ok: false, text: json.error || "Falha no teste." }
      );
    } catch (e: any) {
      setTest({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const handleListModels = async () => {
    setBusy("models");
    try {
      if (apiKey.trim()) {
        await put({ target: editing, apiKey });
        setApiKey("");
      }
      const res = await fetch(`/api/ai/models?provider=${editing}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setModels(json.models);
      toast({ title: "Modelos carregados", description: `${json.models.length} modelos disponíveis na sua conta.` });
    } catch (e: any) {
      toast({ title: "Não foi possível listar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-card/95 backdrop-blur-xl border border-border/80 text-foreground max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Brain className="w-5 h-5 text-crypto-cyan" />
            Motor de IA
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolha qual IA faz o chat, os sinais, as entradas, o SL/TP e o autopreenchimento dos robôs. O uso é cobrado na
            conta do provedor escolhido.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Provedores */}
            <div className="grid grid-cols-2 gap-2">
              {AI_PROVIDERS.map((p) => {
                const st = data.providers.find((x) => x.id === p.id);
                const isActive = data.provider === p.id;
                const isEditing = editing === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all space-y-1",
                      isEditing ? "border-crypto-cyan/60 bg-crypto-cyan/10" : "border-border/40 bg-secondary/20 hover:bg-secondary/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm font-bold", isEditing && "text-crypto-cyan")}>{p.name}</span>
                      {isActive && (
                        <Badge className="text-[9px] h-4 px-1.5 bg-crypto-green/15 text-crypto-green border-crypto-green/30">ATIVO</Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{p.vendor}</div>
                    <div className="text-[10px] flex items-center gap-1">
                      {st?.configured ? (
                        <span className="text-crypto-green flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> chave {st.keySource === "env" ? "no ambiente" : "salva"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">sem chave</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">{st?.model}</div>
                  </button>
                );
              })}
            </div>

            {/* Configuração do provedor selecionado */}
            <div className="rounded-xl border border-border/40 bg-secondary/15 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Configurar {info.name}</span>
                <a
                  href={info.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-crypto-cyan hover:underline flex items-center gap-1"
                >
                  Criar chave <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Modelo</Label>
                <div className="flex gap-2">
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={info.defaultModel}
                    list={`ai-models-${editing}`}
                    className="h-8 text-xs font-mono"
                  />
                  <datalist id={`ai-models-${editing}`}>
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleListModels}
                    disabled={busy !== null || (!current?.configured && !apiKey.trim())}
                    className="h-8 text-xs shrink-0"
                    title="Buscar os modelos disponíveis na sua conta"
                  >
                    {busy === "models" ? <Loader2 className="w-3 h-3 animate-spin" /> : <List className="w-3 h-3" />}
                    <span className="ml-1">Listar</span>
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {models.length > 0
                    ? `${models.length} modelos encontrados: clique no campo para escolher.`
                    : `Padrão: ${info.defaultModel}. Use "Listar" para ver os modelos da sua conta.`}
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Chave da API</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                    placeholder={
                      current?.keySource === "app"
                        ? "•••••••• (chave salva — digite para trocar)"
                        : current?.keySource === "env"
                          ? `Usando ${current.envKey} do ambiente (digite para sobrescrever)`
                          : "Cole a chave aqui"
                    }
                    className="h-8 text-xs font-mono pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Guardada cifrada no servidor; o navegador nunca recebe a chave de volta.
                  </p>
                  {current?.keySource === "app" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleClearKey}
                      disabled={busy !== null}
                      className="h-6 px-2 text-[10px] text-crypto-red hover:bg-crypto-red/10"
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> Remover
                    </Button>
                  )}
                </div>
              </div>

              {test && (
                <div
                  className={cn(
                    "text-[11px] rounded-md p-2 border",
                    test.ok
                      ? "bg-crypto-green/5 border-crypto-green/25 text-crypto-green"
                      : "bg-crypto-red/5 border-crypto-red/25 text-crypto-red"
                  )}
                >
                  {test.text}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button type="button" size="sm" variant="outline" onClick={handleTest} disabled={busy !== null} className="h-8 text-xs">
                  {busy === "test" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PlugZap className="w-3 h-3 mr-1" />}
                  Testar conexão
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={busy !== null} className="h-8 text-xs">
                  {busy === "save" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Salvar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleActivate}
                  disabled={busy !== null || data.provider === editing}
                  className="h-8 text-xs ml-auto bg-crypto-cyan text-black hover:bg-crypto-cyan/80 font-bold"
                >
                  {busy === "activate" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  {data.provider === editing ? "Motor ativo" : `Usar ${info.name}`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
