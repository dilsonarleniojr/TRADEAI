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
import { Badge } from "@/components/ui/badge";
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
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { disconnectBinanceSession } from "@/lib/binance-client";
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
    binanceConnected,
    binanceTestnet,
    setBinanceConnected,
    setBinanceTestnet,
    setTradingMode,
    setAccount,
  } = useCryptoStore(
  useShallow((s) => ({ binanceConnected: s.binanceConnected, binanceTestnet: s.binanceTestnet, setBinanceConnected: s.setBinanceConnected, setBinanceTestnet: s.setBinanceTestnet, setTradingMode: s.setTradingMode, setAccount: s.setAccount }))
);

  const { toast } = useToast();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [testnet, setTestnet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [riskAck, setRiskAck] = useState(false);

  // Ao abrir: campos sempre vazios (o segredo nunca volta do servidor) e ambiente vindo do estado da sessão
  useEffect(() => {
    if (open) {
      setApiKey("");
      setApiSecret("");
      setShowSecret(false);
      setTestnet(binanceTestnet);
      setRiskAck(false);
    }
  }, [open, binanceTestnet]);

  const handleSaveAndConnect = async () => {
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
      // 1. Validate credentials with Binance
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
        // 2. A sessão (chaves criptografadas) já foi gravada no servidor; aqui só o estado de UI
        setBinanceConnected(true);
        setBinanceTestnet(testnet);
        setTradingMode("live");

        // 3. Fetch real account balance immediately
        try {
          const accRes = await fetch("/api/account?mode=live");
          if (accRes.ok) {
            const accData = await accRes.json();
            if (accData.success && accData.data) {
              setAccount(accData.data);
            }
          }
        } catch (e) {
          console.warn("Failed to sync account immediately:", e);
        }

        toast({
          title: "🎉 Conectado à Binance com Sucesso!",
          description: `Chaves validadas em modo ${testnet ? "Testnet (Sandbox)" : "Produção Spot Real"}. Saldo atualizado.`,
        });

        // As chaves agora vivem só no servidor: limpa o que ficou na memória do componente
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

  const handleDisconnect = async () => {
    await disconnectBinanceSession();
    setBinanceConnected(false);
    setApiKey("");
    setApiSecret("");
    setTradingMode("paper");

    localStorage.removeItem("trading_mode");

    toast({
      title: "Chaves Removidas",
      description: "A plataforma retornou ao modo Simulado seguro.",
    });

    setOpen(false);
  };

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
              binanceConnected
                ? "bg-crypto-green/10 border-crypto-green/30 text-crypto-green hover:bg-crypto-green/20"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            )}
            title="Configurar Chaves da API Binance"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">API Binance</span>
            {binanceConnected ? (
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

      <DialogContent className="sm:max-w-[500px] bg-card/95 backdrop-blur-xl border border-border/80 text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <div className="w-8 h-8 rounded-lg bg-crypto-cyan/15 border border-crypto-cyan/30 flex items-center justify-center text-crypto-cyan">
              <KeyRound className="w-4 h-4" />
            </div>
            <span>Configurações da API Binance</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Insira suas chaves para habilitar ordens reais e sincronização de saldo. Elas são criptografadas e guardadas apenas no servidor; o navegador não as armazena nem as lê de volta.
          </DialogDescription>
        </DialogHeader>

        {/* Status Alert Banner */}
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
                <span className="font-bold text-amber-400 block">Modo Simulado Ativo</span>
                <span className="text-[11px] text-muted-foreground">
                  Insira sua API Key e Secret para desbloquear a execução real com a Binance.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Inputs */}
        <div className="space-y-3.5 py-1">
          {/* API Key */}
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
              type="text"
              placeholder="Cole sua API Key da Binance"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-9 text-xs font-mono bg-secondary/30 border-border/60"
            />
          </div>

          {/* API Secret */}
          <div className="space-y-1.5">
            <Label htmlFor="binance-api-secret" className="text-xs font-semibold">
              Segredo da API (API Secret)
            </Label>
            <div className="relative">
              <Input
                id="binance-api-secret"
                type={showSecret ? "text" : "password"}
                placeholder="Cole seu API Secret da Binance"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
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

          {/* Environment Switch */}
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

          {/* Real-money risk acknowledgement */}
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
                Entendo que, em modo real, ordens e bots usam dinheiro verdadeiro e posso perder capital.
              </span>
            </label>
          )}

          {/* Security Checklist Notice */}
          <div className="p-2.5 rounded-lg bg-secondary/15 border border-border/30 text-[11px] space-y-1 text-muted-foreground">
            <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-crypto-cyan" />
              <span>Dicas de Segurança Binance:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>Marque a permissão: <strong className="text-foreground">"Enable Spot & Margin Trading"</strong></li>
              <li>Mantenha desmarcado: <strong className="text-crypto-red">"Enable Withdrawals"</strong> (nunca ative saque)</li>
              <li>Restrição de IP recomendada: adicione o IP deste servidor caso tenha ativado restrição.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-2 border-t border-border/40">
          {binanceConnected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              className="text-xs text-crypto-red hover:text-crypto-red hover:bg-crypto-red/10 border-crypto-red/30 gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Desconectar</span>
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
              disabled={isLoading || (!testnet && !riskAck)}
              onClick={handleSaveAndConnect}
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
                  <span>Salvar & Conectar</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
