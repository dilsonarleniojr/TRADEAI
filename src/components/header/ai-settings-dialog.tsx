"use client";

import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Brain,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  List,
  Loader2,
  PlugZap,
  Trash2,
  ChevronDown,
  Sparkles,
  Search,
  Check,
  RefreshCw,
  KeyRound,
} from "lucide-react";
import { AI_PROVIDERS, type AIProviderId, type AIProviderInfo } from "@/lib/ai/providers";

interface ProviderStatus {
  id: AIProviderId;
  configured: boolean;
  keySource: "app" | "env" | null;
  envKey: string | null;
  model: string;
}

interface SettingsData {
  provider: AIProviderId;
  providers: ProviderStatus[];
}

interface TestResult {
  ok: boolean;
  text: string;
  latencyMs?: number;
  model?: string;
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

  // Seletor de Modelo Interativo
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Status de saúde dos motores
  const [healthMap, setHealthMap] = useState<Record<string, TestResult & { checking?: boolean }>>({});

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const info: AIProviderInfo = AI_PROVIDERS.find((p) => p.id === editing) || AI_PROVIDERS[0];
  const current = data?.providers.find((p) => p.id === editing);

  // Troca o provedor em edição e redefine os campos temporários
  const selectProvider = (id: AIProviderId, d: SettingsData | null = data) => {
    setEditing(id);
    const targetModel = d?.providers.find((p) => p.id === id)?.model ?? "";
    const providerInfo = AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
    setModel(targetModel || providerInfo.defaultModel);
    setApiKey("");
    setShowKey(false);
    setModels([]);
    setModelDropdownOpen(false);
    setModelSearch("");
    setTest(healthMap[id] || null);

    // Se já estiver configurado e ainda não checado nesta sessão, testa automaticamente
    const provStatus = d?.providers.find((p) => p.id === id);
    if (provStatus?.configured && !healthMap[id]) {
      checkProviderHealth(id);
    }
  };

  const checkProviderHealth = async (provId: AIProviderId) => {
    setHealthMap((prev) => ({ ...prev, [provId]: { ok: false, text: "Verificando...", checking: true } }));
    try {
      const res = await fetch("/api/ai/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provId }),
      });
      const json = await res.json();
      const resObj: TestResult = json.success
        ? {
            ok: true,
            text: `Conectado com sucesso! Respondeu em ${(json.latencyMs / 1000).toFixed(1)}s.`,
            latencyMs: json.latencyMs,
            model: json.model,
          }
        : {
            ok: false,
            text: json.error || "Falha na conexão com o provedor.",
          };

      setHealthMap((prev) => ({ ...prev, [provId]: resObj }));
      if (provId === editing) {
        setTest(resObj);
      }
    } catch (e: any) {
      const errObj: TestResult = { ok: false, text: e.message || "Erro de rede ao testar provedor." };
      setHealthMap((prev) => ({ ...prev, [provId]: errObj }));
      if (provId === editing) setTest(errObj);
    }
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
        setEditing(d.provider);
        const provInfo = AI_PROVIDERS.find((p) => p.id === d.provider) || AI_PROVIDERS[0];
        const savedModel = d.providers.find((p) => p.id === d.provider)?.model;
        setModel(savedModel || provInfo.defaultModel);
        setApiKey("");
        setModels([]);

        // Testa saúde do motor ativo imediatamente se tiver chave
        const activeProv = d.providers.find((p) => p.id === d.provider);
        if (activeProv?.configured) {
          checkProviderHealth(d.provider);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const put = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.details || json.error || "Falha ao salvar");
    setData(json.data);
    return json.data;
  };

  const handleSave = async () => {
    setBusy("save");
    try {
      await put({ target: editing, model, ...(apiKey.trim() ? { apiKey } : {}) });
      setApiKey("");
      toast({ title: "Configuração salva", description: `${info.name}: modelo ${model || info.defaultModel}.` });
      checkProviderHealth(editing);
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
      toast({ title: "Motor de IA alterado", description: `Todas as análises e robôs agora usam ${info.name}.` });
      checkProviderHealth(editing);
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
      setHealthMap((prev) => {
        const copy = { ...prev };
        delete copy[editing];
        return copy;
      });
      setTest(null);
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
      // Salva antes para testar com o que está na tela
      await put({ target: editing, model, ...(apiKey.trim() ? { apiKey } : {}) });
      setApiKey("");
      await checkProviderHealth(editing);
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
      setModelDropdownOpen(true);
      toast({ title: "Modelos carregados", description: `${json.models.length} modelos disponíveis na sua conta.` });
    } catch (e: any) {
      toast({ title: "Não foi possível listar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // Lista combinada de modelos para o seletor
  const suggested = info.suggestedModels || [info.defaultModel];
  const combinedModels = Array.from(new Set([...suggested, ...models]));
  const filteredModels = combinedModels.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase().trim())
  );

  const isExactMatch = combinedModels.some(
    (m) => m.toLowerCase() === modelSearch.toLowerCase().trim()
  );

  const activeHealth = healthMap[editing] || test;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] bg-card/95 backdrop-blur-xl border border-border/80 text-foreground max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
        {/* Anti-autofill Honeypot */}
        <div className="sr-only" aria-hidden="true" style={{ position: "absolute", opacity: 0, height: 0, width: 0, zIndex: -1 }}>
          <input type="text" name="fake_ai_user" tabIndex={-1} autoComplete="off" />
          <input type="password" name="fake_ai_pass" tabIndex={-1} autoComplete="new-password" />
        </div>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <div className="w-8 h-8 rounded-lg bg-crypto-cyan/15 border border-crypto-cyan/30 flex items-center justify-center text-crypto-cyan">
              <Brain className="w-4 h-4" />
            </div>
            <span>Motor de Inteligência Artificial</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolha qual IA processa sinais, entradas, stops e análises dos robôs. O uso é cobrado na sua própria conta do provedor.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin text-crypto-cyan" /> Carregando configurações de IA...
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* 4 Cards dos Provedores */}
            <div className="grid grid-cols-2 gap-2.5">
              {AI_PROVIDERS.map((p) => {
                const st = data.providers.find((x) => x.id === p.id);
                const isActive = data.provider === p.id;
                const isEditing = editing === p.id;
                const h = healthMap[p.id];

                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    className={cn(
                      "text-left p-3 rounded-xl border transition-all space-y-1.5 cursor-pointer relative overflow-hidden group",
                      isEditing
                        ? "border-crypto-cyan/70 bg-crypto-cyan/10 shadow-[0_0_15px_rgba(6,182,212,0.12)]"
                        : "border-border/50 bg-secondary/20 hover:bg-secondary/40 hover:border-border"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-xs font-bold", isEditing ? "text-crypto-cyan" : "text-foreground")}>
                        {p.name}
                      </span>
                      {isActive && (
                        <Badge className="text-[9px] h-4 px-1.5 bg-crypto-green/20 text-crypto-green border-crypto-green/40 font-bold">
                          ATIVO
                        </Badge>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground">{p.vendor}</div>

                    {/* Status da Chave e Conexão */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {h?.checking ? (
                        <span className="text-[10px] text-crypto-cyan flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Verificando...
                        </span>
                      ) : h?.ok ? (
                        <span className="text-[10px] text-crypto-green font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-crypto-green animate-pulse" />
                          Online
                        </span>
                      ) : h && !h.ok ? (
                        <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          Erro
                        </span>
                      ) : st?.configured ? (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-crypto-green/70" /> Chave salva
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          ⚪ Sem chave
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground/80 font-mono truncate pt-0.5">
                      {st?.model || p.defaultModel}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Painel de Configuração do Provedor Selecionado */}
            <div className="rounded-xl border border-border/60 bg-secondary/15 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">Configurar {info.name}</span>
                  {data.provider === editing && (
                    <Badge variant="outline" className="text-[9px] h-4 border-crypto-cyan/40 text-crypto-cyan bg-crypto-cyan/10">
                      Motor Selecionado Atualmente
                    </Badge>
                  )}
                </div>
                <a
                  href={info.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-crypto-cyan hover:underline flex items-center gap-1 font-medium"
                >
                  Obter chave {info.name} <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Banner de Diagnóstico e Conexão em Tempo Real */}
              <div
                className={cn(
                  "p-3 rounded-lg border text-xs flex items-start gap-2.5 transition-all",
                  activeHealth?.checking
                    ? "bg-crypto-cyan/10 border-crypto-cyan/30 text-crypto-cyan"
                    : activeHealth?.ok
                    ? "bg-crypto-green/10 border-crypto-green/30 text-crypto-green"
                    : activeHealth && !activeHealth.ok
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    : current?.configured
                    ? "bg-secondary/30 border-border/60 text-muted-foreground"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                )}
              >
                {activeHealth?.checking ? (
                  <>
                    <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin text-crypto-cyan" />
                    <div>
                      <span className="font-bold block">Testando conexão com {info.name}...</span>
                      <span className="text-[11px] opacity-90">Validando autenticação e disponibilidade do modelo na API.</span>
                    </div>
                  </>
                ) : activeHealth?.ok ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-crypto-green" />
                    <div className="flex-1">
                      <span className="font-bold block text-crypto-green">Conectado & Operacional</span>
                      <span className="text-[11px] opacity-90">{activeHealth.text}</span>
                    </div>
                  </>
                ) : activeHealth && !activeHealth.ok ? (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <div className="flex-1">
                      <span className="font-bold block text-rose-400">Falha de Conexão com {info.name}</span>
                      <span className="text-[11px] opacity-90">{activeHealth.text}</span>
                    </div>
                  </>
                ) : current?.configured ? (
                  <>
                    <KeyRound className="w-4 h-4 shrink-0 mt-0.5 text-crypto-cyan" />
                    <div className="flex-1">
                      <span className="font-bold block text-foreground">Chave Configurada</span>
                      <span className="text-[11px] text-muted-foreground">
                        Clique em &quot;Testar conexão&quot; para verificar a resposta imediata da API do {info.name}.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-bold block text-amber-400">Motor sem Chave de API</span>
                      <span className="text-[11px] opacity-90">
                        Insira sua Chave de API da {info.vendor} abaixo para habilitar sinais inteligentes e robôs.
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Seletor Interativo de Modelo */}
              <div className="space-y-1.5 relative" ref={dropdownRef}>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-foreground">Modelo de IA</Label>
                  <span className="text-[10px] text-muted-foreground">
                    {models.length > 0 ? `${models.length} modelos listados` : `Padrão: ${info.defaultModel}`}
                  </span>
                </div>

                <div className="flex gap-2">
                  {/* Botão de Trigger do Dropdown */}
                  <button
                    type="button"
                    onClick={() => {
                      setModelDropdownOpen(!modelDropdownOpen);
                      setModelSearch("");
                    }}
                    className="flex-1 h-9 px-3 rounded-md bg-secondary/30 border border-border/70 hover:border-crypto-cyan/50 text-left text-xs font-mono font-medium flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="truncate text-foreground font-semibold">{model || info.defaultModel}</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200", modelDropdownOpen && "rotate-180 text-crypto-cyan")} />
                  </button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleListModels}
                    disabled={busy !== null || (!current?.configured && !apiKey.trim())}
                    className="h-9 text-xs shrink-0 cursor-pointer border-border/70 hover:bg-white/[0.05]"
                    title="Buscar os modelos ativos na sua conta da API"
                  >
                    {busy === "models" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <List className="w-3.5 h-3.5" />}
                    <span className="ml-1.5 hidden sm:inline">Listar da Conta</span>
                  </Button>
                </div>

                {/* Dropdown Menu com Pesquisa e Seleção de Modelos */}
                {modelDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl p-2 space-y-2 animate-in fade-in-0 zoom-in-95">
                    {/* Campo de Busca Rápida */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        name="ai_model_search_no_autofill"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                        placeholder="Pesquisar modelo ou digitar personalização..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="h-8 pl-8 text-xs font-mono bg-secondary/40 border-border/60"
                        autoFocus
                      />
                    </div>

                    {/* Lista com Scroll */}
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                      {/* Sugestões recomendadas e modelos listados */}
                      {filteredModels.map((m) => {
                        const isSelected = model === m || (!model && m === info.defaultModel);
                        const isDefault = m === info.defaultModel;

                        return (
                          <button
                            type="button"
                            key={m}
                            onClick={() => {
                              setModel(m);
                              setModelDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono flex items-center justify-between transition-colors cursor-pointer",
                              isSelected
                                ? "bg-crypto-cyan/15 text-crypto-cyan font-bold"
                                : "hover:bg-white/[0.06] text-foreground"
                            )}
                          >
                            <span className="truncate">{m}</span>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {isDefault && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-white/20 text-muted-foreground">
                                  Padrão
                                </Badge>
                              )}
                              {isSelected && <Check className="w-3.5 h-3.5 text-crypto-cyan" />}
                            </div>
                          </button>
                        );
                      })}

                      {/* Opção para modelo personalizado caso não conste na lista */}
                      {modelSearch.trim() && !isExactMatch && (
                        <button
                          type="button"
                          onClick={() => {
                            setModel(modelSearch.trim());
                            setModelDropdownOpen(false);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-md text-xs font-mono bg-crypto-cyan/10 hover:bg-crypto-cyan/20 text-crypto-cyan flex items-center justify-between transition-colors cursor-pointer border border-crypto-cyan/30"
                        >
                          <span className="truncate">Usar modelo customizado: <strong>{modelSearch.trim()}</strong></span>
                          <Sparkles className="w-3.5 h-3.5 shrink-0 ml-1" />
                        </button>
                      )}

                      {filteredModels.length === 0 && !modelSearch.trim() && (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          Nenhum modelo encontrado. Clique em &quot;Listar da Conta&quot;.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Chave da API */}
              <div className="space-y-1.5">
                <Label htmlFor="ai-api-key-input" className="text-[11px] font-semibold text-foreground">
                  Chave da API ({info.name})
                </Label>
                <div className="relative">
                  <Input
                    id="ai-api-key-input"
                    name="ai_secret_token_no_autofill"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    placeholder={
                      current?.keySource === "app"
                        ? "•••••••• (chave salva no servidor — digite para trocar)"
                        : current?.keySource === "env"
                        ? `Usando ${current.envKey} do ambiente (.env)`
                        : `Cole sua chave da API da ${info.vendor} aqui`
                    }
                    className="h-9 text-xs font-mono pr-9 bg-secondary/30 border-border/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <p className="text-[10px] text-muted-foreground">
                    Criptografada com AES-256 no servidor; o navegador nunca recebe a chave de volta.
                  </p>
                  {current?.keySource === "app" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleClearKey}
                      disabled={busy !== null}
                      className="h-6 px-2 text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> Remover Chave
                    </Button>
                  )}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/40">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleTest}
                  disabled={busy !== null}
                  className="h-8 text-xs cursor-pointer border-border/70 hover:bg-white/[0.05]"
                >
                  {busy === "test" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5 mr-1.5 text-crypto-cyan" />}
                  Testar Conexão
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSave}
                  disabled={busy !== null}
                  className="h-8 text-xs cursor-pointer border-border/70 hover:bg-white/[0.05]"
                >
                  {busy === "save" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Salvar
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleActivate}
                  disabled={busy !== null || data.provider === editing}
                  className={cn(
                    "h-8 text-xs ml-auto font-bold cursor-pointer transition-all",
                    data.provider === editing
                      ? "bg-secondary text-muted-foreground cursor-default border border-border/50"
                      : "bg-crypto-cyan text-black hover:bg-crypto-cyan/90 shadow-sm shadow-crypto-cyan/20"
                  )}
                >
                  {busy === "activate" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  {data.provider === editing ? "✓ Motor Ativo" : `Ativar ${info.name}`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
