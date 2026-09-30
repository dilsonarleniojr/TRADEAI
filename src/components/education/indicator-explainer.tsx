"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Info, Sparkles, TrendingUp, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ExplainerDetails {
  name: string;
  description: string;
  scenarios: {
    id: string;
    name: string;
    description: string;
    signalType: "BUY" | "SELL" | "NONE";
    chartPath: string;
    auxPath?: string;
    highlights?: { cx: number; cy: number; color: string; label: string }[];
  }[];
}

const INDICATORS: Record<string, ExplainerDetails> = {
  RSI: {
    name: "RSI (Índice de Força Relativa)",
    description: "Oscilador de momento que varia de 0 a 100. É calculado monitorando a velocidade e a magnitude de ganhos versus perdas recentes de preço.",
    scenarios: [
      {
        id: "oversold",
        name: "🔵 Sobrevenda (RSI < 30)",
        description: "O preço caiu muito rapidamente de forma insustentável. O indicador entra na zona abaixo de 30, sugerindo exaustão vendedora e uma possível reversão de alta iminente. Sinal clássico de compra.",
        signalType: "BUY",
        chartPath: "M 10 70 Q 30 80 50 85 T 90 95 T 130 92 T 170 50 T 210 40",
        auxPath: "M 10 92 C 50 95, 90 98, 130 91 T 170 45 T 210 32", // RSI line
        highlights: [{ cx: 130, cy: 91, color: "#10b981", label: "Compra (RSI < 30)" }],
      },
      {
        id: "overbought",
        name: "🔴 Sobrecompra (RSI > 70)",
        description: "O preço subiu agressivamente e o indicador entra na zona superior a 70. Sugere euforia e exaustão compradora, indicando que o preço está 'caro' no curto prazo e sujeito a correções ou vendas.",
        signalType: "SELL",
        chartPath: "M 10 40 Q 30 20 50 15 T 90 8 T 130 10 T 170 60 T 210 70",
        auxPath: "M 10 35 C 50 12, 90 9, 130 10 T 170 68 T 210 75", // RSI line
        highlights: [{ cx: 130, cy: 10, color: "#ef4444", label: "Venda (RSI > 70)" }],
      },
    ],
  },
  BB: {
    name: "Bandas de Bollinger (20, 2)",
    description: "Conjunto de linhas traçadas com base no desvio padrão (volatilidade) em torno de uma média móvel simples (SMA). Conforme a volatilidade espreme, as bandas se estreitam, antecedendo grandes explosões de preço.",
    scenarios: [
      {
        id: "squeeze",
        name: "⚡ Bollinger Squeeze",
        description: "As bandas superior e inferior se estreitam drasticamente devido à baixa volatilidade. Indica acúmulo de energia no mercado e antecede um forte rompimento de preço para qualquer uma das direções.",
        signalType: "NONE",
        chartPath: "M 10 50 Q 50 48 90 52 T 170 50 T 210 50", // Média
        auxPath: "Squeeze", // Custom render flag
        highlights: [{ cx: 130, cy: 50, color: "#06b6d4", label: "Espremimento" }],
      },
      {
        id: "lower_touch",
        name: "🟢 Toque na Banda Inferior",
        description: "O preço cai e toca ou ultrapassa a banda inferior de Bollinger. Como o preço está a mais de 2 desvios padrões abaixo da média, isso representa uma condição de sobrevenda estatística. Sinal de compra estatística.",
        signalType: "BUY",
        chartPath: "M 10 40 Q 50 35 90 70 T 170 85 T 210 50", // Preço
        highlights: [{ cx: 170, cy: 85, color: "#10b981", label: "Toque Inferior" }],
      },
    ],
  },
  MACD: {
    name: "MACD (Média Móvel Convergência/Divergência)",
    description: "Composto pela linha MACD (diferença entre EMAs 12 e 26), a Linha de Sinal (EMA 9 do MACD) e o Histograma (diferença entre as duas linhas). Identifica impulsos de tendência.",
    scenarios: [
      {
        id: "bullish_cross",
        name: "🟢 Cruzamento de Alta",
        description: "A linha MACD cruza de baixo para cima a Linha de Sinal. Indica aceleração no ímpeto comprador do mercado e marca o início de uma nova tendência de alta. Forte sinal de compra.",
        signalType: "BUY",
        chartPath: "BullCross", // Custom MACD render flag
        highlights: [{ cx: 110, cy: 50, color: "#10b981", label: "Golden Cross" }],
      },
      {
        id: "bearish_cross",
        name: "🔴 Cruzamento de Baixa",
        description: "A linha MACD cruza de cima para baixo a Linha de Sinal, sugerindo enfraquecimento dos touros e força dos ursos. Sinal claro de venda ou proteção de capital.",
        signalType: "SELL",
        chartPath: "BearCross", // Custom MACD render flag
        highlights: [{ cx: 110, cy: 50, color: "#ef4444", label: "Death Cross" }],
      },
    ],
  },
};

export function IndicatorExplainer() {
  const [activeInd, setActiveInd] = useState<"RSI" | "BB" | "MACD">("RSI");
  const [activeScenId, setActiveScenId] = useState("oversold");

  const indicator = INDICATORS[activeInd];
  const scenario = indicator.scenarios.find((s) => s.id === activeScenId) || indicator.scenarios[0];

  const handleIndicatorChange = (indKey: "RSI" | "BB" | "MACD") => {
    setActiveInd(indKey);
    setActiveScenId(INDICATORS[indKey].scenarios[0].id);
  };

  const renderVisualChart = () => {
    const width = 220;
    const height = 110;

    // RSI specific visualization
    if (activeInd === "RSI") {
      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="bg-secondary/10 border border-border/30 rounded-lg p-1 select-none">
          {/* Boundary lines */}
          <line x1="0" y1="30" x2={width} y2="30" stroke="#ef4444" strokeDasharray="3,3" strokeOpacity="0.4" />
          <text x="5" y="25" fill="#ef4444" fontSize="7" opacity="0.6" fontFamily="sans-serif">70 - Sobrecompra</text>
          
          <line x1="0" y1="80" x2={width} y2="80" stroke="#10b981" strokeDasharray="3,3" strokeOpacity="0.4" />
          <text x="5" y="76" fill="#10b981" fontSize="7" opacity="0.6" fontFamily="sans-serif">30 - Sobrevenda</text>

          {/* Shaded zone between 30 and 70 */}
          <rect x="0" y="30" width={width} height="50" fill="oklch(0.75 0.15 195 / 3%)" />

          {/* Price Path */}
          <path d={scenario.chartPath} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
          
          {/* RSI indicator line */}
          <path d={scenario.auxPath || ""} fill="none" stroke="oklch(0.75 0.15 195)" strokeWidth="2" />

          {/* Highlights */}
          {scenario.highlights?.map((h, i) => (
            <g key={i}>
              <circle cx={h.cx} cy={h.cy} r="4" fill={h.color} className="animate-ping" style={{ transformOrigin: `${h.cx}px ${h.cy}px` }} />
              <circle cx={h.cx} cy={h.cy} r="3" fill={h.color} />
              <text x={h.cx - 20} y={h.cy - 10} fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">
                {h.label}
              </text>
            </g>
          ))}
        </svg>
      );
    }

    // Bollinger Bands specific visualization
    if (activeInd === "BB") {
      const isSqueeze = scenario.id === "squeeze";
      
      const upperPath = isSqueeze
        ? "M 10 25 C 50 35, 90 40, 130 40 T 170 35 T 210 25"
        : "M 10 15 C 50 15, 90 40, 130 50 T 170 55 T 210 25";
      const lowerPath = isSqueeze
        ? "M 10 75 C 50 65, 90 60, 130 60 T 170 65 T 210 75"
        : "M 10 65 C 50 55, 90 100, 130 110 T 170 115 T 210 75";
      const mediaPath = "M 10 50 C 50 50, 90 70, 130 80 T 170 85 T 210 50";

      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="bg-secondary/10 border border-border/30 rounded-lg p-1 select-none">
          {/* Bollinger Shading */}
          <path d={`${upperPath} L 210 75 Q 170 65 130 60 T 10 75 Z`} fill="rgba(6,182,212,0.03)" />

          {/* Upper Band */}
          <path d={upperPath} fill="none" stroke="rgba(6,182,212,0.4)" strokeWidth="1" strokeDasharray="2,2" />
          {/* Lower Band */}
          <path d={lowerPath} fill="none" stroke="rgba(6,182,212,0.4)" strokeWidth="1" strokeDasharray="2,2" />

          {/* Middle average line */}
          <path d={mediaPath} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

          {/* Real Price curve */}
          <path d={isSqueeze ? "M 10 48 Q 50 50 90 49 T 130 51 T 170 50 T 210 48" : scenario.chartPath} fill="none" stroke="oklch(0.75 0.15 195)" strokeWidth="2" />

          {/* Highlights */}
          {scenario.highlights?.map((h, i) => (
            <g key={i}>
              <circle cx={h.cx} cy={h.cy} r="4" fill={h.color} className="animate-ping" style={{ transformOrigin: `${h.cx}px ${h.cy}px` }} />
              <circle cx={h.cx} cy={h.cy} r="3" fill={h.color} />
              <text x={h.cx - 20} y={h.cy - 10} fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">
                {h.label}
              </text>
            </g>
          ))}
        </svg>
      );
    }

    // MACD visualization
    if (activeInd === "MACD") {
      const isBull = scenario.id === "bullish_cross";
      
      const macdPath = isBull
        ? "M 10 70 Q 50 80 90 60 T 130 30 T 210 15"
        : "M 10 30 Q 50 20 90 40 T 130 70 T 210 85";
      const signalPath = isBull
        ? "M 10 80 Q 50 85 90 70 T 130 45 T 210 20"
        : "M 10 20 Q 50 15 90 30 T 130 55 T 210 78";

      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="bg-secondary/10 border border-border/30 rounded-lg p-1 select-none">
          {/* Zero line */}
          <line x1="0" y1="50" x2={width} y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

          {/* Histogram bar boxes */}
          {Array.from({ length: 20 }, (_, i) => {
            const x = 15 + i * 10;
            const centerDiff = isBull ? (i - 10) * 3 : (10 - i) * 3;
            const barHeight = Math.max(2, Math.abs(centerDiff));
            const y = centerDiff >= 0 ? 50 - barHeight : 50;
            const fill = centerDiff >= 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)";
            return (
              <rect key={i} x={x} y={y} width="6" height={barHeight} fill={fill} rx="1" />
            );
          })}

          {/* MACD line (Blue) */}
          <path d={macdPath} fill="none" stroke="#00d2ff" strokeWidth="1.8" />
          
          {/* Signal line (Orange) */}
          <path d={signalPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" />

          {/* Highlights */}
          {scenario.highlights?.map((h, i) => (
            <g key={i}>
              <circle cx={h.cx} cy={h.cy} r="4" fill={h.color} className="animate-ping" style={{ transformOrigin: `${h.cx}px ${h.cy}px` }} />
              <circle cx={h.cx} cy={h.cy} r="3" fill={h.color} />
              <text x={h.cx - 20} y={h.cy - 10} fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">
                {h.label}
              </text>
            </g>
          ))}
        </svg>
      );
    }

    return null;
  };

  return (
    <Card className="glass-card gradient-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4 text-crypto-cyan animate-pulse" />
            Explicação Visual de Indicadores
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Indicator selection tabs */}
        <div className="flex gap-2">
          {Object.keys(INDICATORS).map((key) => (
            <Button
              key={key}
              variant={activeInd === key ? "default" : "outline"}
              size="sm"
              onClick={() => handleIndicatorChange(key as any)}
              className={cn(
                "flex-1 h-9 text-xs border-border/50 transition-all duration-200 cursor-pointer",
                activeInd === key
                  ? "bg-crypto-cyan/20 text-crypto-cyan border-crypto-cyan/35 font-semibold"
                  : "text-muted-foreground hover:bg-secondary/40"
              )}
            >
              {key}
            </Button>
          ))}
        </div>

        {/* Dynamic content splits */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Visual Panel */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div className="w-[230px] h-[120px] shrink-0">
              {renderVisualChart()}
            </div>
            <div className="flex justify-between w-[220px] text-[8px] text-muted-foreground mt-1.5 font-mono">
              <span>Linha Azul: {activeInd === "MACD" ? "MACD" : "Preço"}</span>
              <span>Linha Laranja: {activeInd === "MACD" ? "Signal" : activeInd === "RSI" ? "RSI" : "Bandas"}</span>
            </div>
          </div>

          {/* Explanation Panel */}
          <div className="md:col-span-7 space-y-3.5">
            <div>
              <h4 className="text-xs font-bold text-foreground">{indicator.name}</h4>
              <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">
                {indicator.description}
              </p>
            </div>

            {/* Scenario Toggles */}
            <div className="space-y-2">
              <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block">Selecione o Cenário de Mercado</span>
              <div className="flex gap-2">
                {indicator.scenarios.map((scen) => (
                  <Button
                    key={scen.id}
                    variant={activeScenId === scen.id ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setActiveScenId(scen.id)}
                    className={cn(
                      "flex-1 h-8 text-[10px] px-2 border-border/40 font-medium cursor-pointer",
                      activeScenId === scen.id ? "bg-secondary/80 text-foreground" : "text-muted-foreground hover:bg-secondary/30"
                    )}
                  >
                    {scen.name.split(" ")[0]} {scen.name.replace(/^[^a-zA-Záàâãéèêíïóôõöúç]+/, "")}
                  </Button>
                ))}
              </div>
            </div>

            {/* Scenario explanation */}
            <div className="p-3 rounded-lg bg-secondary/15 border border-border/30 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-[11px]">Explicação do Cenário</span>
                {scenario.signalType !== "NONE" && (
                  <Badge className={cn(
                    "text-[8px] uppercase tracking-wide border-none px-1.5 py-0.5",
                    scenario.signalType === "BUY" ? "bg-crypto-green/15 text-crypto-green" : "bg-crypto-red/15 text-crypto-red"
                  )}>
                    Sinal: {scenario.signalType === "BUY" ? "Compra" : "Venda"}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {scenario.description}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
