"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCryptoStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { disconnectBinanceSession } from "@/lib/binance-client";
import { disconnectOkxSession } from "@/lib/okx/okx-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Zap, Loader2, Plug, CheckCircle2 } from "lucide-react";

export function ExchangeConnection() {
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
    }))
  );
  const { toast } = useToast();

  // Binance form state
  const [isLoggingInBinance, setIsLoggingInBinance] = useState(false);
  const [binanceKey, setBinanceKey] = useState("");
  const [binanceSecret, setBinanceSecret] = useState("");

  // OKX form state
  const [isLoggingInOkx, setIsLoggingInOkx] = useState(false);
  const [okxKey, setOkxKey] = useState("");
  const [okxSecret, setOkxSecret] = useState("");
  const [okxPassphrase, setOkxPassphrase] = useState("");

  const handleBinanceLogin = async () => {
    if (!binanceKey || !binanceSecret) {
      toast({
        title: "Campos Obrigatórios",
        description: "Por favor, insira a Chave API e o Segredo API da Binance.",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingInBinance(true);
    try {
      const res = await fetch("/api/binance/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: binanceKey,
          apiSecret: binanceSecret,
          testnet: binanceTestnet,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBinanceConnected(true);
        setBinanceTestnet(binanceTestnet);
        setSelectedExchange("binance");
        setBinanceKey("");
        setBinanceSecret("");

        const state = useCryptoStore.getState();
        state.setTradingMode("live");
        try {
          const accRes = await fetch("/api/account?mode=live&exchange=binance");
          if (accRes.ok) {
            const accResult = await accRes.json();
            if (accResult.success && accResult.data) {
              state.setAccount(accResult.data);
            }
          }
        } catch (e) {
          console.error("Failed to sync account after Binance login:", e);
        }

        toast({
          title: "🎉 Conectado à Binance!",
          description: `Login realizado em modo ${binanceTestnet ? "Testnet" : "Produção"}.`,
        });
      } else {
        toast({
          title: "Falha na Autenticação (Binance)",
          description: data.error || "Chaves inválidas ou erro de rede.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erro de Conexão",
        description: "Não foi possível comunicar com o servidor da Binance.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingInBinance(false);
    }
  };

  const handleBinanceDisconnect = async () => {
    try {
      await disconnectBinanceSession();
      setBinanceConnected(false);
      const state = useCryptoStore.getState();
      state.setTradingMode("paper");
      state.setAccount({
        cashBalance: 10000,
        assetQuantity: 0,
        symbol: "BTCUSDT",
      });
      toast({
        title: "Binance Desconectada",
        description: "Sessão encerrada com sucesso. Modo simulado reativado.",
      });
    } catch {
      toast({
        title: "Erro",
        description: "Falha ao desconectar da Binance.",
        variant: "destructive",
      });
    }
  };

  const handleOkxLogin = async () => {
    if (!okxKey || !okxSecret || !okxPassphrase) {
      toast({
        title: "Campos Obrigatórios",
        description: "Por favor, insira API Key, Secret Key e Passphrase da OKX.",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingInOkx(true);
    try {
      const res = await fetch("/api/okx/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: okxKey,
          apiSecret: okxSecret,
          passphrase: okxPassphrase,
          simulated: okxSimulated,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOkxConnected(true);
        setOkxSimulated(okxSimulated);
        setSelectedExchange("okx");
        setOkxKey("");
        setOkxSecret("");
        setOkxPassphrase("");

        const state = useCryptoStore.getState();
        state.setTradingMode("live");
        try {
          const accRes = await fetch("/api/account?mode=live&exchange=okx");
          if (accRes.ok) {
            const accResult = await accRes.json();
            if (accResult.success && accResult.data) {
              state.setAccount(accResult.data);
            }
          }
        } catch (e) {
          console.error("Failed to sync account after OKX login:", e);
        }

        toast({
          title: "🎉 Conectado à OKX!",
          description: `Login realizado em modo ${okxSimulated ? "Demo (Simulado)" : "Produção Real (V5 Unified)"}.`,
        });
      } else {
        toast({
          title: "Falha na Autenticação (OKX)",
          description: data.error || "Chaves inválidas ou Passphrase incorreta.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erro de Conexão",
        description: "Não foi possível comunicar com o servidor da OKX.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingInOkx(false);
    }
  };

  const handleOkxDisconnect = async () => {
    try {
      await disconnectOkxSession();
      setOkxConnected(false);
      const state = useCryptoStore.getState();
      state.setTradingMode("paper");
      state.setAccount({
        cashBalance: 10000,
        assetQuantity: 0,
        symbol: "BTCUSDT",
      });
      toast({
        title: "OKX Desconectada",
        description: "Sessão da OKX encerrada com sucesso.",
      });
    } catch {
      toast({
        title: "Erro",
        description: "Falha ao desconectar da OKX.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border border-border/80 bg-card/60 backdrop-blur-md shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Plug className="w-4 h-4 text-crypto-cyan" />
            <span>Conexão de Exchange & Investimento</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Exchange ativa:</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20 uppercase">
              {selectedExchange}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <Tabs
          value={selectedExchange}
          onValueChange={(val) => setSelectedExchange(val as "binance" | "okx")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 bg-secondary/50 p-1">
            <TabsTrigger value="binance" className="flex items-center gap-2 text-xs">
              <span className="font-semibold">Binance</span>
              {binanceConnected && (
                <span className="w-2 h-2 rounded-full bg-crypto-green inline-block animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="okx" className="flex items-center gap-2 text-xs">
              <span className="font-semibold">OKX</span>
              {okxConnected && (
                <span className="w-2 h-2 rounded-full bg-crypto-green inline-block animate-pulse" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB BINANCE */}
          <TabsContent value="binance" className="space-y-4 pt-3">
            {binanceConnected ? (
              <div className="rounded-xl border border-crypto-green/30 bg-crypto-green/5 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-crypto-green/10 flex items-center justify-center text-crypto-green">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Binance Conectada</p>
                    <p className="text-xs text-muted-foreground">
                      Modo: <span className="font-mono text-crypto-green">{binanceTestnet ? "Testnet Spot" : "Conta Real Spot"}</span>
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBinanceDisconnect}
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 cursor-pointer text-xs"
                >
                  Desconectar Binance
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Chave API (Binance)</Label>
                    <Input
                      type="password"
                      placeholder="Ex: vmPU... (Spot Trading)"
                      value={binanceKey}
                      onChange={(e) => setBinanceKey(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Segredo API (Secret Key)</Label>
                    <Input
                      type="password"
                      placeholder="Ex: s5h1..."
                      value={binanceSecret}
                      onChange={(e) => setBinanceSecret(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/50 p-2.5 bg-secondary/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Modo Testnet (Binance)</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Utilizar endpoint de testes testnet.binance.vision
                    </p>
                  </div>
                  <Switch
                    checked={binanceTestnet}
                    onCheckedChange={setBinanceTestnet}
                  />
                </div>

                <Button
                  onClick={handleBinanceLogin}
                  disabled={isLoggingInBinance}
                  className="w-full bg-crypto-green hover:bg-crypto-green/90 text-white font-semibold text-xs h-9 cursor-pointer"
                >
                  {isLoggingInBinance ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Validando credenciais...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 mr-2" />
                      Conectar Conta Binance
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* TAB OKX */}
          <TabsContent value="okx" className="space-y-4 pt-3">
            {okxConnected ? (
              <div className="rounded-xl border border-crypto-green/30 bg-crypto-green/5 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-crypto-green/10 flex items-center justify-center text-crypto-green">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">OKX Conectada (V5 Unified)</p>
                    <p className="text-xs text-muted-foreground">
                      Modo: <span className="font-mono text-crypto-green">{okxSimulated ? "Demo Trading (x-simulated: 1)" : "Conta Real Spot Cash"}</span>
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOkxDisconnect}
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 cursor-pointer text-xs"
                >
                  Desconectar OKX
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Chave API (OK-ACCESS-KEY)</Label>
                    <Input
                      type="password"
                      placeholder="Ex: a1b2c3d4-..."
                      value={okxKey}
                      onChange={(e) => setOkxKey(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Segredo (Secret Key)</Label>
                    <Input
                      type="password"
                      placeholder="Ex: 8F7E6D..."
                      value={okxSecret}
                      onChange={(e) => setOkxSecret(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Passphrase (Senha da API)</Label>
                    <Input
                      type="password"
                      placeholder="Sua senha da chave OKX"
                      value={okxPassphrase}
                      onChange={(e) => setOkxPassphrase(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/50 p-2.5 bg-secondary/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Modo Simulado OKX (Demo Trading)</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Opera com saldo simulado institucional (cabeçalho x-simulated-trading: 1)
                    </p>
                  </div>
                  <Switch
                    checked={okxSimulated}
                    onCheckedChange={setOkxSimulated}
                  />
                </div>

                <Button
                  onClick={handleOkxLogin}
                  disabled={isLoggingInOkx}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 cursor-pointer"
                >
                  {isLoggingInOkx ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Validando com OKX V5...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 mr-2" />
                      Conectar Conta OKX
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Alert className="bg-secondary/30 border-border/50 text-[11px] text-muted-foreground py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5" />
          <AlertTitle className="text-xs font-semibold text-foreground">Segurança Institucional</AlertTitle>
          <AlertDescription>
            Suas credenciais são transmitidas exclusivamente via HTTPS criptografado com AES-256-GCM em cookies HTTP-Only seguros e nunca são salvas no armazenamento local do navegador.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

