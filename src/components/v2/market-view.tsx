"use client";

import React, { useState } from "react";
import { useCryptoStore } from "@/lib/store";
import { AppSwitch } from "./atoms";
import { formatCurrency, formatPercent } from "@/lib/format";
import { ChartSection } from "@/components/chart/chart-section";
import { OrderBook } from "@/components/chart/order-book";
import { ChatSection } from "@/components/ai/chat-section";
import { TradeHubSection } from "@/components/trade-hub";
import { ChevronDown, Sparkles, Send, RefreshCw, AlertCircle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

export function MarketView() {
  const {
    selectedSymbol,
    tickers,
    portfolio,
    setSelectedSymbol,
    executeQuickTrade,
  } = useCryptoStore(
    useShallow((s) => ({
      selectedSymbol: s.selectedSymbol,
      tickers: s.tickers,
      portfolio: s.portfolio,
      setSelectedSymbol: s.setSelectedSymbol,
      executeQuickTrade: s.executeQuickTrade,
    }))
  );

  const [activeTab, setActiveTab] = useState<"grafico" | "livro" | "ideias" | "assistente" | "mais">("grafico");
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState<string>("0,00");
  const [tradeType, setTradeType] = useState<"agora" | "programada">("agora");
  const [selectedInterval, setSelectedInterval] = useState<string>("1h");
  const [activeIndicators, setActiveIndicators] = useState<string[]>(["media20", "media50"]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Ideias da IA - filtros
  const [prazoFilter, setPrazoFilter] = useState<"todos" | "curto" | "medio">("todos");
  const [temaFilter, setTemaFilter] = useState<string>("Em alta");
  const [hideActivePairs, setHideActivePairs] = useState<boolean>(false);
  const [avoidCorrelated, setAvoidCorrelated] = useState<boolean>(true);
  const [chatMessage, setChatMessage] = useState<string>("");

  const ticker = tickers[selectedSymbol];
  const price = ticker?.price;
  const availableBalance = portfolio?.availableBalanceUsd ?? 9986.30;

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
                Simulado
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
            <div className="pt-2 text-[13px] space-y-0.5">
              <span className="font-semibold text-[#0E1B2C] dark:text-white block">
                Stop e alvo sugeridos pela IA
              </span>
              <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                Aparecem quando houver preço
              </p>
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
                A IA analisa 503 moedas com dados da Binance e sugere entradas e saídas. Escolha o prazo e o tema para estreitar a busca.
              </p>
            </div>

            {/* Prazo */}
            <div className="space-y-2">
              <span className="text-[12px] text-[#4A586A] dark:text-[#94a3b8] font-medium block">
                Prazo
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "todos", label: "Todos" },
                  { id: "curto", label: "Curto prazo (day e scalp)" },
                  { id: "medio", label: "Médio e longo prazo (swing)" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPrazoFilter(p.id as any)}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all ${
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
                    onClick={() => setTemaFilter(t)}
                    className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all ${
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
                  onCheckedChange={setHideActivePairs}
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
                  onCheckedChange={setAvoidCorrelated}
                />
              </div>
            </div>

            {/* Estado Vazio com Botão Analisar Mercado */}
            <div className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E7EBF0] dark:border-white/10 rounded-[18px] p-6 space-y-3">
              <h4 className="font-bold text-[15px] text-[#0E1B2C] dark:text-white">
                Nenhuma ideia ainda
              </h4>
              <p className="text-[13px] text-[#4A586A] dark:text-[#94a3b8]">
                Rode a análise para ver as sugestões. O resultado aparece aqui em poucos segundos.
              </p>
              <button
                onClick={() => {}}
                className="px-5 py-2.5 rounded-full bg-[#0E1B2C] dark:bg-white text-white dark:text-[#0E1B2C] font-semibold text-[14px] hover:opacity-90 transition-opacity"
              >
                Analisar mercado
              </button>
            </div>
          </div>

          {/* Coluna Direita: Assistente IA */}
          <div className="lg:col-span-4 bg-white dark:bg-[#0f1622] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] p-6 sm:p-7 shadow-xs space-y-4">
            <div>
              <h3 className="font-bold text-[18px] text-[#0E1B2C] dark:text-white">
                Assistente
              </h3>
              <p className="text-[12px] text-[#4A586A] dark:text-[#94a3b8]">
                Pergunte sobre BTC/USDT e o mercado
              </p>
            </div>

            {/* Mensagem de Boas-Vindas */}
            <div className="p-4 rounded-[16px] bg-[#EEF1F5] dark:bg-white/5 text-[13px] text-[#4A586A] dark:text-[#94a3b8] leading-relaxed">
              Olá! Eu explico indicadores, sugiro estratégias e analiso tendências. Respostas são informativas e não são recomendação financeira.
            </div>

            {/* 4 Perguntas Sugeridas */}
            <div className="space-y-2">
              {[
                "Analisar a tendência do BTC",
                "Qual a melhor estratégia para iniciantes?",
                "Explique o que é stop loss",
                "Como está o mercado hoje?",
              ].map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setChatMessage(q)}
                  className="w-full text-left p-3 rounded-[12px] border border-[#D3DAE3] dark:border-white/10 hover:border-[#0E1B2C] text-[13px] text-[#0E1B2C] dark:text-white font-medium transition-colors"
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
                className="w-full h-11 px-4 pr-20 rounded-full border border-[#D3DAE3] dark:border-white/10 text-[13px] focus:outline-none focus:border-[#0E1B2C]"
              />
              <button
                onClick={() => {}}
                className="absolute right-1 top-3 px-4 py-1.5 rounded-full bg-[#0E1B2C] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity"
              >
                Enviar
              </button>
            </div>

            {/* Aviso de Sinal de IA Indisponível */}
            <div className="p-3.5 rounded-[14px] bg-[#FFF4DC] border border-[#FFE7A8] text-[#6B4300] text-[12px] space-y-1">
              <span>Sinal de IA indisponível: ainda sem cotação do BTC.</span>
              <button className="font-semibold underline block hover:opacity-80">
                Tentar novamente
              </button>
            </div>
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
