"use client";

import { useState, useEffect } from "react";
import { useCryptoStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { disconnectBinanceSession } from "@/lib/binance-client";
import { disconnectOkxSession } from "@/lib/okx/okx-client";
import { useShallow } from "zustand/react/shallow";

interface ApiSettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function ApiSettingsDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: ApiSettingsDialogProps) {
  const {
    selectedExchange,
    setSelectedExchange,
    binanceConnected,
    binanceTestnet,
    setBinanceConnected,
    setBinanceTestnet,
    okxConnected,
    okxSimulated,
    setOkxConnected,
    setOkxSimulated,
    setTradingMode,
    setAccount,
  } = useCryptoStore(
    useShallow((s) => ({
      selectedExchange: s.selectedExchange,
      setSelectedExchange: s.setSelectedExchange,
      binanceConnected: s.binanceConnected,
      binanceTestnet: s.binanceTestnet,
      setBinanceConnected: s.setBinanceConnected,
      setBinanceTestnet: s.setBinanceTestnet,
      okxConnected: s.okxConnected,
      okxSimulated: s.okxSimulated,
      setOkxConnected: s.setOkxConnected,
      setOkxSimulated: s.setOkxSimulated,
      setTradingMode: s.setTradingMode,
      setAccount: s.setAccount,
    }))
  );

  const { toast } = useToast();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  // Binance state
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [testnet, setTestnet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // OKX state
  const [okxKey, setOkxKey] = useState("");
  const [okxSecret, setOkxSecret] = useState("");
  const [okxPassphrase, setOkxPassphrase] = useState("");
  const [simulatedOkx, setSimulatedOkx] = useState(false);
  const [showOkxSecret, setShowOkxSecret] = useState(false);
  const [showOkxPassphrase, setShowOkxPassphrase] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [riskAck, setRiskAck] = useState(false);

  const isAiModelName = (val: string) => {
    if (!val) return false;
    const lower = val.toLowerCase().trim();
    return (
      lower.startsWith("claude") ||
      lower.startsWith("gpt-") ||
      lower.startsWith("gemini") ||
      lower.startsWith("qwen") ||
      lower.includes("opus") ||
      lower.includes("sonnet") ||
      lower.includes("haiku")
    );
  };

  useEffect(() => {
    if (open) {
      setApiKey("");
      setApiSecret("");
      setShowSecret(false);
      setTestnet(binanceTestnet);

      setOkxKey("");
      setOkxSecret("");
      setOkxPassphrase("");
      setShowOkxSecret(false);
      setShowOkxPassphrase(false);
      setSimulatedOkx(okxSimulated);

      setRiskAck(false);

      const t1 = setTimeout(() => {
        setApiKey((prev) => (isAiModelName(prev) ? "" : prev));
        setOkxKey((prev) => (isAiModelName(prev) ? "" : prev));
      }, 50);
      const t2 = setTimeout(() => {
        setApiKey((prev) => (isAiModelName(prev) ? "" : prev));
        setOkxKey((prev) => (isAiModelName(prev) ? "" : prev));
      }, 250);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [open, binanceTestnet, okxSimulated]);

  const handleSaveBinance = async () => {
    const cleanKey = apiKey.trim();
    const cleanSecret = apiSecret.trim();

    if (!testnet && !riskAck) {
      toast({
        title: "Confirmação necessária",
        description: "Confirme que entende o risco do modo real antes de conectar.",
        variant: "destructive",
      });
      return;
    }

    if (!cleanKey || !cleanSecret) {
      toast({
        title: "Campos Obrigatórios",
        description: "Preencha a Chave de API e o Segredo de API da Binance.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/binance/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: cleanKey,
          apiSecret: cleanSecret,
          testnet,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setBinanceConnected(true);
        setBinanceTestnet(testnet);
        setSelectedExchange("binance");
        setTradingMode("live");

        try {
          const accRes = await fetch("/api/account?mode=live&exchange=binance");
          if (accRes.ok) {
            const accData = await accRes.json();
            if (accData.success && accData.data) {
              setAccount(accData.data);
            }
          }
        } catch (e) {
          console.warn("Failed to sync Binance account immediately:", e);
        }

        toast({
          title: "🎉 Conectado à Binance com Sucesso!",
          description: `Chaves validadas em modo ${testnet ? "Testnet (Sandbox)" : "Produção Spot Real"}. Saldo atualizado.`,
        });

        setApiKey("");
        setApiSecret("");
        setOpen(false);
      } else {
        toast({
          title: "Falha na Autenticação Binance",
          description: data.error || "Chave ou Segredo inválidos. Verifique as permissões na Binance.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de Conexão",
        description: err.message || "Não foi possível validar com o servidor.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOkx = async () => {
    const cleanKey = okxKey.trim();
    const cleanSecret = okxSecret.trim();
    const cleanPassphrase = okxPassphrase.trim();

    if (!simulatedOkx && !riskAck) {
      toast({
        title: "Confirmação necessária",
        description: "Confirme que entende o risco do modo real antes de conectar à OKX.",
        variant: "destructive",
      });
      return;
    }

    if (!cleanKey || !cleanSecret || !cleanPassphrase) {
      toast({
        title: "Campos Obrigatórios (OKX)",
        description: "Preencha API Key, Secret Key e Passphrase da sua conta OKX.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/okx/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: cleanKey,
          apiSecret: cleanSecret,
          passphrase: cleanPassphrase,
          simulated: simulatedOkx,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setOkxConnected(true);
        setOkxSimulated(simulatedOkx);
        setSelectedExchange("okx");
        setTradingMode("live");

        try {
          const accRes = await fetch("/api/account?mode=live&exchange=okx");
          if (accRes.ok) {
            const accData = await accRes.json();
            if (accData.success && accData.data) {
              setAccount(accData.data);
            }
          }
        } catch (e) {
          console.warn("Failed to sync OKX account immediately:", e);
        }

        toast({
          title: "🎉 Conectado à OKX com Sucesso!",
          description: `Login realizado em modo ${simulatedOkx ? "Demo Trading (x-simulated: 1)" : "Produção Real (V5 Unified)"}.`,
        });

        setOkxKey("");
        setOkxSecret("");
        setOkxPassphrase("");
        setOpen(false);
      } else {
        toast({
          title: "Falha na Autenticação OKX",
          description: data.error || "API Key, Secret Key ou Passphrase inválidas na OKX.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de Conexão",
        description: err.message || "Não foi possível comunicar com o servidor da OKX.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectBinance = async () => {
    await disconnectBinanceSession();
    setBinanceConnected(false);
    setApiKey("");
    setApiSecret("");
    if (!okxConnected) {
      setTradingMode("paper");
      localStorage.removeItem("trading_mode");
    }

    toast({
      title: "Binance Desconectada",
      description: "As chaves da Binance foram removidas da sessão.",
    });

    setOpen(false);
  };

  const handleDisconnectOkx = async () => {
    await disconnectOkxSession();
    setOkxConnected(false);
    setOkxKey("");
    setOkxSecret("");
    setOkxPassphrase("");
    if (!binanceConnected) {
      setTradingMode("paper");
      localStorage.removeItem("trading_mode");
    }

    toast({
      title: "OKX Desconectada",
      description: "As chaves da OKX foram removidas da sessão.",
    });

    setOpen(false);
  };

  const isOkxTab = selectedExchange === "okx";
  const currentConnected = isOkxTab ? okxConnected : binanceConnected;
  const requiresRiskAck = isOkxTab ? !simulatedOkx : !testnet;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 px-2.5 text-xs font-semibold cursor-pointer transition-all duration-200 shadow-sm",
              currentConnected
                ? "bg-crypto-green/10 border-crypto-green/30 text-crypto-green hover:bg-crypto-green/20"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            )}
            title="Configurar Chaves da API (Binance / OKX)"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              API {isOkxTab ? "OKX" : "Binance"}
            </span>
            {currentConnected ? (
              <span className="flex items-center gap-1 text-[9px] bg-crypto-green/20 text-crypto-green px-1.5 py-0.2 rounded-full font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-crypto-green animate-pulse" />
                Ativa
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 font-bold">Configurar</span>
            )}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[540px] w-[calc(100vw-1.5rem)] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-card/95 backdrop-blur-xl border border-border/80 text-foreground shadow-2xl">
        <DialogHeader className="p-5 sm:p-6 pb-4 shrink-0 pr-16 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <div className="w-8 h-8 rounded-lg bg-crypto-cyan/15 border border-crypto-cyan/30 flex items-center justify-center text-crypto-cyan shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <span>
              Conexão de Exchange ({isOkxTab ? "OKX V5 Unified" : "Binance Spot"})
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolha a corretora ativa e insira suas chaves de API. Elas são criptografadas com AES-256-GCM e guardadas apenas em cookie HTTP-Only no servidor.
          </DialogDescription>

          {/* Seletor de Corretora (Binance | OKX) */}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <button
              type="button"
              onClick={() => {
                setSelectedExchange("binance");
                setRiskAck(false);
              }}
              className={cn(
                "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                !isOkxTab
                  ? "bg-[#0E1B2C] text-white border-[#0E1B2C] dark:bg-white dark:text-[#0E1B2C] shadow-xs"
                  : "bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground"
              )}
            >
              <span>Binance Spot</span>
              {binanceConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedExchange("okx");
                setRiskAck(false);
              }}
              className={cn(
                "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                isOkxTab
                  ? "bg-[#0E1B2C] text-white border-[#0E1B2C] dark:bg-white dark:text-[#0E1B2C] shadow-xs"
                  : "bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground"
              )}
            >
              <span>OKX (V5 Unified)</span>
              {okxConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              )}
            </button>
          </div>
        </DialogHeader>

        <div className="p-5 sm:p-6 overflow-y-auto pro-scrollbar flex-1 min-h-0 space-y-4">
          {/* Honeypot hidden fields to trap browser password managers */}
          <div
            className="sr-only"
            aria-hidden="true"
            style={{ position: "absolute", opacity: 0, height: 0, width: 0, zIndex: -1 }}
          >
            <input type="text" name="fake_username_trap" tabIndex={-1} autoComplete="off" />
            <input type="password" name="fake_password_trap" tabIndex={-1} autoComplete="new-password" />
          </div>

          {!isOkxTab ? (
            <>
              {/* Status Alert Banner - BINANCE */}
              <div
                className={cn(
                  "p-3 rounded-lg border text-xs flex items-start gap-2.5 transition-colors",
                  binanceConnected
                    ? "bg-crypto-green/10 border-crypto-green/30 text-crypto-green"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                )}
              >
                {binanceConnected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Conexão Ativa com a Binance</span>
                      <span className="text-[11px] opacity-90">
                        Ambiente: {binanceTestnet ? "Testnet Sandbox" : "Produção Oficial Spot (api.binance.com)"}.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-bold text-amber-400 block">Binance Desconectada (Modo Simulado)</span>
                      <span className="text-[11px] text-muted-foreground">
                        Insira sua API Key e Secret para desbloquear a execução real com a Binance.
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-3.5 py-1">
                {/* Binance API Key */}
                <div className="space-y-1.5">
                  <Label htmlFor="binance-api-key" className="text-xs font-semibold flex items-center justify-between">
                    <span>Chave de API (API Key)</span>
                    <a
                      href="https://www.binance.com/pt-BR/my/settings/api-management"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-crypto-cyan hover:underline flex items-center gap-1"
                    >
                      Gerenciar na Binance <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </Label>
                  <Input
                    id="binance-api-key"
                    name="binance_auth_api_key_no_autofill"
                    type="text"
                    placeholder="Cole sua API Key da Binance"
                    value={apiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isAiModelName(val)) {
                        setApiKey("");
                        return;
                      }
                      setApiKey(val);
                    }}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    className="h-9 text-xs font-mono bg-secondary/30 border-border/60"
                  />
                </div>

                {/* Binance API Secret */}
                <div className="space-y-1.5">
                  <Label htmlFor="binance-api-secret" className="text-xs font-semibold">
                    Segredo da API (API Secret)
                  </Label>
                  <div className="relative">
                    <Input
                      id="binance-api-secret"
                      name="binance_auth_api_secret_no_autofill"
                      type={showSecret ? "text" : "password"}
                      placeholder="Cole seu API Secret da Binance"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      className="h-9 text-xs font-mono bg-secondary/30 border-border/60 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title={showSecret ? "Ocultar segredo" : "Mostrar segredo"}
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Binance Environment Switch */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20 border border-border/40">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold cursor-pointer">Usar Binance Testnet (Sandbox)</Label>
                    <p className="text-[10px] text-muted-foreground">
                      {testnet
                        ? "Modo de testes ativado (testnet.binance.vision)"
                        : "Modo Produção Oficial Spot ativado (dinheiro real)"}
                    </p>
                  </div>
                  <Switch checked={testnet} onCheckedChange={setTestnet} />
                </div>

                {!testnet && (
                  <label
                    htmlFor="binance-risk-ack"
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-crypto-red/10 border border-crypto-red/30 text-[11px] text-foreground/90 leading-relaxed cursor-pointer"
                  >
                    <Checkbox
                      id="binance-risk-ack"
                      checked={riskAck}
                      onCheckedChange={(v) => setRiskAck(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Entendo que, em modo real, ordens e bots usam dinheiro verdadeiro na Binance e posso perder capital.
                    </span>
                  </label>
                )}

                <div className="p-2.5 rounded-lg bg-secondary/15 border border-border/30 text-[11px] space-y-1 text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-crypto-cyan" />
                    <span>Dicas de Segurança Binance:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>Marque a permissão: <strong className="text-foreground">&quot;Enable Spot &amp; Margin Trading&quot;</strong></li>
                    <li>Mantenha desmarcado: <strong className="text-crypto-red">&quot;Enable Withdrawals&quot;</strong> (nunca ative saque)</li>
                    <li>Restrição de IP recomendada: adicione o IP deste servidor caso tenha ativado restrição.</li>
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Status Alert Banner - OKX */}
              <div
                className={cn(
                  "p-3 rounded-lg border text-xs flex items-start gap-2.5 transition-colors",
                  okxConnected
                    ? "bg-crypto-green/10 border-crypto-green/30 text-crypto-green"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                )}
              >
                {okxConnected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Conexão Ativa com a OKX (V5 Unified)</span>
                      <span className="text-[11px] opacity-90">
                        Ambiente: {okxSimulated ? "Demo Trading (x-simulated-trading: 1)" : "Produção Oficial Spot Cash (www.okx.com)"}.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-bold text-amber-400 block">OKX Desconectada</span>
                      <span className="text-[11px] text-muted-foreground">
                        Insira sua API Key, Secret Key e Passphrase da OKX V5 para operar na conta Real ou Demo.
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-3.5 py-1">
                {/* OKX API Key */}
                <div className="space-y-1.5">
                  <Label htmlFor="okx-api-key" className="text-xs font-semibold flex items-center justify-between">
                    <span>Chave de API (OK-ACCESS-KEY)</span>
                    <a
                      href="https://www.okx.com/account/my-api"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-crypto-cyan hover:underline flex items-center gap-1"
                    >
                      Gerenciar na OKX <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </Label>
                  <Input
                    id="okx-api-key"
                    name="okx_auth_api_key_no_autofill"
                    type="text"
                    placeholder="Ex: a1b2c3d4-e5f6-..."
                    value={okxKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isAiModelName(val)) {
                        setOkxKey("");
                        return;
                      }
                      setOkxKey(val);
                    }}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    className="h-9 text-xs font-mono bg-secondary/30 border-border/60"
                  />
                </div>

                {/* OKX API Secret */}
                <div className="space-y-1.5">
                  <Label htmlFor="okx-api-secret" className="text-xs font-semibold">
                    Segredo da API (Secret Key)
                  </Label>
                  <div className="relative">
                    <Input
                      id="okx-api-secret"
                      name="okx_auth_api_secret_no_autofill"
                      type={showOkxSecret ? "text" : "password"}
                      placeholder="Cole seu Secret Key da OKX"
                      value={okxSecret}
                      onChange={(e) => setOkxSecret(e.target.value)}
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      className="h-9 text-xs font-mono bg-secondary/30 border-border/60 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOkxSecret(!showOkxSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title={showOkxSecret ? "Ocultar segredo" : "Mostrar segredo"}
                    >
                      {showOkxSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* OKX Passphrase */}
                <div className="space-y-1.5">
                  <Label htmlFor="okx-api-passphrase" className="text-xs font-semibold">
                    Passphrase (OK-ACCESS-PASSPHRASE)
                  </Label>
                  <div className="relative">
                    <Input
                      id="okx-api-passphrase"
                      name="okx_auth_passphrase_no_autofill"
                      type={showOkxPassphrase ? "text" : "password"}
                      placeholder="Senha criada ao gerar a API Key na OKX"
                      value={okxPassphrase}
                      onChange={(e) => setOkxPassphrase(e.target.value)}
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      className="h-9 text-xs font-mono bg-secondary/30 border-border/60 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOkxPassphrase(!showOkxPassphrase)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title={showOkxPassphrase ? "Ocultar passphrase" : "Mostrar passphrase"}
                    >
                      {showOkxPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* OKX Environment Switch */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20 border border-border/40">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold cursor-pointer">
                      Modo Simulado OKX (Demo Trading)
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {simulatedOkx
                        ? "Opera com saldo Demo da OKX (cabeçalho x-simulated-trading: 1)"
                        : "Modo Produção Real V5 Unified ativado (dinheiro real)"}
                    </p>
                  </div>
                  <Switch checked={simulatedOkx} onCheckedChange={setSimulatedOkx} />
                </div>

                {!simulatedOkx && (
                  <label
                    htmlFor="okx-risk-ack"
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-crypto-red/10 border border-crypto-red/30 text-[11px] text-foreground/90 leading-relaxed cursor-pointer"
                  >
                    <Checkbox
                      id="okx-risk-ack"
                      checked={riskAck}
                      onCheckedChange={(v) => setRiskAck(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Entendo que, em modo real, ordens e bots usam dinheiro verdadeiro na OKX e posso perder capital.
                    </span>
                  </label>
                )}

                <div className="p-2.5 rounded-lg bg-secondary/15 border border-border/30 text-[11px] space-y-1 text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-crypto-cyan" />
                    <span>Dicas de Segurança OKX V5:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>Marque a permissão: <strong className="text-foreground">&quot;Read&quot;</strong> e <strong className="text-foreground">&quot;Trade&quot;</strong></li>
                    <li>Mantenha desmarcado: <strong className="text-crypto-red">&quot;Withdraw&quot;</strong> (nunca habilite saque)</li>
                    <li>Para Demo Trading, gere a chave dentro do ambiente Demo da OKX.</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 p-4 sm:p-5 pt-3 shrink-0 border-t border-border/40 bg-card/60">
          {currentConnected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={isOkxTab ? handleDisconnectOkx : handleDisconnectBinance}
              className="text-xs text-crypto-red hover:text-crypto-red hover:bg-crypto-red/10 border-crypto-red/30 gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Desconectar {isOkxTab ? "OKX" : "Binance"}</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isLoading || (requiresRiskAck && !riskAck)}
              onClick={isOkxTab ? handleSaveOkx : handleSaveBinance}
              className="text-xs bg-gradient-to-r from-crypto-cyan to-crypto-green text-black font-bold hover:opacity-90 gap-1.5 cursor-pointer shadow-md"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Validando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Salvar &amp; Conectar {isOkxTab ? "OKX" : "Binance"}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
