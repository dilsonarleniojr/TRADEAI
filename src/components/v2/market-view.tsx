"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useCryptoStore } from "@/lib/store";
import { useDataProvider } from "@/lib/data-provider";
import { AppSwitch } from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import { ChartSection } from "@/components/chart/chart-section";
import { OrderBook } from "@/components/chart/order-book";
import { ChatSection } from "@/components/ai/chat-section";
import { TradeHubSection } from "@/components/trade-hub";
import { Loader2, RefreshCw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

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
  const {
    selectedSymbol,
    tickers,
    portfolio,
    bots,
    tradingMode,
    activeSection,
    setSelectedSymbol,
    setActiveSection,
    setTradePrefill,
    setOpenAiSettingsModal,
    setAiSignals,
  } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      tickers: s.tickers,
      portfolio: s.portfolio,
      bots: s.bots,
      tradingMode: s.tradingMode,
      activeSection: s.activeSection,
      setSelectedSymbol: s.setSelectedSymbol,
      setActiveSection: s.setActiveSection,
      setTradePrefill: s.setTradePrefill,
      setOpenAiSettingsModal: s.setOpenAiSettingsModal,
      setAiSignals: s.setAiSignals,
    }))
  );

  const [activeTab, setActiveTab] = useState<"grafico" | "livro" | "ideias" | "assistente" | "mais">(
    activeSection === "ai" ? "ideias" : activeSection === "trade-hub" ? "mais" : "grafico"
  );
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState<string>("0,00");
  const [tradeType, setTradeType] = useState<"agora" | "programada">("agora");
  const [selectedInterval, setSelectedInterval] = useState<string>("1h");
  const [activeIndicators, setActiveIndicators] = useState<string[]>(["media20", "media50"]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

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

  const targetSymbol = selectedSymbol || "BTCUSDT";
  const ticker = tickers[targetSymbol] || tickers["BTCUSDT"];
  const price = tickers[selectedSymbol]?.price;
  const availableBalance = portfolio?.cashBalance ?? 0;
  const monitoredCoinsCount = useMemo(() => Object.keys(tickers).length, [tickers]);

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
        setAiSignals(
          received.map((idea) => ({
            id: `idea-${idea.symbol}-${Date.now()}`,
            symbol: idea.symbol,
            action: idea.type === "SHORT" ? "SELL" : "BUY",
            confidence: Math.min(1, (idea.winProbability || 70) / 100),
            priceAtSignal: idea.entryPrice,
            targetPrice: idea.tp1,
            takeProfit: idea.tp1,
            stopLoss: idea.stopLoss,
            reasoning: idea.technicalReason,
            createdAt: new Date().toISOString(),
          }))
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao analisar o mercado.";
      setIdeasError(msg);
    } finally {
      setIdeasLoading(false);
    }
  };

  const fetchQuickSignal = async () => {
    const t = tickers[targetSymbol] || tickers["BTCUSDT"];
    const sym = tickers[targetSymbol] ? targetSymbol : "BTCUSDT";
    if (!t || !(t.price > 0)) {
      await syncBinanceCoins();
      setSignalError(`Ainda sem cotação ao vivo para ${sym}.`);
      return;
    }

    setSignalLoading(true);
    setSignalError(null);
    try {
      const res = await fetch("/api/ai/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym,
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
    if (pctOrVal === "all") {
      setTradeAmount(availableBalance.toFixed(2).replace(".", ","));
    } else if (pctOrVal === 0.5) {
      setTradeAmount((availableBalance * 0.5).toFixed(2).replace(".", ","));
    } else {
      setTradeAmount(pctOrVal.toFixed(2).replace(".", ","));
    }
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
        <div className="inline-flex p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full border border-[#E7EBF0] dark:border-white/10 text-[13px] sm:text-[14px]">
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
          <div className="lg:col-span-8 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
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
            <div className="flex items-center space-x-1.5 text-[12px] font-medium text-[#4A586A] dark:text-[#94a3b8] pt-1">
              {["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"].map((interval) => (
                <button
                  key={interval}
                  onClick={() => setSelectedInterval(interval)}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    selectedInterval === interval
                      ? "bg-[#0E1B2C] text-white font-semibold"
                      : "hover:bg-[#EEF1F5] dark:hover:bg-white/10 text-[#4A586A]"
                  }`}
                >
                  {interval}
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
              <ChartSection />
            </div>
          </div>

          {/* Coluna Direita: Painel Negociar BTC */}
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Negociar {selectedSymbol?.replace("USDT", "") || "BTC"}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[#EEF1F5] dark:bg-white/10 text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium">
                {tradingMode === "paper" ? "Simulado" : "Real"}
              </span>
            </div>

            {/* Segmentado Comprar / Vender */}
            <div className="p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full grid grid-cols-2">
              <button
                onClick={() => setTradeSide("buy")}
                className={`py-2 rounded-full text-[14px] font-semibold transition-all ${
                  tradeSide === "buy"
                    ? "bg-[#0B8F6A] text-white shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8]"
                }`}
              >
                Comprar
              </button>
              <button
                onClick={() => setTradeSide("sell")}
                className={`py-2 rounded-full text-[14px] font-semibold transition-all ${
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
                {formatCurrency(availableBalance)}
              </span>
            </div>

            {/* Campo de Valor com USDT */}
            <div className="space-y-1.5">
              <label className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                Valor da compra
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  className="w-full h-12 px-4 pr-14 rounded-[14px] border border-[#D3DAE3] dark:border-white/20 bg-transparent text-[16px] font-bold font-instrument-sans text-[#0E1B2C] dark:text-white focus:outline-none focus:border-[#1F5FD6]"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#4A586A] font-semibold">
                  USDT
                </span>
              </div>
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
                  className="py-1.5 rounded-full bg-[#EEF1F5] dark:bg-white/10 hover:bg-[#E4E8ED] text-[12px] font-semibold text-[#0E1B2C] dark:text-white transition-colors"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Segmentado Agora / Programada */}
            <div className="p-1 bg-[#EEF1F5] dark:bg-[#162032] rounded-full grid grid-cols-2 text-[13px]">
              <button
                onClick={() => setTradeType("agora")}
                className={`py-1.5 rounded-full font-medium transition-all ${
                  tradeType === "agora"
                    ? "bg-white dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8]"
                }`}
              >
                Agora
              </button>
              <button
                onClick={() => setTradeType("programada")}
                className={`py-1.5 rounded-full font-medium transition-all ${
                  tradeType === "programada"
                    ? "bg-white dark:bg-[#0f1622] text-[#0E1B2C] dark:text-white font-semibold shadow-xs"
                    : "text-[#4A586A] dark:text-[#94a3b8]"
                }`}
              >
                Programada
              </button>
            </div>

            {/* Sugestão de Stop e Alvo da IA */}
            <div className="pt-2 text-[13px] space-y-1">
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
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[13px] font-semibold text-[#1F5FD6] hover:underline"
              >
                Opções avançadas: alavancagem, margem, tempo limite
              </button>
            </div>

            {/* Botão de Ação Grande */}
            <button
              onClick={() => {}}
              className="w-full py-3 rounded-full bg-[#0B8F6A] text-white text-[15px] font-bold hover:bg-[#097758] transition-colors cursor-pointer shadow-xs"
            >
              Comprar {selectedSymbol?.replace("USDT", "") || "BTC"}
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
                <span>Analisando mercado em tempo real na Binance Spot...</span>
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
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
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
    </div>
  );
}
