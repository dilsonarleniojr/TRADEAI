"use client";

import { disconnectBinanceSession } from "@/lib/binance-client";
import { useCryptoStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Zap, Loader2, Plug } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useShallow } from "zustand/react/shallow";

/** Conexão com a corretora. As regras de cada robô ficam na engrenagem do cartão dele. */
export function BinanceConnection() {
  const { binanceConnected, binanceTestnet, setBinanceConnected, setBinanceTestnet } = useCryptoStore(
    useShallow((s) => ({
      binanceConnected: s.binanceConnected,
      binanceTestnet: s.binanceTestnet,
      setBinanceConnected: s.setBinanceConnected,
      setBinanceTestnet: s.setBinanceTestnet,
    }))
  );
  const { toast } = useToast();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [localKey, setLocalKey] = useState("");
  const [localSecret, setLocalSecret] = useState("");

  const handleBinanceLogin = async () => {
    if (!localKey || !localSecret) {
      toast({
        title: "Campos Obrigatórios",
        description: "Por favor, insira a Chave API e o Segredo API.",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/binance/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: localKey,
          apiSecret: localSecret,
          testnet: binanceTestnet,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBinanceConnected(true);
        setBinanceTestnet(binanceTestnet);
        
        // Segredo só no servidor: limpa os campos locais
        setLocalKey("");
        setLocalSecret("");

        // Auto-switch to live mode and sync balance
        const state = useCryptoStore.getState();
        state.setTradingMode("live");
        try {
          const accRes = await fetch("/api/account?mode=live");
          if (accRes.ok) {
            const accResult = await accRes.json();
            if (accResult.success && accResult.data) {
              state.setAccount(accResult.data);
            }
          }
        } catch (e) {
          console.error("Failed to auto-sync account after login:", e);
        }

        toast({
          title: "🎉 Conectado à Binance!",
          description: `Login realizado com sucesso em modo ${binanceTestnet ? "Testnet" : "Produção"}.`,
        });
      } else {
        toast({
          title: "Falha na Autenticação",
          description: data.error || "Chaves inválidas ou erro de rede.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro de Conexão",
        description: "Não foi possível comunicar com o servidor de validação.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBinanceDisconnect = async () => {
    await disconnectBinanceSession();
    setBinanceConnected(false);
    setLocalKey("");
    setLocalSecret("");
    
    toast({
      title: "Desconectado",
      description: "Suas chaves API foram removidas do servidor.",
    });
  };

  return (
    <Card className="bg-card border-border gradient-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Plug className="w-4 h-4 text-crypto-cyan" />
          Conexão Binance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Alert className="border-crypto-red/30 bg-crypto-red/5">
            <AlertTriangle className="w-4 h-4 text-crypto-red" />
            <AlertTitle className="text-crypto-red text-xs font-medium">
              Aviso de Risco - Trading Real
            </AlertTitle>
            <AlertDescription className="text-[10px] text-crypto-red/80">
              O modo real executa ordens na corretora. Certifique-se de que suas chaves têm apenas permissão de TRADE e LEITURA, nunca de SAQUE.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-crypto-cyan flex items-center gap-1.5 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-crypto-cyan" /> Autenticação Binance
            </Label>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
              binanceConnected 
                ? "bg-crypto-green/20 text-crypto-green" 
                : "bg-secondary text-muted-foreground"
            }`}>
              {binanceConnected ? "CONECTADO" : "DESCONECTADO"}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 bg-secondary/10 px-2 rounded border border-border/40">
            <Label className="text-[10px] text-muted-foreground cursor-pointer" htmlFor="binance-testnet-switch">Usar Testnet (Sandbox)</Label>
            <Switch
              id="binance-testnet-switch"
              checked={binanceTestnet}
              onCheckedChange={(checked) => {
                setBinanceTestnet(checked);
              }}
              disabled={binanceConnected}
              className="h-4 w-7 data-[state=checked]:bg-crypto-cyan"
            />
          </div>

          {!binanceConnected ? (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Chave API (API Key)</Label>
                <Input
                  type="password"
                  placeholder="Chave Pública da API"
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Segredo API (Secret Key)</Label>
                <Input
                  type="password"
                  placeholder="Chave Secreta da API"
                  value={localSecret}
                  onChange={(e) => setLocalSecret(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <Button
                type="button"
                onClick={handleBinanceLogin}
                disabled={isLoggingIn}
                className="w-full h-8 text-xs bg-crypto-cyan text-black hover:bg-crypto-cyan/80 font-bold flex items-center justify-center gap-1.5"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Autenticando na Binance...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    Conectar Conta
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] bg-crypto-green/5 border border-crypto-green/20 text-crypto-green p-2 rounded-lg leading-relaxed">
                ✓ Conectado com sucesso em modo <strong>{binanceTestnet ? "Testnet (Simulado)" : "Produção (Spot)"}</strong>. Suas chaves estão criptografadas e guardadas apenas no servidor.
              </div>
              <Button
                type="button"
                onClick={handleBinanceDisconnect}
                variant="destructive"
                className="w-full h-8 text-xs font-bold"
              >
                Desconectar API
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
