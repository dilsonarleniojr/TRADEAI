"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useCryptoStore, type BotInstance } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  LayoutDashboard,
  BarChart3,
  Bot,
  Brain,
  History,
  BookOpen,
  SlidersHorizontal,
  Gauge,
  Sparkles,
  KeyRound,
  RefreshCw,
  Plus,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Newspaper,
  LineChart,
  FlaskConical,
  BookOpenCheck,
  CalendarCheck,
  Wallet,
  ArrowRight,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

interface GlobalCommandSearchProps {
  onOpenApiDialog?: () => void;
  onOpenAiDialog?: () => void;
  className?: string;
  compactOnly?: boolean;
}

export function GlobalCommandSearch({
  onOpenApiDialog,
  onOpenAiDialog,
  className,
  compactOnly = false,
}: GlobalCommandSearchProps) {
  const {
    activeSection,
    setActiveSection,
    selectedSymbol,
    setSelectedSymbol,
    tickers,
    bots,
    portfolio,
    tradingMode,
    setTradingMode,
    isCommandSearchOpen,
    setIsCommandSearchOpen,
    setTradeHubActiveTab,
    setOpenBotCreateModal,
    setOpenApiSettingsModal,
    setOpenAiSettingsModal,
    setAccount,
    setTrades,
  } = useCryptoStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
      setActiveSection: s.setActiveSection,
      selectedSymbol: s.selectedSymbol,
      setSelectedSymbol: s.setSelectedSymbol,
      tickers: s.tickers,
      bots: s.bots,
      portfolio: s.portfolio,
      tradingMode: s.tradingMode,
      setTradingMode: s.setTradingMode,
      isCommandSearchOpen: s.isCommandSearchOpen,
      setIsCommandSearchOpen: s.setIsCommandSearchOpen,
      setTradeHubActiveTab: s.setTradeHubActiveTab,
      setOpenBotCreateModal: s.setOpenBotCreateModal,
      setOpenApiSettingsModal: s.setOpenApiSettingsModal,
      setOpenAiSettingsModal: s.setOpenAiSettingsModal,
      setAccount: s.setAccount,
      setTrades: s.setTrades,
    }))
  );

  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  // Atalho global de teclado Ctrl+K ou Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandSearchOpen(!isCommandSearchOpen);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandSearchOpen, setIsCommandSearchOpen]);

  const handleSelectSection = useCallback(
    (sectionId: any, label: string) => {
      setActiveSection(sectionId);
      setIsCommandSearchOpen(false);
      toast({
        title: `Navegando para ${label}`,
        description: `Você está na aba ${label}.`,
      });
    },
    [setActiveSection, setIsCommandSearchOpen, toast]
  );

  const handleSelectTradeHubModule = useCallback(
    (tabId: string, moduleLabel: string) => {
      setActiveSection("trade-hub");
      setTradeHubActiveTab(tabId);
      setIsCommandSearchOpen(false);
      toast({
        title: `Estúdio Quant: ${moduleLabel}`,
        description: `Módulo aberto com sucesso no Estúdio Quant & IA.`,
      });
    },
    [setActiveSection, setTradeHubActiveTab, setIsCommandSearchOpen, toast]
  );

  const handleSelectCrypto = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
      setActiveSection("chart");
      setIsCommandSearchOpen(false);
      toast({
        title: `Par ${symbol.replace("USDT", "/USDT")} Selecionado`,
        description: `Gráfico de trading carregado para ${symbol.replace("USDT", "")}.`,
      });
    },
    [setSelectedSymbol, setActiveSection, setIsCommandSearchOpen, toast]
  );

  const handleSelectBot = useCallback(
    (bot: BotInstance) => {
      setActiveSection("bot");
      if (bot.symbol && bot.symbol !== "AUTO") {
        setSelectedSymbol(bot.symbol);
      }
      setIsCommandSearchOpen(false);
      toast({
        title: `Robô Selecionado: ${bot.name}`,
        description: `Status: ${bot.status === "in_position" ? "Em Posição" : bot.active ? "Ativo" : "Parado"}.`,
      });
    },
    [setActiveSection, setSelectedSymbol, setIsCommandSearchOpen, toast]
  );

  const handleSyncAccount = useCallback(async () => {
    setIsCommandSearchOpen(false);
    toast({
      title: "Sincronizando Carteira...",
      description: "Consultando saldos e ordens na Binance Spot...",
    });
    try {
      const modeParam = tradingMode === "live" ? "live" : "paper";
      const [accRes, tradesRes] = await Promise.all([
        fetch(`/api/account?mode=${modeParam}`),
        fetch(`/api/trades?mode=${modeParam}`),
      ]);
      const result = await accRes.json();
      const tradesResult = await tradesRes.json();
      if (accRes.ok && result.success && result.data) {
        setAccount(result.data);
        if (tradesResult.success && Array.isArray(tradesResult.data)) {
          setTrades(tradesResult.data);
        }
        toast({
          title: "Sincronização Concluída",
          description: `Carteira atualizada (${tradingMode === "live" ? "Binance Spot" : "Simulado"}).`,
        });
      } else {
        toast({
          title: "Falha na Sincronização",
          description: result.error || "Erro ao consultar saldo.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Erro de Conexão",
        description: e.message || "Falha ao sincronizar.",
        variant: "destructive",
      });
    }
  }, [setIsCommandSearchOpen, toast, tradingMode, setAccount, setTrades]);

  // Lista dos pares mais relevantes do sistema com cotações
  const marketPairs = useMemo(() => {
    const symbols = Object.keys(tickers);
    const defaults = [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
      "BNBUSDT",
      "BATUSDT",
      "AMPUSDT",
      "NEARUSDT",
      "RENDERUSDT",
      "PEPEUSDT",
      "SUIUSDT",
      "AVAXUSDT",
      "FETUSDT",
      "LINKUSDT",
      "ADAUSDT",
      "XRPUSDT",
    ];
    const uniqueSymbols = Array.from(new Set([...defaults, ...symbols])).slice(0, 30);

    return uniqueSymbols.map((sym) => {
      const t = tickers[sym];
      const pos = portfolio.positions?.find((p) => p.symbol === sym);
      return {
        symbol: sym,
        clean: sym.replace("USDT", ""),
        price: t?.price || pos?.marketPrice || 0,
        change: t?.priceChangePercent || 0,
        hasPosition: Boolean(pos && pos.quantity > 0),
        qty: pos?.quantity || 0,
      };
    });
  }, [tickers, portfolio.positions]);

  return (
    <>
      {/* Botão Compacto para Mobile ou quando solicitado */}
      {compactOnly ? (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => setIsCommandSearchOpen(true)}
          className={cn("h-7.5 w-7.5 text-slate-300 hover:text-cyan-400 hover:bg-white/[0.06] rounded-lg shrink-0", className)}
          title="Buscar abas, ferramentas, robôs, ativos (Ctrl+K)"
        >
          <Search className="w-4 h-4" />
        </Button>
      ) : (
        /* Barra de Busca no Header */
        <div className={cn("w-full", className)}>
          <button
            type="button"
            onClick={() => setIsCommandSearchOpen(true)}
            className="w-full h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.09] hover:border-cyan-500/40 text-left flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-all cursor-pointer group shadow-inner focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            title="Buscar abas, ferramentas, robôs, criptomoedas (Atalho: Ctrl+K)"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-cyan-400/80 group-hover:text-cyan-400 transition-colors shrink-0" />
              <span className="truncate text-[11px] text-slate-300">
                Buscar abas, moedas, robôs...
              </span>
            </div>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-mono text-slate-400 bg-white/[0.06] border border-white/[0.1] rounded shrink-0 shadow-sm ml-1.5">
              <span>⌘</span>K
            </kbd>
          </button>
        </div>
      )}

      {/* Modal Spotlight / Command Palette Centralizado */}
      <CommandDialog
        open={isCommandSearchOpen}
        onOpenChange={setIsCommandSearchOpen}
        title="Busca Rápida e Navegação TradeAI"
        description="Digite para encontrar e ir diretamente para qualquer aba, ferramenta, robô ou criptomoeda"
        className="bg-[#0b101a]/95 backdrop-blur-2xl border-white/[0.12] shadow-2xl rounded-2xl max-w-2xl overflow-hidden"
      >
        <CommandInput
          placeholder="O que você deseja acessar? (ex: BAT, robô, gráfico, analista, binance...)"
          value={searchQuery}
          onValueChange={setSearchQuery}
          className="text-sm h-12 text-foreground placeholder:text-muted-foreground/60 border-b border-white/[0.08]"
        />

        <CommandList className="max-h-[440px] overflow-y-auto p-2 scrollbar-thin">
          <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Search className="w-8 h-8 text-slate-600 animate-pulse" />
              <span>Nenhum resultado encontrado para &quot;{searchQuery}&quot;.</span>
              <span className="text-[11px] opacity-70">
                Tente buscar por &quot;Robôs&quot;, &quot;Gráfico&quot;, &quot;BAT&quot;, &quot;Analista&quot; ou &quot;Binance&quot;.
              </span>
            </div>
          </CommandEmpty>

          {/* GRUPO 1: ABAS & NAVEGAÇÃO PRINCIPAL */}
          <CommandGroup heading="🧭 Abas & Navegação Principal">
            <CommandItem
              onSelect={() => handleSelectSection("dashboard", "Painel Principal")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400">
                  <LayoutDashboard className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Painel Principal (Dashboard)
                    {activeSection === "dashboard" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-cyan-500/40 text-cyan-300 bg-cyan-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Visão geral de mercado, carteira, notícias e tickers em tempo real
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 1</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("institutional", "Cockpit Institucional")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
                  <Gauge className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Cockpit Institucional
                    {activeSection === "institutional" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-500/40 text-purple-300 bg-purple-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Livro de ofertas L2, Order Flow Imbalance (OFI), PnL Real-Time e Circuit Breaker
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 8</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("chart", "Gráfico & Trading")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Gráfico & Trading
                    {activeSection === "chart" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Candlesticks TradingView, profundidade de livro e ordens manuais Spot
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 2</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("bot", "Robôs de Lucro")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Robôs de Lucro (Multi-Bot Engine)
                    {activeSection === "bot" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-300 bg-amber-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Frota algorítmica simultânea, Break-Even, Trailing Stop e Saída por IA
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 3</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("trade-hub", "Estúdio Quant & IA")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Estúdio Quant & IA (Trade Hub)
                    {activeSection === "trade-hub" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-indigo-500/40 text-indigo-300 bg-indigo-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    7 Módulos de inteligência e prompts quantitativos com dados da Binance
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 9</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("ai", "Assistente IA")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-400">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Assistente IA
                    {activeSection === "ai" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-rose-500/40 text-rose-300 bg-rose-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Chat preditivo em linguagem natural para analisar tokens e cenários
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 4</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("history", "Histórico & Ordens")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Histórico & Ordens
                    {activeSection === "history" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/40 text-blue-300 bg-blue-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Registro de execuções de compra e venda, PnL fechado e relatórios
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 5</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("backtest", "Backtesting")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-teal-500/10 text-teal-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Backtesting Quantitativo
                    {activeSection === "backtest" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-teal-500/40 text-teal-300 bg-teal-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Simulação histórica avançada de estratégias com fricção e taxas reais
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 6</kbd>
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectSection("education", "Academia Cripto")}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-orange-500/10 text-orange-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Academia Cripto
                    {activeSection === "education" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/40 text-orange-300 bg-orange-500/10">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Manuais de trading algorítmico institucional, gestão de risco e glossário
                  </div>
                </div>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-white/[0.05]">Atalho 7</kbd>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="my-2 bg-white/[0.08]" />

          {/* GRUPO 2: MÓDULOS ESPECÍFICOS DO ESTÚDIO QUANT */}
          <CommandGroup heading="⚡ Ferramentas do Estúdio Quant (Trade Hub)">
            <CommandItem
              onSelect={() => handleSelectTradeHubModule("ideas", "Ideias de Troca")}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-foreground">Ideias de Troca</span>
                <span className="text-[10px] text-muted-foreground">· 5 setups de alta probabilidade calculados</span>
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectTradeHubModule("analyst", "Analista Técnico")}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <LineChart className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-foreground">Analista Técnico</span>
                <span className="text-[10px] text-muted-foreground">· Níveis de suporte/resistência e tendências D1/W1</span>
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectTradeHubModule("news", "Notícias para Negócios")}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <Newspaper className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-foreground">Notícias p/ Negócios</span>
                <span className="text-[10px] text-muted-foreground">· Impacto de sentimento e fatos relevantes em tempo real</span>
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectTradeHubModule("backtest", "Teste de Estratégia")}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-medium text-foreground">Teste de Estratégia</span>
                <span className="text-[10px] text-muted-foreground">· Simulação rápida de Win Rate e Profit Factor</span>
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectTradeHubModule("risk", "Gestor de Risco")}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-xs font-medium text-foreground">Gestor de Risco</span>
                <span className="text-[10px] text-muted-foreground">· Stress test de carteira, drawdown e dimensionamento</span>
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectTradeHubModule("journal", "Diário de Negociação")}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <BookOpenCheck className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-foreground">Diário de Negociação</span>
                <span className="text-[10px] text-muted-foreground">· Auditoria dos últimos trades e regras operacionais</span>
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
            </CommandItem>

            <CommandItem
              onSelect={() => handleSelectTradeHubModule("plan", "Plano Diário")}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium text-foreground">Plano Diário</span>
                <span className="text-[10px] text-muted-foreground">· Checklist institucional com horários de maior liquidez</span>
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="my-2 bg-white/[0.08]" />

          {/* GRUPO 3: ROBÔS CONFIGURADOS NA SUA FROTA */}
          <CommandGroup heading={`🤖 Robôs Cadastrados (${bots.length})`}>
            {bots.map((bot) => {
              const isInPos = Boolean(bot.position && bot.position.quantity > 0);
              const statusBadge = isInPos
                ? { label: "Em Posição", color: "border-purple-500/40 text-purple-300 bg-purple-500/10" }
                : bot.active
                ? { label: "Ativo", color: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" }
                : { label: "Parado", color: "border-slate-500/40 text-slate-400 bg-slate-500/10" };

              return (
                <CommandItem
                  key={bot.id}
                  onSelect={() => handleSelectBot(bot)}
                  className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Bot className={cn("w-4 h-4 shrink-0", bot.active ? "text-cyan-400" : "text-slate-500")} />
                    <div className="truncate">
                      <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                        {bot.name}
                        <Badge variant="outline" className={cn("text-[9px] px-1 py-0", statusBadge.color)}>
                          {statusBadge.label}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {bot.symbol.replace("USDT", "")} · Estratégia: {bot.strategy}
                        {isInPos && ` · ${bot.position?.quantity} unidades sob custódia`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={cn("text-xs font-bold font-mono", bot.stats.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {bot.stats.realizedPnl >= 0 ? "+" : ""}${formatPrice(bot.stats.realizedPnl)}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator className="my-2 bg-white/[0.08]" />

          {/* GRUPO 4: CRIPTOMOEDAS & MERCADO BINANCE */}
          <CommandGroup heading="💰 Criptomoedas & Mercado Binance (Spot)">
            {marketPairs.map((c) => {
              const isSelected = selectedSymbol === c.symbol;
              const isPos = c.change >= 0;

              return (
                <CommandItem
                  key={c.symbol}
                  onSelect={() => handleSelectCrypto(c.symbol)}
                  className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-white/[0.06] flex items-center justify-center font-bold text-[10px] text-slate-300">
                      {c.clean.slice(0, 3)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        {c.clean}/USDT
                        {c.hasPosition && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-300 bg-amber-500/10">
                            Em Carteira ({c.qty.toFixed(2)})
                          </Badge>
                        )}
                        {isSelected && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-cyan-500/40 text-cyan-300 bg-cyan-500/10">
                            Ativo no Gráfico
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold font-mono text-slate-200">
                      ${formatPrice(c.price)}
                    </div>
                    <div className={cn("text-[10px] font-mono font-medium flex items-center justify-end gap-0.5", isPos ? "text-emerald-400" : "text-rose-400")}>
                      {isPos ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {isPos ? "+" : ""}{c.change.toFixed(2)}%
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator className="my-2 bg-white/[0.08]" />

          {/* GRUPO 5: CONFIGURAÇÕES & AÇÕES RÁPIDAS */}
          <CommandGroup heading="⚙️ Ações Rápidas & Configurações">
            <CommandItem
              onSelect={() => {
                setIsCommandSearchOpen(false);
                if (onOpenApiDialog) {
                  onOpenApiDialog();
                } else {
                  setOpenApiSettingsModal(true);
                }
              }}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-medium text-foreground">Configurar Chaves de API da Binance</span>
              </div>
              <Badge variant="outline" className="text-[9px] border-white/[0.1] text-slate-400">API Key & Secret</Badge>
            </CommandItem>

            <CommandItem
              onSelect={() => {
                setIsCommandSearchOpen(false);
                if (onOpenAiDialog) {
                  onOpenAiDialog();
                } else {
                  setOpenAiSettingsModal(true);
                }
              }}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-medium text-foreground">Configurar Provedores de IA</span>
              </div>
              <Badge variant="outline" className="text-[9px] border-white/[0.1] text-slate-400">Gemini / OpenAI / DeepSeek</Badge>
            </CommandItem>

            <CommandItem
              onSelect={handleSyncAccount}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium text-foreground">Sincronizar Saldo & Carteira com a Binance</span>
              </div>
              <Badge variant="outline" className="text-[9px] border-white/[0.1] text-slate-400">Atualizar</Badge>
            </CommandItem>

            <CommandItem
              onSelect={() => {
                setIsCommandSearchOpen(false);
                setActiveSection("bot");
                setOpenBotCreateModal(true);
              }}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-medium text-foreground">Criar Novo Robô de Lucro</span>
              </div>
              <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">Novo Bot</Badge>
            </CommandItem>

            <CommandItem
              onSelect={() => {
                setIsCommandSearchOpen(false);
                setTradingMode(tradingMode === "live" ? "paper" : "live");
                toast({
                  title: `Modo Alterado: ${tradingMode === "live" ? "Simulado (Paper)" : "Real (Spot Binance)"}`,
                  description: "Ambiente de operação atualizado.",
                });
              }}
              className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium text-foreground">
                  Alternar Modo de Operação (Atual: {tradingMode === "live" ? "Conta Real" : "Simulado"})
                </span>
              </div>
              <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-400 bg-cyan-500/10">Alternar</Badge>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
