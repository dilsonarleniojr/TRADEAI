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
import { Switch } from "@/components/ui/switch";
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
  Layers,
  ShieldCheck,
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
  activeProviders: AIProviderId[];
  multiAiEnabled: boolean;
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

/** Escolha do motor de IA (Claude, OpenAI, Gemini, Qwen), do modelo e da chave de cada um de forma independente. */
export function AiSettingsDialog({ open, onOpenChange }: AiSettingsDialogProps) {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [editing, setEditing] = useState<AIProviderId>("gemini");
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
    } catch (err: any) {
      const failObj: TestResult = { ok: false, text: err.message || "Erro de rede ao testar." };
      setHealthMap((prev) => ({ ...prev, [provId]: failObj }));
      if (provId === editing) {
        setTest(failObj);
      }
    }
  };

  // Carrega configurações ao abrir
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/ai/settings")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.success) return;
        const d: SettingsData = j.data;
        setData(d);
        selectProvider(d.provider, d);
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
      toast({ title: "Configuração salva", description: `${info.name}: chave e modelo ${model || info.defaultModel} salvos de forma independente.` });
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
      toast({ title: "Motor Principal Alterado", description: `Análises e robôs agora usam prioritariamente ${info.name}.` });
      checkProviderHealth(editing);
    } catch (e: any) {
      toast({ title: "Erro ao ativar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleToggleMultiAi = async (enabled: boolean) => {
    try {
      await put({ multiAiEnabled: enabled });
      toast({
        title: enabled ? "Modo Multi-IA Simultâneo Ativado" : "Modo Multi-IA Desativado",
        description: enabled
          ? "As recomendações e análises consultarão os motores marcados simultaneamente."
          : "O sistema usará apenas o motor principal ativo.",
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActiveProvider = async (pId: AIProviderId, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!data) return;
    const currentList = data.activeProviders || [data.provider];
    let nextList: AIProviderId[];
    if (currentList.includes(pId)) {
      if (currentList.length <= 1) {
        toast({
          title: "Aviso",
          description: "Pelo menos um provedor precisa permanecer ativo no pool.",
          variant: "destructive",
        });
        return;
      }
      nextList = currentList.filter((x) => x !== pId);
    } else {
      nextList = [...currentList, pId];
    }
    try {
      await put({ activeProviders: nextList });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
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
      <DialogContent className="sm:max-w-[640px] bg-card/95 backdrop-blur-xl border border-border/80 text-foreground max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
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
            Configure as chaves e modelos de cada IA separadamente. Habilite o modo Multi-IA para consultar motores em paralelo e comparar recomendações.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin text-crypto-cyan" /> Carregando configurações de IA...
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Banner Modo Multi-IA Simultâneo */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-purple-500/10 via-cyan-500/10 to-blue-500/10 border border-purple-500/30 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
                  <Layers className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-2">
                    <span>Modo Multi-IA Simultâneo</span>
                    <Badge variant="outline" className="text-[9px] h-4 border-purple-500/40 text-purple-300 bg-purple-500/15">
                      Paralelo
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Consulta múltiplos motores em paralelo nas sugestões de robôs e permite comparar e escolher qual usar.
                  </p>
                </div>
              </div>
              <Switch
                checked={data.multiAiEnabled}
                onCheckedChange={handleToggleMultiAi}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>

            {/* 4 Cards dos Provedores */}
            <div className="grid grid-cols-2 gap-2.5">
              {AI_PROVIDERS.map((p) => {
                const st = data.providers.find((x) => x.id === p.id);
                const isPrimary = data.provider === p.id;
                const isEditing = editing === p.id;
                const isInMulti = data.activeProviders?.includes(p.id);
                const h = healthMap[p.id];

                return (
                  <div
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
                      <div className="flex items-center gap-1">
                        {isPrimary && (
                          <Badge className="text-[8px] h-4 px-1.5 bg-crypto-green/20 text-crypto-green border-crypto-green/40 font-bold">
                            PRINCIPAL
                          </Badge>
                        )}
                        {data.multiAiEnabled && isInMulti && !isPrimary && (
                          <Badge className="text-[8px] h-4 px-1 bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold">
                            MULTI
                          </Badge>
                        )}
                      </div>
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

                    {/* Modelo & Toggle de Inclusão no Modo Multi */}
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/[0.05]">
                      <div className="text-[9px] text-muted-foreground/80 font-mono truncate max-w-[120px]">
                        {st?.model || p.defaultModel}
                      </div>

                      {data.multiAiEnabled && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleActiveProvider(p.id, e)}
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded font-medium transition-all flex items-center gap-0.5",
                            isInMulti
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30"
                              : "bg-white/[0.04] text-muted-foreground/70 border border-white/[0.08] hover:bg-white/[0.08]"
                          )}
                          title="Ativar/desativar este motor nas consultas simultâneas"
                        >
                          <Check className={cn("w-2.5 h-2.5", isInMulti ? "opacity-100" : "opacity-30")} />
                          {isInMulti ? "Simultâneo" : "Inativo"}
                        </button>
                      )}
                    </div>
                  </div>
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
                      Motor Principal
                    </Badge>
                  )}
                  {data.multiAiEnabled && data.activeProviders?.includes(editing) && (
                    <Badge variant="outline" className="text-[9px] h-4 border-purple-500/40 text-purple-300 bg-purple-500/10">
                      Ativo no Multi-IA
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

              {/* Informação sobre independência de chaves */}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-white/[0.03] p-2 rounded-lg border border-white/[0.06]">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Armazenamento Independente:</strong> As chaves são salvas separadamente para cada IA. Você pode configurar chaves distintas para o Claude, Gemini, OpenAI e Qwen sem que uma substitua a outra.
                </span>
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
                      <span className="font-bold block">Nenhuma Chave Configurada</span>
                      <span className="text-[11px] opacity-90">
                        Insira sua chave de API abaixo para habilitar o {info.name}.
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Seletor Interativo e Pesquisável de Modelos */}
              <div className="space-y-1.5 relative" ref={dropdownRef}>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-crypto-cyan" />
                    Modelo de IA para {info.name}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleListModels}
                    disabled={busy !== null}
                    className="h-6 px-2 text-[10px] text-crypto-cyan hover:bg-crypto-cyan/10 cursor-pointer"
                  >
                    {busy === "models" ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <List className="w-3 h-3 mr-1" />
                    )}
                    Buscar Modelos na Minha Conta
                  </Button>
                </div>

                {/* Botão Gatilho do Dropdown Customizado */}
                <div
                  onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                  className="w-full h-9 px-3 py-1.5 rounded-md border border-border/80 bg-background/80 hover:bg-secondary/30 flex items-center justify-between cursor-pointer transition-all focus-within:ring-2 focus-within:ring-crypto-cyan/50"
                >
                  <span className="text-xs font-mono font-bold text-crypto-cyan truncate">
                    {model || info.defaultModel}
                  </span>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200", modelDropdownOpen ? "rotate-180" : "")} />
                </div>

                {/* Dropdown Menu com Busca */}
                {modelDropdownOpen && (
                  <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 rounded-lg border border-border/80 bg-[#0d1424] shadow-2xl p-2 space-y-2 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Buscar modelo ou digitar nome personalizado..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="h-8 pl-8 pr-2 text-xs bg-white/[0.04] border-white/[0.1] text-foreground font-mono"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
                      {filteredModels.length > 0 ? (
                        filteredModels.map((m) => {
                          const isCurrent = (model || info.defaultModel) === m;
                          const isDefault = pDefaultModelCheck(info, m);

                          return (
                            <button
                              type="button"
                              key={m}
                              onClick={() => {
                                setModel(m);
                                setModelDropdownOpen(false);
                                setModelSearch("");
                              }}
                              className={cn(
                                "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono flex items-center justify-between transition-colors cursor-pointer",
                                isCurrent
                                  ? "bg-crypto-cyan/20 text-crypto-cyan font-bold"
                                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
                              )}
                            >
                              <span className="truncate">{m}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isDefault && (
                                  <span className="text-[9px] px-1 rounded bg-secondary/80 text-muted-foreground">
                                    Padrão
                                  </span>
                                )}
                                {isCurrent && <Check className="w-3.5 h-3.5 text-crypto-cyan" />}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-2 text-center text-xs text-muted-foreground">
                          Nenhum modelo predefinido com esse nome.
                        </div>
                      )}

                      {/* Opção para usar texto livre se não encontrar exatamente */}
                      {modelSearch.trim() && !isExactMatch && (
                        <button
                          type="button"
                          onClick={() => {
                            setModel(modelSearch.trim());
                            setModelDropdownOpen(false);
                            setModelSearch("");
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono text-crypto-cyan hover:bg-crypto-cyan/10 flex items-center gap-1.5 border border-dashed border-crypto-cyan/40 mt-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span>Usar modelo personalizado: <strong>&quot;{modelSearch.trim()}&quot;</strong></span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Campo da Chave de API — Totalmente Isolado */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-key-input" className="text-xs font-semibold text-foreground">
                    Chave de API do {info.name}
                  </Label>
                  {current?.keySource === "env" && (
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                      Carregada via .env ({current.envKey})
                    </Badge>
                  )}
                  {current?.keySource === "app" && (
                    <Badge variant="outline" className="text-[9px] border-crypto-green/40 text-crypto-green bg-crypto-green/10">
                      Gravada individualmente para {info.name}
                    </Badge>
                  )}
                </div>

                <div className="relative">
                  <Input
                    id="ai-key-input"
                    name={`provider_key_${info.id}`}
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      current?.configured
                        ? "••••••••••••••••••••••••  (Chave salva no servidor. Digite aqui para substituir)"
                        : `Cole sua chave ${info.name} aqui`
                    }
                    className="pr-10 text-xs font-mono bg-background/80 border-border/80"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                    title={showKey ? "Ocultar" : "Mostrar"}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>A chave nunca é enviada ao navegador após ser salva.</span>
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
                  {data.provider === editing ? "✓ Motor Principal Ativo" : `Tornar ${info.name} Principal`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function pDefaultModelCheck(info: AIProviderInfo, m: string): boolean {
  return m === info.defaultModel;
}
