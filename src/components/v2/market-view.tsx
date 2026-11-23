"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useCryptoStore } from "@/lib/store";
import { useDataProvider } from "@/lib/data-provider";
import { AppSwitch } from "./atoms";
import { formatCurrency, formatPercent, formatPrice } from "@/lib/format";
import { validateQuickTradeExecution, stripQuoteAsset } from "@/components/chart/quick-trade-guard";
import { ChartSection } from "@/components/chart/chart-section";
import { OrderBook } from "@/components/chart/order-book";
import { ChatSection } from "@/components/ai/chat-section";
import { TradeHubSection } from "@/components/trade-hub";
import { useToast } from "@/hooks/use-toast";
import { useTradeAINativeSync } from "@/hooks/use-tradeai-native-sync";
import { useTradeRecoveryOnRestore } from "@/hooks/use-trade-recovery-on-restore";
import { getGlobalWorkerManager } from "@/hooks/use-binance-stream";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, Bot } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

function parseAmountInput(raw: string): number {
  const cleaned = (raw || "").trim().replace(/\s+/g, "");
  if (!cleaned) return 0;
  // Se contém "." e ",", trata "." como separador de milhar e "," como decimal (pt-BR)
  if (cleaned.includes(".") && cleaned.includes(",")) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (cleaned.includes(",")) {
    return parseFloat(cleaned.replace(",", ".")) || 0;
  }
  return parseFloat(cleaned) || 0;
}

interface MarketIdea {
  symbol: string;
  name: string;
  type: "LONG" | "SHORT";
  entryPrice: number;
  tp1: number;
  tp2: number;
  stopLoss: number;
  riskReward: number;
  winProbability: number;
  technicalReason: string;
  fundamentalReason?: string;
  timeframe: string;
  horizonLabel?: string;
  holdingPeriod?: string;
  strategyType?: string;
  sector?: string;
}

interface QuickSignal {
  signal: "BUY" | "SELL" | "HOLD";
  confidence_score: number;
  key_driver: string;
  risk_warning?: string;
  stop_loss?: number;
  take_profit?: number;
  risk_reward_ratio?: number;
  agent_error?: boolean;
  error_reason?: string;
}

interface QuickChatMsg {
  role: "user" | "assistant";
  content: string;
}

const TEMA_CATEGORY_MAP: Record<string, string> = {
  "Em alta": "gainers",
  "Reversão": "reversal",
  "DePIN": "depin",
  "Ativos do mundo real": "rwa",
  "IA e dados": "ai",
  "DeFi": "defi",
  "Layer 1": "layer1",
  "Memes": "memes",
  "Volatilidade": "volatility",
};

export function MarketView() {
  const { syncBinanceCoins } = useDataProvider();
  const { toast } = useToast();
  const {
    selectedSymbol,
    selectedExchange,
    ticker,
    monitoredCoinsCount,
    connectionStatus,
    lastMarketUpdate,
    portfolio,
    bots,
    tradingMode,
    activeSection,
    tradePrefill,
    setSelectedSymbol,
    setActiveSection,
    setTradePrefill,
    setOpenAiSettingsModal,
    setAiSignals,
    addTrade,
    setAccount,
    addScheduledOrder,
    addBot,
  } = useCryptoStore(
    useShallow((s) => {
      const sym = (s.selectedSymbol || "BTCUSDT").toUpperCase();
      return {
        selectedSymbol: s.selectedSymbol,
        selectedExchange: s.selectedExchange,
        ticker: s.tickers[sym],
        monitoredCoinsCount: Object.keys(s.tickers).length,
        connectionStatus: s.connectionStatus,
        lastMarketUpdate: s.lastMarketUpdate,
        portfolio: s.portfolio,
        bots: s.bots,
        tradingMode: s.tradingMode,
        activeSection: s.activeSection,
        tradePrefill: s.tradePrefill,
        setSelectedSymbol: s.setSelectedSymbol,
        setActiveSection: s.setActiveSection,
        setTradePrefill: s.setTradePrefill,
        setOpenAiSettingsModal: s.setOpenAiSettingsModal,
        setAiSignals: s.setAiSignals,
        addTrade: s.addTrade,
        setAccount: s.setAccount,
        addScheduledOrder: s.addScheduledOrder,
        addBot: s.addBot,
      };
    })
  );

  const [activeTab, setActiveTab] = useState<"grafico" | "livro" | "ideias" | "assistente" | "mais">(
    activeSection === "ai" ? "ideias" : activeSection === "trade-hub" ? "mais" : "grafico"
  );
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState<string>("0,00");
  const [tradeType, setTradeType] = useState<"agora" | "programada">("agora");
  const [triggerPriceInput, setTriggerPriceInput] = useState<string>("");
  const [isSellMax, setIsSellMax] = useState<boolean>(false);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState<boolean>(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [pendingLiveConfirm, setPendingLiveConfirm] = useState<{
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    total: number;
    sellAll: boolean;
  } | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<string>("1h");
  const [activeIndicators, setActiveIndicators] = useState<string[]>(["media20", "media50"]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [feedNowMs, setFeedNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setFeedNowMs(Date.now()), 2500);
    return () => clearInterval(id);
  }, []);

  const isFeedDisconnected = connectionStatus === "disconnected";
  const feedAgeMs = lastMarketUpdate > 0 ? Math.max(0, feedNowMs - lastMarketUpdate) : 0;
  const isFeedStale = lastMarketUpdate > 0 && feedAgeMs > 10_000;
  const isFeedUnhealthy = isFeedDisconnected || isFeedStale;
  const isOrderBlockedByFeed = isFeedUnhealthy;
  const submittingOrderRef = useRef<boolean>(false);

  const hasBlockingModal = Boolean(pendingLiveConfirm);

  useTradeAINativeSync({
    tradingMode,
    selectedSymbol: (selectedSymbol || "BTCUSDT").toUpperCase(),
    hasBlockingModal,
    isFeedStale: isFeedUnhealthy,
    lastMarketUpdateAt: lastMarketUpdate > 0 ? lastMarketUpdate : null,
    staleThresholdMs: 10_000,
  });

  const handleReconnectStream = useCallback(
    (sym: string) => {
      getGlobalWorkerManager()?.subscribe([sym]);
      void syncBinanceCoins();
    },
    [syncBinanceCoins]
  );

  const handleRefreshOrdersAndBalances = useCallback(
    async (signal: AbortSignal) => {
      const res = await fetch(`/api/account?mode=${tradingMode}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.success && json?.data) {
        setAccount(json.data);
      }
    },
    [tradingMode, setAccount]
  );

  useTradeRecoveryOnRestore({
    selectedSymbol: (selectedSymbol || "BTCUSDT").toUpperCase(),
    isStreamConnected: !isFeedUnhealthy,
    reconnectStream: handleReconnectStream,
    refreshOpenOrdersAndBalances: handleRefreshOrdersAndBalances,
  });

  // Ideias da IA - filtros e estado real
  const [prazoFilter, setPrazoFilter] = useState<"all" | "fast" | "long">("all");
  const [temaFilter, setTemaFilter] = useState<string>("Em alta");
  const [hideActivePairs, setHideActivePairs] = useState<boolean>(false);
  const [avoidCorrelated, setAvoidCorrelated] = useState<boolean>(true);
  const [ideas, setIdeas] = useState<MarketIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState<boolean>(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  // Sinal de IA & Assistente lateral reais
  const [aiSignal, setAiSignal] = useState<QuickSignal | null>(null);
  const [signalLoading, setSignalLoading] = useState<boolean>(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<QuickChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatSessionIdRef = useRef(`v2-assist-${Date.now()}`);

  useEffect(() => {
    if (activeSection === "ai") {
      setActiveTab("ideias");
    } else if (activeSection === "trade-hub") {
      setActiveTab("mais");
    }
  }, [activeSection]);

  const targetSymbol = (selectedSymbol || "BTCUSDT").toUpperCase();
  const baseAsset = stripQuoteAsset(targetSymbol);
  const price = ticker?.price;
  const availableBalance = portfolio?.cashBalance ?? 0;
  const heldPosition = useMemo(
    () =>
      (portfolio?.positions || []).find(
        (p) => p.symbol?.toUpperCase() === targetSymbol || stripQuoteAsset(p.symbol) === baseAsset
      ),
    [portfolio?.positions, targetSymbol, baseAsset]
  );
  const heldQty = heldPosition?.quantity ?? 0;

  // Limpa níveis de IA e feedback de ordem ao trocar de par (evita mostrar Stop/Alvo do BTC em outro ativo)
  useEffect(() => {
    setAiSignal(null);
    setSignalError(null);
    setTradeError(null);
    setTriggerPriceInput("");
    setIsSellMax(false);
  }, [targetSymbol]);

  // Sincroniza lado e níveis quando um setup é carregado de "Ideias da IA"
  useEffect(() => {
    if (tradePrefill && tradePrefill.symbol?.toUpperCase() === targetSymbol) {
      setTradeSide(tradePrefill.side === "SELL" ? "sell" : "buy");
      if (tradePrefill.stopLoss && tradePrefill.takeProfit) {
        setAiSignal({
          signal: tradePrefill.side === "SELL" ? "SELL" : "BUY",
          confidence_score: 80,
          key_driver: tradePrefill.reason || "Setup carregado de Ideias da IA",
          stop_loss: tradePrefill.stopLoss,
          take_profit: tradePrefill.takeProfit,
        });
      }
    }
  }, [tradePrefill, targetSymbol]);

  const activeBotSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          bots
            .filter((b) => b.active)
            .map((b) => (b.symbol || "").toUpperCase().trim())
            .filter(Boolean)
        )
      ),
    [bots]
  );

  const runMarketAnalysis = async (opts?: {
    prazo?: "all" | "fast" | "long";
    tema?: string;
    hideActive?: boolean;
    decorrelate?: boolean;
  }) => {
    const prazo = opts?.prazo ?? prazoFilter;
    const tema = opts?.tema ?? temaFilter;
    const hideActive = opts?.hideActive ?? hideActivePairs;
    const decorrelate = opts?.decorrelate ?? avoidCorrelated;

    setIdeasLoading(true);
    setIdeasError(null);
    try {
      const res = await fetch("/api/ai/trade-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "trade_ideas",
          params: {
            exchange: selectedExchange,
            category: TEMA_CATEGORY_MAP[tema] || "all",
            horizon: prazo,
            excludeSymbols: hideActive ? activeBotSymbols : [],
            decorrelateRisk: decorrelate,
            nonce: Date.now(),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Não foi possível gerar ideias de mercado agora.");
      }
      const received: MarketIdea[] = Array.isArray(json.data) ? json.data : [];
      setIdeas(received);
      if (received.length === 0) {
        setIdeasError("Nenhuma oportunidade atendeu aos filtros escolhidos no momento.");
      } else {
        const mappedIdeas = received.map((idea) => ({
          id: `idea-${idea.symbol}-${Date.now()}`,
          symbol: idea.symbol,
          action: (idea.type === "SHORT" ? "SELL" : "BUY") as "BUY" | "SELL",
          confidence: Math.min(1, (idea.winProbability || 70) / 100),
          priceAtSignal: idea.entryPrice,
          targetPrice: idea.tp1,
          takeProfit: idea.tp1,
          stopLoss: idea.stopLoss,
          reasoning: idea.technicalReason,
          createdAt: new Date().toISOString(),
        }));
        const ideaSymbols = new Set(mappedIdeas.map((m) => m.symbol));
        const currentSignals = useCryptoStore.getState().aiSignals || [];
        setAiSignals([
          ...mappedIdeas,
          ...currentSignals.filter((s) => !ideaSymbols.has(s.symbol)),
        ]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao analisar o mercado.";
      setIdeasError(msg);
    } finally {
      setIdeasLoading(false);
    }
  };

  const fetchQuickSignal = async () => {
    const t = ticker;
    if (!t || !(t.price > 0)) {
      await syncBinanceCoins();
      setSignalError(`Ainda sem cotação ao vivo para ${targetSymbol}.`);
      return;
    }

    setSignalLoading(true);
    setSignalError(null);
    try {
      const res = await fetch("/api/ai/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: targetSymbol,
          price: t.price,
          priceChange24h: t.priceChangePercent,
          volume: t.volume,
          quoteVolume: t.quoteVolume,
          high24h: t.high,
          low24h: t.low,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.signal) {
        throw new Error(json.error || "Falha ao consultar sinal de IA.");
      }
      setAiSignal(json.signal);
      if (!json.signal.agent_error) {
        const raw = json.signal;
        const rawConf = typeof raw.confidence === "number" ? raw.confidence : (raw.confidence_score ?? 0) / 100;
        const currentSignals = useCryptoStore.getState().aiSignals || [];
        setAiSignals([
          {
            id: `ai-market-${targetSymbol}-${Date.now()}`,
            symbol: targetSymbol,
            action: raw.action || raw.signal || "HOLD",
            confidence: rawConf > 1 ? rawConf / 100 : rawConf,
            reasoning: raw.reasoning || raw.key_driver || "Análise de IA",
            priceAtSignal: t.price,
            stopLoss: Number(raw.stopLoss ?? raw.stop_loss ?? 0),
            takeProfit: Number(raw.takeProfit ?? raw.take_profit ?? 0),
            createdAt: new Date().toISOString(),
          },
          ...currentSignals.filter((s) => s.symbol !== targetSymbol),
        ]);
      }
    } catch (err: unknown) {
      setSignalError(err instanceof Error ? err.message : "Erro ao gerar sinal de IA.");
    } finally {
      setSignalLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ideias" && !aiSignal && !signalLoading && ticker && ticker.price > 0) {
      fetchQuickSignal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, targetSymbol, ticker?.price]);

  const sendAssistantMessage = async (textOverride?: string) => {
    const prompt = (textOverride ?? chatMessage).trim();
    if (!prompt || chatLoading) return;

    if (!textOverride) setChatMessage("");
    setChatError(null);
    setChatHistory((prev) => [...prev, { role: "user", content: prompt }]);
    setChatLoading(true);
    try {
      const contextPrefix = ticker?.price
        ? `[Contexto atual: ${targetSymbol} a ${formatCurrency(ticker.price)}, 24h ${formatPercent(ticker.priceChangePercent)}] `
        : "";
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: chatSessionIdRef.current,
          message: `${contextPrefix}${prompt}`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.details || json.error || "Não foi possível responder agora.");
      }
      setChatHistory((prev) => [...prev, { role: "assistant", content: json.response }]);
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : "Erro ao consultar o assistente de IA.");
    } finally {
      setChatLoading(false);
    }
  };

  const toggleIndicator = (id: string) => {
    setActiveIndicators((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleShortcutAmount = (pctOrVal: number | "all") => {
    setTradeError(null);
    const maxSellUsdt = heldQty * (price || 0);
    if (tradeSide === "sell") {
      if (pctOrVal === "all") {
        setIsSellMax(true);
        setTradeAmount(maxSellUsdt.toFixed(2).replace(".", ","));
      } else if (pctOrVal === 0.5) {
        setIsSellMax(false);
        setTradeAmount((maxSellUsdt * 0.5).toFixed(2).replace(".", ","));
      } else {
        setIsSellMax(false);
        setTradeAmount(pctOrVal.toFixed(2).replace(".", ","));
      }
      return;
    }

    setIsSellMax(false);
    if (pctOrVal === "all") {
      setTradeAmount(availableBalance.toFixed(2).replace(".", ","));
    } else if (pctOrVal === 0.5) {
      setTradeAmount((availableBalance * 0.5).toFixed(2).replace(".", ","));
    } else {
      setTradeAmount(pctOrVal.toFixed(2).replace(".", ","));
    }
  };

  const executeTradeRequest = async (order: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    total: number;
    sellAll: boolean;
  }) => {
    if (submittingOrderRef.current) return;
    submittingOrderRef.current = true;
    setIsSubmittingTrade(true);
    setTradeError(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: order.symbol,
          side: order.side,
          price: order.price,
          quantity: order.quantity,
          total: order.total,
          strategy: tradePrefill?.source || "Manual V2",
          mode: tradingMode,
          exchange: selectedExchange,
          pnl: 0,
          sellAll: order.sellAll,
          marginMode: "SPOT",
          leverage: 1,
          horizon: "MEDIO_LONGO",
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        throw new Error(result.error || "Sessão expirada ou não autenticada. Faça login para continuar.");
      }
      if (!res.ok || !result.success) {
        throw new Error(result.details || result.error || "Não foi possível executar a ordem.");
      }

      addTrade({
        id: result.data.id,
        symbol: result.data.symbol,
        side: result.data.side,
        price: result.data.price,
        quantity: result.data.quantity,
        total: result.data.total,
        strategy: result.data.strategy || "Manual V2",
        mode: result.data.mode || tradingMode,
        pnl: result.data.pnl || 0,
        timestamp: result.data.timestamp || new Date().toISOString(),
      });
      if (result.account) {
        setAccount(result.account);
      }

      setTradeAmount("0,00");
      setIsSellMax(false);
      toast({
        title: `${order.side === "BUY" ? "Compra" : "Venda"} executada (${tradingMode === "live" ? "Real" : "Simulado"})`,
        description: `${order.quantity.toFixed(6).replace(/\.?0+$/, "")} ${stripQuoteAsset(order.symbol)} @ US$ ${formatPrice(order.price)} — Total: ${formatCurrency(order.total)}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar ordem.";
      setTradeError(msg);
      toast({
        title: "Falha ao executar ordem",
        description: msg,
        variant: "destructive",
      });
    } finally {
      submittingOrderRef.current = false;
      setIsSubmittingTrade(false);
    }
  };

  const handleSubmitOrder = () => {
    if (isSubmittingTrade || submittingOrderRef.current || isOrderBlockedByFeed) return;
    setTradeError(null);

    const currentPrice = price || 0;
    if (!(currentPrice > 0)) {
      const msg = `Aguardando cotação em tempo real de ${targetSymbol}.`;
      setTradeError(msg);
      toast({ title: "Preço indisponível", description: msg, variant: "destructive" });
      return;
    }

    const amountUsdt = parseAmountInput(tradeAmount);
    const side: "BUY" | "SELL" = tradeSide === "buy" ? "BUY" : "SELL";
    const qty =
      side === "SELL" && isSellMax && heldQty > 0
        ? heldQty
        : amountUsdt > 0
          ? amountUsdt / currentPrice
          : 0;

    const guard = validateQuickTradeExecution({
      isSubmitting: isSubmittingTrade,
      quantity: qty,
      currentPrice,
      tradingMode,
    });

    if (!guard.canExecute) {
      const reason = guard.reason || "Parâmetros inválidos para a ordem.";
      setTradeError(reason);
      toast({ title: "Ordem não enviada", description: reason, variant: "destructive" });
      return;
    }

    if (side === "BUY" && guard.totalUsdt > availableBalance && tradingMode === "paper") {
      const reason = "Saldo USDT insuficiente no modo simulado.";
      setTradeError(reason);
      toast({ title: "Saldo insuficiente", description: reason, variant: "destructive" });
      return;
    }

    if (side === "SELL" && tradingMode === "paper" && heldQty <= 0) {
      const reason = `Você não possui posição simulada de ${baseAsset} para vender.`;
      setTradeError(reason);
      toast({ title: "Sem posição para vender", description: reason, variant: "destructive" });
      return;
    }

    if (tradeType === "programada") {
      const triggerPrice = parseAmountInput(triggerPriceInput) || currentPrice;
      if (!(triggerPrice > 0)) {
        const reason = "Informe um preço gatilho válido para a ordem programada.";
        setTradeError(reason);
        return;
      }
      addScheduledOrder({
        id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        symbol: targetSymbol,
        side,
        triggerPrice,
        quantity: qty,
        direction: side === "BUY" ? (triggerPrice <= currentPrice ? "below" : "above") : (triggerPrice >= currentPrice ? "above" : "below"),
        isTriggered: false,
        createdAt: new Date().toISOString(),
        marginMode: "SPOT",
        leverage: 1,
        horizon: "MEDIO_LONGO",
      });
      setTradeAmount("0,00");
      setTriggerPriceInput("");
      setIsSellMax(false);
      toast({
        title: "Ordem programada registrada",
        description: `${side === "BUY" ? "Compra" : "Venda"} de ${baseAsset} @ gatilho US$ ${formatPrice(triggerPrice)} (${formatCurrency(guard.totalUsdt)}).`,
      });
      return;
    }

    const sellAll = side === "SELL" && (isSellMax || (heldQty > 0 && qty >= heldQty * 0.99));
    const orderPayload = {
      symbol: targetSymbol,
      side,
      quantity: qty,
      price: currentPrice,
      total: guard.totalUsdt,
      sellAll,
    };

    if (tradingMode === "live") {
      setPendingLiveConfirm(orderPayload);
      return;
    }

    void executeTradeRequest(orderPayload);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn font-instrument-sans">
      {/* 1. CABEÇALHO DO MERCADO COM SEGMENTED CONTROL */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-instrument-serif text-[40px] sm:text-[48px] text-[#0E1B2C] dark:text-white leading-tight">
            Mercado
          </h1>
        </div>

        {/* Abas da Área de Mercado */}
        <div className="inline-flex max-w-full overflow-x-auto no-scrollbar p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[12px] sm:text-[14px] shrink-0">
          {[
            { id: "grafico", label: "Gráfico" },
            { id: "livro", label: "Livro de ofertas" },
            { id: "ideias", label: "Ideias da IA" },
            { id: "assistente", label: "Assistente" },
            { id: "mais", label: "Mais ferramentas" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 sm:px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-white dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white font-semibold shadow-xs"
                  : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. ABA: GRÁFICO (Artboard 04_mercado.png) */}
      {activeTab === "grafico" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Terminal Gráfico */}
          <div className="lg:col-span-8 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[20px] sm:rounded-[24px] p-4 sm:p-7 shadow-xs space-y-3 sm:space-y-4">
            {/* Linha 1: Par + Cotação em Serifa */}
            <div className="flex items-center space-x-3">
              <span className="px-3 py-1 rounded-full bg-[#EEF1F5] dark:bg-white/10 text-[#0E1B2C] dark:text-white font-bold text-[13px] font-mono">
                {selectedSymbol || "BTC/USDT"}
              </span>
              <span className="font-instrument-serif text-[28px] sm:text-[34px] text-[#0E1B2C] dark:text-white font-normal">
                {price ? formatCurrency(price) : "Aguardando preço"}
              </span>
            </div>

            {/* Linha 2: Intervalos */}
            <div className="flex items-center space-x-1 sm:space-x-1.5 text-[11px] sm:text-[12px] font-medium text-[#4A586A] dark:text-[#94a3b8] pt-1 overflow-x-auto no-scrollbar py-0.5">
              {[
                { value: "1m", label: "1m" },
                { value: "5m", label: "5m" },
                { value: "15m", label: "15m" },
                { value: "1h", label: "1h" },
                { value: "4h", label: "4h" },
                { value: "1d", label: "1D" },
                { value: "1w", label: "1W" },
                { value: "1M", label: "1M" },
              ].map((interval) => (
                <button
                  key={interval.value}
                  onClick={() => setSelectedInterval(interval.value)}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    selectedInterval === interval.value
                      ? "bg-[#0E1B2C] text-white font-semibold"
                      : "hover:bg-[#EEF1F5] dark:hover:bg-white/10 text-[#4A586A]"
                  }`}
                >
                  {interval.label}
                </button>
              ))}
            </div>

            {/* Linha 3: Chips de Indicadores */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[
                { id: "media20", label: "Média 20" },
                { id: "media50", label: "Média 50" },
                { id: "bollinger", label: "Bandas de Bollinger" },
                { id: "ema12", label: "EMA 12" },
                { id: "mais", label: "Mais indicadores" },
              ].map((ind) => {
                const isActive = activeIndicators.includes(ind.id);
                return (
                  <button
                    key={ind.id}
                    onClick={() => toggleIndicator(ind.id)}
                    className={`px-3 py-1 rounded-full text-[12px] font-medium transition-all ${
                      isActive
                        ? "bg-[#E7EEFC] text-[#1F4FB0] border border-[#C5D7FA]"
                        : "bg-[#EEF1F5] dark:bg-white/5 text-[#4A586A] dark:text-[#94a3b8] border border-transparent"
                    }`}
                  >
                    {ind.label}
                  </button>
                );
              })}
            </div>

            {/* Container do Gráfico Real */}
            <div className="pt-2">
              <ChartSection
                selectedInterval={selectedInterval}
                onIntervalChange={setSelectedInterval}
                activeIndicators={activeIndicators}
                onToggleIndicator={toggleIndicator}
              />
            </div>
          </div>

          {/* Coluna Direita: Painel Negociar Ativo */}
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Negociar {baseAsset}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[#EEF1F5] dark:bg-white/10 text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium">
                {tradingMode === "paper" ? "Simulado" : "Real"}
              </span>
            </div>

            {/* Segmentado Comprar / Vender */}
            <div className="p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full grid grid-cols-2">
              <button
                onClick={() => {
                  setTradeSide("buy");
                  setTradeError(null);
                  setIsSellMax(false);
                }}
                className={`py-2 rounded-full text-[14px] font-semibold transition-all cursor-pointer ${
                  tradeSide === "buy"
                    ? "bg-[#0B8F6A] text-white shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8]"
                }`}
              >
                Comprar
              </button>
              <button
                onClick={() => {
                  setTradeSide("sell");
                  setTradeError(null);
                  setIsSellMax(false);
                }}
                className={`py-2 rounded-full text-[14px] font-semibold transition-all cursor-pointer ${
                  tradeSide === "sell"
                    ? "bg-[#B42318] text-white shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8]"
                }`}
              >
                Vender
              </button>
            </div>

            {/* Disponível */}
            <div className="flex justify-between text-[13px]">
              <span className="text-[#4A586A] dark:text-[#94a3b8]">Disponível</span>
              <span className="font-bold text-[#0E1B2C] dark:text-white tabular-nums">
                {tradeSide === "buy"
                  ? `${formatCurrency(availableBalance)} USDT`
                  : `${heldQty > 0 ? heldQty.toFixed(6).replace(/\.?0+$/, "") : "0"} ${baseAsset}`}
              </span>
            </div>

            {/* Campo de Valor com USDT */}
            <div className="space-y-1.5">
              <label className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                {tradeSide === "buy" ? "Valor da compra" : "Valor da venda"}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={tradeAmount}
                  onChange={(e) => {
                    setIsSellMax(false);
                    setTradeError(null);
                    setTradeAmount(e.target.value);
                  }}
                  className="w-full h-12 px-4 pr-14 rounded-[14px] border border-[#D3DAE3] dark:border-white/20 bg-transparent text-[16px] font-bold font-instrument-sans text-[#0E1B2C] dark:text-white focus:outline-none focus:border-[#1F5FD6]"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#4A586A] font-semibold">
                  USDT
                </span>
              </div>
              {price && parseAmountInput(tradeAmount) > 0 && (
                <p className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] tabular-nums">
                  ≈ {(parseAmountInput(tradeAmount) / price).toFixed(6).replace(/\.?0+$/, "")} {baseAsset} a{" "}
                  {formatCurrency(price)}
                </p>
              )}
            </div>

            {/* Pílulas de Atalho */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "US$ 25", action: () => handleShortcutAmount(25) },
                { label: "US$ 50", action: () => handleShortcutAmount(50) },
                { label: "50%", action: () => handleShortcutAmount(0.5) },
                { label: "Tudo", action: () => handleShortcutAmount("all") },
              ].map((btn, idx) => (
                <button
                  key={idx}
                  onClick={btn.action}
                  className="py-1.5 rounded-full bg-[#EEF1F5] dark:bg-white/10 hover:bg-[#E4E8ED] text-[12px] font-semibold text-[#0E1B2C] dark:text-white transition-colors cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Segmentado Agora / Programada */}
            <div className="p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full grid grid-cols-2 text-[13px]">
              <button
                onClick={() => {
                  setTradeType("agora");
                  setTradeError(null);
                }}
                className={`py-1.5 rounded-full font-medium transition-all cursor-pointer ${
                  tradeType === "agora"
                    ? "bg-white dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8]"
                }`}
              >
                Agora
              </button>
              <button
                onClick={() => {
                  setTradeType("programada");
                  setTradeError(null);
                  if (!triggerPriceInput && price) {
                    setTriggerPriceInput(String(price).replace(".", ","));
                  }
                }}
                className={`py-1.5 rounded-full font-medium transition-all cursor-pointer ${
                  tradeType === "programada"
                    ? "bg-white dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8]"
                }`}
              >
                Programada
              </button>
            </div>

            {tradeType === "programada" && (
              <div className="space-y-1.5">
                <label className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                  Preço gatilho (USDT)
                </label>
                <input
                  type="text"
                  value={triggerPriceInput}
                  onChange={(e) => setTriggerPriceInput(e.target.value)}
                  placeholder={price ? String(price).replace(".", ",") : "0,00"}
                  className="w-full h-11 px-4 rounded-[14px] border border-[#D3DAE3] dark:border-white/20 bg-transparent text-[15px] font-bold font-instrument-sans text-[#0E1B2C] dark:text-white focus:outline-none focus:border-[#1F5FD6]"
                />
              </div>
            )}

            {/* Sugestão de Stop e Alvo da IA */}
            <div className="pt-1 text-[13px] space-y-1">
              <span className="font-semibold text-[#0E1B2C] dark:text-white block">
                Stop e alvo sugeridos pela IA
              </span>
              {aiSignal && aiSignal.stop_loss && aiSignal.take_profit ? (
                <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] tabular-nums">
                  Stop {formatCurrency(aiSignal.stop_loss)} · Alvo {formatCurrency(aiSignal.take_profit)}
                </p>
              ) : (
                <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                  {price ? "Gere o sinal na aba Ideias da IA para preencher níveis" : "Aparecem quando houver preço"}
                </p>
              )}
            </div>

            {/* Opções Avançadas */}
            <div className="space-y-2">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[13px] font-semibold text-[#1F5FD6] hover:underline cursor-pointer"
              >
                Opções avançadas: alavancagem, margem, tempo limite
              </button>
              {showAdvanced && (
                <div className="p-3 rounded-[14px] bg-[#EEF1F5] dark:bg-white/5 text-[12px] text-[#4A586A] dark:text-[#94a3b8] space-y-1">
                  <div className="flex justify-between">
                    <span>Execução</span>
                    <span className="font-semibold text-[#0E1B2C] dark:text-white">Spot 1x (Anti-Liquidação)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mínimo Binance Spot</span>
                    <span className="font-semibold text-[#0E1B2C] dark:text-white">US$ 5,00</span>
                  </div>
                </div>
              )}
            </div>

            {isFeedUnhealthy && (
              <div className="p-3 rounded-[12px] bg-[#FFF4DC] dark:bg-amber-950/40 border border-[#FFE7A8] dark:border-amber-500/40 text-[#6B4300] dark:text-amber-300 text-[12px] font-medium">
                {isFeedDisconnected
                  ? "Feed desconectado da Binance. Envio de ordens bloqueado até restabelecer o stream."
                  : `Dados de mercado obsoletos há ${Math.floor(feedAgeMs / 1000)} s (>10 s). Envio de ordens bloqueado até normalizar.`}
              </div>
            )}

            {tradeError && (
              <div className="p-3 rounded-[12px] bg-[#FDF4F3] border border-[#F1C9C5] text-[#B42318] text-[12px] font-medium">
                {tradeError}
              </div>
            )}

            {/* Botão de Ação Grande */}
            <button
              onClick={handleSubmitOrder}
              disabled={isSubmittingTrade || isOrderBlockedByFeed}
              className={`w-full py-3 rounded-full text-white text-[15px] font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                tradeSide === "buy"
                  ? "bg-[#0B8F6A] hover:bg-[#097758]"
                  : "bg-[#B42318] hover:bg-[#911a10]"
              }`}
            >
              {isSubmittingTrade && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {tradeType === "programada"
                  ? `Programar ${tradeSide === "buy" ? "compra" : "venda"} de ${baseAsset}`
                  : `${tradeSide === "buy" ? "Comprar" : "Vender"} ${baseAsset}`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 3. ABA: LIVRO DE OFERTAS */}
      {activeTab === "livro" && (
        <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 shadow-xs max-w-2xl mx-auto">
          <OrderBook />
        </div>
      )}

      {/* 4. ABA: IDEIAS DA IA (Artboard 07_mercado_ideias_ia.png) */}
      {activeTab === "ideias" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Ideias de Trade e Filtros */}
          <div className="lg:col-span-8 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-6">
            <div>
              <h2 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Ideias de trade
              </h2>
              <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] pt-1">
                A IA analisa {monitoredCoinsCount > 0 ? monitoredCoinsCount : "centenas de"} moedas com dados da Binance e sugere entradas e saídas. Escolha o prazo e o tema para estreitar a busca.
              </p>
            </div>

            {/* Prazo */}
            <div className="space-y-2">
              <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium block">
                Prazo
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "Todos" },
                  { id: "fast", label: "Curto prazo (day e scalp)" },
                  { id: "long", label: "Médio e longo prazo (swing)" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const next = p.id as "all" | "fast" | "long";
                      setPrazoFilter(next);
                      if (ideas.length > 0) runMarketAnalysis({ prazo: next });
                    }}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                      prazoFilter === p.id
                        ? "bg-[#0E1B2C] text-white font-semibold"
                        : "bg-[#EEF1F5] dark:bg-white/10 text-[#4A586A] hover:text-[#0E1B2C]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tema */}
            <div className="space-y-2">
              <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium block">
                Tema
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  "Em alta", "Reversão", "DePIN", "Ativos do mundo real", "IA e dados",
                  "DeFi", "Layer 1", "Memes", "Volatilidade",
                ].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTemaFilter(t);
                      if (ideas.length > 0) runMarketAnalysis({ tema: t });
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                      temaFilter === t
                        ? "bg-[#0E1B2C] text-white font-semibold"
                        : "bg-[#EEF1F5] dark:bg-white/10 text-[#4A586A] hover:text-[#0E1B2C]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Switches de Risco */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between py-1">
                <span className="text-[14px] text-[#0E1B2C] dark:text-white font-medium">
                  Ocultar pares que já têm robô ativo
                </span>
                <AppSwitch
                  checked={hideActivePairs}
                  onCheckedChange={(checked) => {
                    setHideActivePairs(checked);
                    if (ideas.length > 0) runMarketAnalysis({ hideActive: checked });
                  }}
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="text-[14px] text-[#0E1B2C] dark:text-white font-medium block">
                    Evitar ativos muito ligados ao BTC e ao ETH
                  </span>
                  <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                    Protege a carteira contra risco concentrado.
                  </span>
                </div>
                <AppSwitch
                  checked={avoidCorrelated}
                  onCheckedChange={(checked) => {
                    setAvoidCorrelated(checked);
                    if (ideas.length > 0) runMarketAnalysis({ decorrelate: checked });
                  }}
                />
              </div>
            </div>

            {/* Resultados ou Estado Vazio com Botão Analisar Mercado */}
            {ideasLoading ? (
              <div className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 rounded-[18px] p-6 flex items-center gap-3 text-[14px] text-[#4A586A] dark:text-[#94a3b8]">
                <Loader2 className="w-5 h-5 animate-spin text-[#0E1B2C] dark:text-white shrink-0" />
                <span>
                  Analisando mercado em tempo real na {selectedExchange === "okx" ? "OKX Spot" : "Binance Spot"}...
                </span>
              </div>
            ) : ideas.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[13px] font-semibold text-[#0E1B2C] dark:text-white">
                    {ideas.length} oportunidades encontradas ({temaFilter})
                  </span>
                  <button
                    onClick={() => runMarketAnalysis()}
                    disabled={ideasLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[13px] font-semibold text-[#0E1B2C] dark:text-white hover:bg-[#EEF1F5] dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Analisar novamente
                  </button>
                </div>

                {ideas.map((idea) => {
                  const isLong = idea.type !== "SHORT";
                  return (
                    <div
                      key={idea.symbol}
                      className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 rounded-[18px] p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-[16px] text-[#0E1B2C] dark:text-white font-mono">
                            {idea.symbol}
                          </span>
                          <span className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                            {idea.name}
                          </span>
                          {idea.sector && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#EEF1F5] dark:bg-white/10 text-[11px] font-medium text-[#4A586A] dark:text-[#94a3b8]">
                              {idea.sector}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[12px] font-semibold">
                          <span
                            className={`px-2.5 py-0.5 rounded-full ${
                              isLong
                                ? "bg-[#E6F7F1] text-[#0A7A59]"
                                : "bg-[#FDF4F3] text-[#B42318]"
                            }`}
                          >
                            {isLong ? "COMPRA" : "VENDA"}
                          </span>
                          <span className="text-[#4A586A] dark:text-[#94a3b8] tabular-nums">
                            Prob. {idea.winProbability}% · R:R {idea.riskReward}:1
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-[13px]">
                        <div>
                          <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Entrada</span>
                          <span className="font-semibold text-[#0E1B2C] dark:text-white tabular-nums">
                            {formatCurrency(idea.entryPrice)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Stop Loss</span>
                          <span className="font-semibold text-[#B42318] tabular-nums">
                            {formatCurrency(idea.stopLoss)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Alvo 1</span>
                          <span className="font-semibold text-[#0A7A59] tabular-nums">
                            {formatCurrency(idea.tp1)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#4A586A] dark:text-[#94a3b8] block">Alvo 2</span>
                          <span className="font-semibold text-[#0A7A59] tabular-nums">
                            {formatCurrency(idea.tp2)}
                          </span>
                        </div>
                      </div>

                      <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8] leading-relaxed">
                        {idea.technicalReason}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            setSelectedSymbol(idea.symbol);
                            setActiveTab("grafico");
                            setActiveSection("chart");
                          }}
                          className="px-4 py-1.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] text-[12px] font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                        >
                          Ver no gráfico
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSymbol(idea.symbol);
                            setTradePrefill({
                              symbol: idea.symbol,
                              side: isLong ? "BUY" : "SELL",
                              entryPrice: idea.entryPrice,
                              stopLoss: idea.stopLoss,
                              takeProfit: idea.tp1,
                              reason: idea.technicalReason,
                            });
                            setActiveTab("grafico");
                            setActiveSection("chart");
                          }}
                          className="px-4 py-1.5 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white text-[12px] font-semibold hover:bg-[#EEF1F5] dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          Carregar setup
                        </button>
                        <button
                          onClick={() => {
                            const tpPct =
                              idea.entryPrice > 0 && idea.tp1 > 0
                                ? Math.max(1.2, Math.abs(((idea.tp1 - idea.entryPrice) / idea.entryPrice) * 100))
                                : 3.5;
                            const slPct =
                              idea.entryPrice > 0 && idea.stopLoss > 0
                                ? Math.min(2.0, Math.max(0.8, Math.abs(((idea.entryPrice - idea.stopLoss) / idea.entryPrice) * 100)))
                                : 1.8;
                            addBot({
                              name: `IA ${stripQuoteAsset(idea.symbol)}`,
                              symbol: idea.symbol,
                              strategy: "AI",
                              takeProfit: Number(tpPct.toFixed(2)),
                              stopLoss: Number(slPct.toFixed(2)),
                              allocationAmount: 25,
                              active: false,
                            });
                            toast({
                              title: `Robô criado para ${idea.symbol}`,
                              description: `Adicionado à aba Robôs (pausado, TP +${tpPct.toFixed(1)}% / SL -${slPct.toFixed(1)}%).`,
                            });
                          }}
                          className="px-4 py-1.5 rounded-full border border-[#D3DAE3] dark:border-white/20 text-[#0E1B2C] dark:text-white text-[12px] font-semibold hover:bg-[#EEF1F5] dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Bot className="w-3.5 h-3.5 text-[#1F5FD6]" />
                          <span>Criar robô</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 rounded-[18px] p-6 space-y-3">
                <h4 className="font-bold text-[15px] text-[#0E1B2C] dark:text-white">
                  {ideasError ? "Não foi possível gerar ideias" : "Nenhuma ideia ainda"}
                </h4>
                <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                  {ideasError ||
                    "Rode a análise para ver as sugestões. O resultado aparece aqui em poucos segundos."}
                </p>
                <button
                  onClick={() => runMarketAnalysis()}
                  className="px-5 py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Analisar mercado
                </button>
              </div>
            )}
          </div>

          {/* Coluna Direita: Assistente IA */}
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[20px] sm:rounded-[24px] p-4 sm:p-7 shadow-xs space-y-3 sm:space-y-4">
            <div>
              <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Assistente
              </h3>
              <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                Pergunte sobre {targetSymbol} e o mercado
              </p>
            </div>

            {/* Mensagem de Boas-Vindas ou Histórico do Chat */}
            {chatHistory.length === 0 ? (
              <div className="p-4 rounded-[16px] bg-[#EEF1F5] dark:bg-white/5 text-[13px] text-[#4A586A] dark:text-[#94a3b8] leading-relaxed">
                Olá! Eu explico indicadores, sugiro estratégias e analiso tendências. Respostas são informativas e não são recomendação financeira.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                {chatHistory.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-[14px] text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-[#0E1B2C] text-white ml-4"
                        : "bg-[#EEF1F5] dark:bg-white/5 text-[#0E1B2C] dark:text-[#e2e8f0] mr-2"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {chatLoading && (
                  <div className="p-3 rounded-[14px] bg-[#EEF1F5] dark:bg-white/5 text-[12px] text-[#4A586A] flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Consultando IA...</span>
                  </div>
                )}
              </div>
            )}

            {chatError && (
              <div className="p-3 rounded-[12px] bg-[#FDF4F3] border border-[#F1C9C5] text-[#B42318] text-[12px] space-y-1">
                <span>{chatError}</span>
                <button
                  onClick={() => setOpenAiSettingsModal(true)}
                  className="font-semibold underline block cursor-pointer"
                >
                  Configurar motor de IA
                </button>
              </div>
            )}

            {/* 4 Perguntas Sugeridas */}
            <div className="space-y-2">
              {[
                `Analisar a tendência de ${targetSymbol}`,
                "Qual a melhor estratégia para iniciantes?",
                "Explique o que é stop loss",
                "Como está o mercado hoje?",
              ].map((q, idx) => (
                <button
                  key={idx}
                  disabled={chatLoading}
                  onClick={() => sendAssistantMessage(q)}
                  className="w-full text-left p-3 rounded-[12px] border border-[#D3DAE3] dark:border-white/10 hover:border-[#0E1B2C] text-[13px] text-[#0E1B2C] dark:text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Campo de Mensagem com Botão Enviar */}
            <div className="relative pt-2">
              <input
                type="text"
                placeholder="Pergunte sobre o mercado"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendAssistantMessage();
                  }
                }}
                className="w-full h-11 px-4 pr-20 rounded-full border border-[#D3DAE3] dark:border-white/10 text-[13px] focus:outline-none focus:border-[#0E1B2C]"
              />
              <button
                onClick={() => sendAssistantMessage()}
                disabled={chatLoading || !chatMessage.trim()}
                className="absolute right-1 top-3 px-4 py-1.5 rounded-full bg-[#0E1B2C] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {chatLoading ? "..." : "Enviar"}
              </button>
            </div>

            {/* Painel Real de Sinal de IA do Ativo */}
            {signalLoading ? (
              <div className="p-3.5 rounded-[14px] bg-[#EEF1F5] dark:bg-white/5 text-[#4A586A] dark:text-[#94a3b8] text-[12px] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Analisando sinal de IA para {targetSymbol}...</span>
              </div>
            ) : aiSignal && !aiSignal.agent_error ? (
              <div className="p-3.5 rounded-[14px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 text-[12px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0E1B2C] dark:text-white">
                    Sinal IA ({targetSymbol}):{" "}
                    <span
                      className={
                        aiSignal.signal === "BUY"
                          ? "text-[#0A7A59]"
                          : aiSignal.signal === "SELL"
                            ? "text-[#B42318]"
                            : "text-[#4A586A]"
                      }
                    >
                      {aiSignal.signal === "BUY"
                        ? "COMPRA"
                        : aiSignal.signal === "SELL"
                          ? "VENDA"
                          : "AGUARDAR"}
                    </span>
                  </span>
                  <span className="text-[#4A586A] dark:text-[#94a3b8] tabular-nums">
                    {aiSignal.confidence_score}%
                  </span>
                </div>
                <p className="text-[#4A586A] dark:text-[#94a3b8] leading-snug">
                  {aiSignal.key_driver}
                </p>
                <button
                  onClick={fetchQuickSignal}
                  className="font-semibold text-[#1F5FD6] underline block cursor-pointer"
                >
                  Atualizar sinal
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-[14px] bg-[#FFF4DC] border border-[#FFE7A8] text-[#6B4300] text-[12px] space-y-1">
                <span>
                  {signalError ||
                    aiSignal?.error_reason ||
                    (ticker?.price
                      ? `Clique para consultar o sinal de IA para ${targetSymbol}.`
                      : `Sinal de IA aguardando cotação de ${targetSymbol}.`)}
                </span>
                <button
                  onClick={fetchQuickSignal}
                  className="font-semibold underline block hover:opacity-80 cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. ABA: ASSISTENTE DIRETO */}
      {activeTab === "assistente" && (
        <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 shadow-xs max-w-3xl mx-auto">
          <ChatSection />
        </div>
      )}

      {/* 6. ABA: MAIS FERRAMENTAS */}
      {activeTab === "mais" && (
        <div className="bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 shadow-xs">
          <TradeHubSection />
        </div>
      )}

      {/* Confirmação Explícita em Modo Real */}
      <AlertDialog
        open={!!pendingLiveConfirm}
        onOpenChange={(open) => !open && setPendingLiveConfirm(null)}
      >
        <AlertDialogContent className="rounded-[24px] max-w-md p-6 bg-white dark:bg-[#0f1622] border border-[#F1C9C5] font-instrument-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-instrument-serif text-2xl text-[#0E1B2C] dark:text-white">
              Confirmar ordem na Binance (Real)
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#4A586A] pt-2 space-y-3" asChild>
              <div>
                {pendingLiveConfirm && (() => {
                  const bidPrice = (ticker as any)?.bidPrice as number | undefined;
                  const askPrice = (ticker as any)?.askPrice as number | undefined;
                  const hasQuoteSpread = typeof bidPrice === "number" && typeof askPrice === "number" && bidPrice > 0 && askPrice > 0;
                  const spreadAbs = hasQuoteSpread ? Math.max(0, askPrice - bidPrice) : 0;
                  const spreadPct =
                    typeof (ticker as any)?.spreadBps === "number" && (ticker as any).spreadBps > 0
                      ? (ticker as any).spreadBps / 100
                      : hasQuoteSpread
                      ? (spreadAbs / ((bidPrice + askPrice) / 2)) * 100
                      : 0;
                  const estimatedSlippagePct = spreadPct > 0 ? Math.max(0.02, spreadPct * 0.5) : 0.05;
                  const estimatedFeeUsd = pendingLiveConfirm.total * 0.001;
                  const highSpread = spreadPct > 0.35;
                  return (
                    <>
                      <p>
                        Você está prestes a enviar uma ordem{" "}
                        <strong>{pendingLiveConfirm.side === "BUY" ? "COMPRA" : "VENDA"}</strong> Spot de{" "}
                        <strong>
                          {pendingLiveConfirm.quantity.toFixed(6).replace(/\.?0+$/, "")}{" "}
                          {stripQuoteAsset(pendingLiveConfirm.symbol)}
                        </strong>{" "}
                        ({pendingLiveConfirm.symbol}) no valor estimado de{" "}
                        <strong>{formatCurrency(pendingLiveConfirm.total)}</strong> a mercado (≈ US${" "}
                        {formatPrice(pendingLiveConfirm.price)}).
                      </p>
                      <div className="p-3 rounded-xl bg-[#EEF1F5] dark:bg-white/5 text-xs space-y-1.5 tabular-nums">
                        <div className="flex justify-between">
                          <span>Spread atual</span>
                          <span className={highSpread ? "font-bold text-[#B42318]" : "font-semibold text-[#0E1B2C] dark:text-white"}>
                            {spreadPct > 0
                              ? `${hasQuoteSpread ? `$${formatPrice(spreadAbs)} · ` : ""}${spreadPct.toFixed(3)}%`
                              : "Indisponível (aguardando bookTicker)"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Slippage estimado (MARKET)</span>
                          <span className="font-semibold text-[#0E1B2C] dark:text-white">
                            ~{estimatedSlippagePct.toFixed(3)}% ({formatCurrency((pendingLiveConfirm.total * estimatedSlippagePct) / 100)})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Taxa estimada (Taker 0,10% padrão)</span>
                          <span className="font-semibold text-[#0E1B2C] dark:text-white">
                            {formatCurrency(estimatedFeeUsd)}
                          </span>
                        </div>
                      </div>
                      {highSpread && (
                        <div className="p-2.5 rounded-xl bg-[#FDF4F3] border border-[#F1C9C5] text-[#B42318] text-xs font-semibold">
                          Alerta: Spread acima de 0,35% ({spreadPct.toFixed(2)}%). Risco elevado de slippage na execução a mercado.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLiveConfirm) {
                  const order = pendingLiveConfirm;
                  setPendingLiveConfirm(null);
                  void executeTradeRequest(order);
                }
              }}
              className="rounded-full bg-[#0E1B2C] text-white font-semibold hover:opacity-90"
            >
              Confirmar e enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
