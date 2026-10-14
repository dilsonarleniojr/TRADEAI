"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCryptoStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Zap,
  Clock,
  TrendingDown,
  Layers,
  DollarSign,
  AlertTriangle,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Activity,
  Percent,
  Gauge,
} from "lucide-react";
import { riskManager, type ProtectionSettings, type FillRateTelemetry } from "@/lib/bot/risk-manager";

interface ProtectionSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProtectionSettingsDialog({
  open,
  onOpenChange,
}: ProtectionSettingsDialogProps) {
  const { toast } = useToast();
  const protectionSettings = useCryptoStore((s) => s.protectionSettings);
  const updateProtectionSettings = useCryptoStore((s) => s.updateProtectionSettings);
  const resetProtectionSettings = useCryptoStore((s) => s.resetProtectionSettings);

  const [fillTelemetry, setFillTelemetry] = useState<FillRateTelemetry>(() => riskManager.getFillRateTelemetry());

  React.useEffect(() => {
    const handleUpdate = () => {
      setFillTelemetry(riskManager.getFillRateTelemetry());
    };
    if (open) {
      handleUpdate();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("tradeai_fill_telemetry_updated", handleUpdate);
      return () => window.removeEventListener("tradeai_fill_telemetry_updated", handleUpdate);
    }
  }, [open]);

  const activeCount = Object.entries(protectionSettings || {}).filter(
    ([key, value]) => typeof value === "boolean" && value === true
  ).length;

  const totalBooleanProtections = 10;
  const isFullyProtected = activeCount >= totalBooleanProtections;

  const handleToggle = (key: keyof ProtectionSettings, currentVal: boolean) => {
    updateProtectionSettings({ [key]: !currentVal });
    toast({
      title: !currentVal ? "Proteção Ativada" : "Proteção Desativada",
      description: `O modo de proteção foi ${!currentVal ? "ativado" : "desativado"} com sucesso.`,
    });
  };

  const handlePresetInstitutional = () => {
    updateProtectionSettings({
      dailyDrawdownProtection: true,
      maxDailyDrawdownPct: 0.03,
      consecutiveLossProtection: true,
      maxConsecutiveLosses: 3,
      consecutiveLossCooldownMinutes: 60,
      operationalViabilityFilter: true,
      minNetRewardRiskRatio: 1.50,
      fractionalRiskSizing: true,
      maxRiskPerTradePct: 0.01,
      dynamicBreakEven: true,
      breakEvenFeeBufferPct: 0.35,
      postOnlyMakerOrders: true,
      restingOrderTimeout: true,
      restingOrderTimeoutSeconds: 60,
      btcMacroFilter: true,
      crossCorrelationFilter: true,
      dynamicMakerRepricing: true,
      repricingTimeoutSeconds: 30,
      minFillRateThreshold: 40,
    });
    toast({
      title: "🛡️ Preset Institucional Aplicado",
      description: "Todos os 10 modos de proteção de capital foram ativados com parâmetros estritos.",
    });
  };

  const handlePresetAggressive = () => {
    updateProtectionSettings({
      dailyDrawdownProtection: true, // Mantém trava diária de emergência
      maxDailyDrawdownPct: 0.05,
      consecutiveLossProtection: false, // Desativa cooldown de perdas
      operationalViabilityFilter: false, // Permite entradas mais flexíveis
      fractionalRiskSizing: false, // Permite alocação estática completa
      dynamicBreakEven: true,
      breakEvenFeeBufferPct: 0.25,
      postOnlyMakerOrders: false, // Permite ordens a mercado imediatas (taker)
      restingOrderTimeout: false,
      btcMacroFilter: false, // Ignora quedas do Bitcoin
      crossCorrelationFilter: false,
      dynamicMakerRepricing: false,
    });
    toast({
      title: "⚡ Preset Agressivo / Scalper Aplicado",
      description: "Filtros restritivos foram desligados para maior frequência de ordens.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-card border-border/80 shadow-2xl">
        <DialogHeader className="space-y-2 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${isFullyProtected ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                {isFullyProtected ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  Governança & Modos de Proteção
                  <Badge
                    variant="outline"
                    className={`text-xs px-2 py-0.5 ${
                      isFullyProtected
                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                        : "border-amber-500/30 text-amber-400 bg-amber-500/10"
                    }`}
                  >
                    {activeCount}/{totalBooleanProtections} Ativas
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Ative ou desative individualmente os guardrails matemáticos, circuit breakers e travas de execução da frota.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Quick Presets Bar */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 border border-border/60">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">
            Presets Rápidos:
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePresetInstitutional}
              className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-semibold cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Institucional (Recomendado)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePresetAggressive}
              className="h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-semibold cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 mr-1 text-amber-400" />
              Agressivo / Scalper
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetProtectionSettings();
                toast({
                  title: "Padrões Restaurados",
                  description: "Os modos de proteção voltaram aos valores de fábrica.",
                });
              }}
              className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              title="Restaurar configurações padrão"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>
        </div>

        {/* Protection Groups */}
        <div className="space-y-4 pt-2">
          {/* GRUPO 1: Circuit Breakers de Carteira */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-crypto-red" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Pilar 1: Circuit Breakers & Travas de Capital (Kill Switch)
              </h3>
            </div>

            {/* 1.1 Daily Drawdown Kill Switch */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Trava de Perda Diária Máxima (Drawdown ≤ 3.0%)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.dailyDrawdownProtection
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-muted-foreground border-border/40"
                    }`}
                  >
                    {protectionSettings.dailyDrawdownProtection ? "Ativa" : "Desativada"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pausa automaticamente a frota e inicia hibernação de 24 horas se as perdas acumuladas no dia ultrapassarem 3.0% do NAV total. Protege contra dias atípicos de cisne negro.
                </p>
              </div>
              <Switch
                checked={protectionSettings.dailyDrawdownProtection}
                onCheckedChange={() => handleToggle("dailyDrawdownProtection", protectionSettings.dailyDrawdownProtection)}
                className="mt-1"
              />
            </div>

            {/* 1.2 Consecutive Loss Brake */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Freio de Perdas Consecutivas (Consecutive Loss Brake)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.consecutiveLossProtection
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-muted-foreground border-border/40"
                    }`}
                  >
                    {protectionSettings.consecutiveLossProtection ? "Ativo (3 derrotas)" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Aciona um cooldown compulsório de 60 minutos caso a frota sofra 3 perdas consecutivas, blindando a banca contra mercados laterais sem tendência (*choppy market*).
                </p>
              </div>
              <Switch
                checked={protectionSettings.consecutiveLossProtection}
                onCheckedChange={() => handleToggle("consecutiveLossProtection", protectionSettings.consecutiveLossProtection)}
                className="mt-1"
              />
            </div>
          </div>

          {/* GRUPO 2: Gestão de Risco & Dimensionamento por Trade */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-crypto-green" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Pilar 2: Gestão de Risco & Dimensionamento por Trade
              </h3>
            </div>

            {/* 2.1 Fractional Risk Sizing */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Dimensionamento Fracionário por Risco Técnico (≤ 1.0% Banca)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.fractionalRiskSizing
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    {protectionSettings.fractionalRiskSizing ? "Ativo (≤ 1.0% NAV)" : "Estático / Livre"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Calcula o lote exato com base na distância até o Stop Loss (fórmula de risco fracionário). Se desativado, o robô opera com alocação estática simples sem limitar a perda financeira a 1% da banca.
                </p>
              </div>
              <Switch
                checked={protectionSettings.fractionalRiskSizing}
                onCheckedChange={() => handleToggle("fractionalRiskSizing", protectionSettings.fractionalRiskSizing)}
                className="mt-1"
              />
            </div>

            {/* 2.2 Operational Viability Filter */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Filtro de Viabilidade Operacional (R:R Líquido ≥ 1:1.50)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.operationalViabilityFilter
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    {protectionSettings.operationalViabilityFilter ? "Ativo (≥ 1.50x)" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Deduz taxas de corretagem da Binance e slippage projetado antes de entrar. Rejeita setups onde o lucro líquido projetado seja insuficiente frente ao risco real corrido.
                </p>
              </div>
              <Switch
                checked={protectionSettings.operationalViabilityFilter}
                onCheckedChange={() => handleToggle("operationalViabilityFilter", protectionSettings.operationalViabilityFilter)}
                className="mt-1"
              />
            </div>

            {/* 2.3 Dynamic Break-Even 1R */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Break-Even Dinâmico em 1R (Buffer de Proteção de Taxas +0.35%)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.dynamicBreakEven
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-muted-foreground border-border/40"
                    }`}
                  >
                    {protectionSettings.dynamicBreakEven ? "Ativo (+0.35% buffer)" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Ao atingir 1R de valorização (1x o risco inicial), desloca compulsoriamente o Stop Loss para +0.35% acima da entrada, transformando o trade em risco zero com lucro garantido mesmo se o preço recuar.
                </p>
              </div>
              <Switch
                checked={protectionSettings.dynamicBreakEven}
                onCheckedChange={() => handleToggle("dynamicBreakEven", protectionSettings.dynamicBreakEven)}
                className="mt-1"
              />
            </div>
          </div>

          {/* GRUPO 3: Microestrutura de Mercado & Execução */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-crypto-cyan" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Pilar 3: Microestrutura de Mercado & Execução de Ordens
              </h3>
            </div>

            {/* 3.1 Post-Only LIMIT_MAKER Orders */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Ordens Post-Only LIMIT_MAKER (Zero Taker Fee & Zero Slippage)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.postOnlyMakerOrders
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    {protectionSettings.postOnlyMakerOrders ? "LIMIT_MAKER (bestBid)" : "MARKET (Taker Imediato)"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Apregoa a ordem de compra diretamente no melhor preço de compra do livro (*bestBid*), garantindo status de Maker (taxa reduzida) e eliminando 100% de derrapagem adversa. Se desligado, executa ordens a mercado instantâneas.
                </p>
              </div>
              <Switch
                checked={protectionSettings.postOnlyMakerOrders}
                onCheckedChange={() => handleToggle("postOnlyMakerOrders", protectionSettings.postOnlyMakerOrders)}
                className="mt-1"
              />
            </div>

            {/* 3.2 Telemetria de Preenchimento (Fill-Rate Telemetry) Card */}
            <div className="p-3 rounded-lg bg-background/70 border border-crypto-cyan/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-crypto-cyan" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Telemetria de Preenchimento (Fill-Rate LIMIT_MAKER)
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${
                    fillTelemetry.isExtremeVolatility
                      ? "text-red-400 border-red-500/30 bg-red-500/10 animate-pulse"
                      : fillTelemetry.fillRatePct >= 70
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                  }`}
                >
                  {fillTelemetry.isExtremeVolatility
                    ? `⚠️ Volatilidade Extrema (${fillTelemetry.recentFillRatePct}%)`
                    : `Fill-Rate: ${fillTelemetry.fillRatePct}%`}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px] pt-1">
                <div className="p-1.5 rounded bg-muted/30">
                  <div className="text-muted-foreground">Total Ordens</div>
                  <div className="font-bold font-mono text-foreground">{fillTelemetry.totalMakerOrders}</div>
                </div>
                <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400">Preenchidas</div>
                  <div className="font-bold font-mono text-emerald-400">{fillTelemetry.filledMakerOrders}</div>
                </div>
                <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                  <div className="text-amber-400">Repriced (+1 tick)</div>
                  <div className="font-bold font-mono text-amber-400">{fillTelemetry.repricedMakerOrders}</div>
                </div>
                <div className="p-1.5 rounded bg-red-500/10 border border-red-500/20">
                  <div className="text-red-400">Canceladas (60s)</div>
                  <div className="font-bold font-mono text-red-400">{fillTelemetry.cancelledMakerOrders}</div>
                </div>
              </div>
            </div>

            {/* 3.3 Dynamic 1-Tick Repricing aos 30s */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Repricing Dinâmico de 1 Tick (30s se Fill-Rate &lt; 40%)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.dynamicMakerRepricing
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-muted-foreground border-border/40"
                    }`}
                  >
                    {protectionSettings.dynamicMakerRepricing ? "Ativo (30s / Fill < 40%)" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Caso o mercado apresente momentos de volatilidade extrema onde o preenchimento no *bestBid* caia abaixo de 40%, ajusta a ordem em +1 tick após 30 segundos mantendo status passivo Maker, antes de efetuar o cancelamento definitivo aos 60 segundos.
                </p>
              </div>
              <Switch
                checked={protectionSettings.dynamicMakerRepricing}
                onCheckedChange={() => handleToggle("dynamicMakerRepricing", protectionSettings.dynamicMakerRepricing)}
                className="mt-1"
              />
            </div>

            {/* 3.4 Resting Order Timeout */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Cancelamento Automático de Ordens Órfãs (Timeout 60s)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.restingOrderTimeout
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-muted-foreground border-border/40"
                    }`}
                  >
                    {protectionSettings.restingOrderTimeout ? "Ativo (60 segundos)" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Cancela automaticamente ordens limitadas não executadas após 60 segundos no livro de ofertas da Binance, evitando capital travado e prevenindo preenchimentos tardios em momentos de reversão de preço.
                </p>
              </div>
              <Switch
                checked={protectionSettings.restingOrderTimeout}
                onCheckedChange={() => handleToggle("restingOrderTimeout", protectionSettings.restingOrderTimeout)}
                className="mt-1"
              />
            </div>
          </div>

          {/* GRUPO 4: Filtros Macro & Correlação Sistêmica */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Pilar 4: Filtros Macro & Correlação Sistêmica
              </h3>
            </div>

            {/* 4.1 BTC Macro Gatekeeper */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Filtro Direcional Macro Bitcoin (BTC Gatekeeper)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.btcMacroFilter
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-muted-foreground border-border/40"
                    }`}
                  >
                    {protectionSettings.btcMacroFilter ? "Ativo (Bloqueio ≤ -2.5%)" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Bloqueia novas compras em altcoins caso o Bitcoin esteja em queda acentuada (≤ -2.5% em 24h ou quebra da EMA no 5m), prevenindo despejos em cascata generalizados.
                </p>
              </div>
              <Switch
                checked={protectionSettings.btcMacroFilter}
                onCheckedChange={() => handleToggle("btcMacroFilter", protectionSettings.btcMacroFilter)}
                className="mt-1"
              />
            </div>

            {/* 4.2 Cross Correlation Filter */}
            <div className="flex items-start justify-between gap-4 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Filtro de Descorrelação de Risco (Beta r &gt; 0.85)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      protectionSettings.crossCorrelationFilter
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-muted-foreground border-border/40"
                    }`}
                  >
                    {protectionSettings.crossCorrelationFilter ? "Ativo (Filtro r > 0.85)" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Penaliza pares hiper-correlacionados com o mercado amplo (r &gt; 0.85), priorizando ativos com fluxo descorrelacionado e força compradora independente.
                </p>
              </div>
              <Switch
                checked={protectionSettings.crossCorrelationFilter}
                onCheckedChange={() => handleToggle("crossCorrelationFilter", protectionSettings.crossCorrelationFilter)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 sm:justify-between items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Configurações persistidas em tempo real no motor de execução.</span>
          </div>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Concluído
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
