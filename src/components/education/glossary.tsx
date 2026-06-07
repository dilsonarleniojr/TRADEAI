"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, BookOpen, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlossaryItem {
  term: string;
  category: "Geral" | "Indicadores" | "Risco" | "Trading";
  definition: string;
  example: string;
  formula?: string;
}

const GLOSSARY_ITEMS: GlossaryItem[] = [
  {
    term: "WAC (Preço Médio Ponderado)",
    category: "Trading",
    definition: "Weighted Average Cost. É o custo médio de aquisição de um ativo, calculado ponderando-se a quantidade comprada por cada preço de compra. É atualizado a cada nova compra e reajustado proporcionalmente nas vendas.",
    example: "Se você compra 1 BTC a $60.000 e depois 1 BTC a $80.000, seu WAC (Preço Médio) é $70.000.",
    formula: "WAC = (Soma de (Quantidade × Preço)) / Quantidade Total",
  },
  {
    term: "Sharpe Ratio",
    category: "Risco",
    definition: "Métrica que avalia o retorno de um investimento em relação ao seu risco (volatilidade). Quanto maior o Sharpe Ratio, melhor o retorno ajustado ao risco obtido pela estratégia.",
    example: "Um Sharpe Ratio > 1.0 é considerado bom, > 2.0 é excelente e > 3.0 é excepcional.",
    formula: "Sharpe = (Retorno do Portfólio - Retorno Livre de Risco) / Desvio Padrão dos Retornos",
  },
  {
    term: "Sortino Ratio",
    category: "Risco",
    definition: "Similar ao Sharpe Ratio, mas penaliza apenas a volatilidade negativa (queda), ignorando a volatilidade positiva (subida). Útil porque volatilidade para cima é desejável.",
    example: "Um Sortino de 1.5 indica que a estratégia gera bons retornos sem expor o usuário a quedas descontroladas.",
    formula: "Sortino = (Retorno do Portfólio - Retorno Livre de Risco) / Desvio Padrão Negativo (Downside Deviation)",
  },
  {
    term: "HHI (Herfindahl-Hirschman Index)",
    category: "Risco",
    definition: "Métrica financeira utilizada para medir a concentração de um portfólio. Varia de 0 a 10.000. Valores altos indicam que poucas moedas dominam todo o seu capital, aumentando o risco de ruína.",
    example: "HHI < 1500 é seguro (diversificado); HHI > 2500 é concentrado (alto risco).",
    formula: "HHI = Soma dos Quadrados das Porcentagens de cada Ativo",
  },
  {
    term: "Max Drawdown (Rebaixamento Máximo)",
    category: "Risco",
    definition: "A maior perda histórica registrada do ponto mais alto (pico) ao ponto mais baixo (vale) do saldo do portfólio antes de uma nova máxima ser estabelecida.",
    example: "Se sua conta vai de $10.000 para $12.000 (pico), cai para $9.000 (vale) e depois sobe para $15.000, o Max Drawdown é de 25%.",
    formula: "Max Drawdown = (Pico - Vale) / Pico × 100",
  },
  {
    term: "RSI (Índice de Força Relativa)",
    category: "Indicadores",
    definition: "Oscilador de momento que mede a velocidade e a variação dos movimentos de preço de um ativo. Varia de 0 a 100. Tradicionalmente, valores acima de 70 indicam sobrecompra e abaixo de 30 indicam sobrevenda.",
    example: "RSI em 25 indica sobrevenda severa, sugerindo possível reversão de alta.",
  },
  {
    term: "MACD (Convergência e Divergência de Médias Móveis)",
    category: "Indicadores",
    definition: "Indicador de tendência que segue o momento do preço, mostrando a relação entre duas médias móveis exponenciais (EMAs) do preço de um ativo.",
    example: "O cruzamento da linha de MACD acima da linha de sinal indica momento comprador (sinal de compra).",
  },
  {
    term: "Order Book (Livro de Ofertas)",
    category: "Trading",
    definition: "Lista eletrônica em tempo real de ordens de compra (bids) e venda (asks) pendentes para um ativo específico, organizadas por níveis de preço.",
    example: "No livro de ofertas da Binance, você visualiza onde as baleias colocaram as maiores ordens de suporte.",
  },
  {
    term: "Spread",
    category: "Trading",
    definition: "A diferença entre o preço mais alto que um comprador está disposto a pagar (best bid) e o preço mais baixo que um vendedor está disposto a aceitar (best ask).",
    example: "Se o melhor bid do BTC é $65.000 e o melhor ask é $65.001, o spread é de $1.",
    formula: "Spread = Menor Preço de Venda - Maior Preço de Compra",
  },
  {
    term: "Slippage",
    category: "Trading",
    definition: "Diferença entre o preço esperado de uma negociação e o preço pelo qual a negociação é realmente executada. Comum em mercados muito voláteis ou com baixa liquidez.",
    example: "Você envia uma ordem de compra a mercado para $60.000, mas devido à volatilidade ela é executada a $60.050. O slippage foi de $50.",
  },
];

const CATEGORIES = ["Todos", "Geral", "Indicadores", "Risco", "Trading"] as const;

export function Glossary() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<typeof CATEGORIES[number]>("Todos");
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  const filteredItems = GLOSSARY_ITEMS.filter((item) => {
    const matchesSearch =
      item.term.toLowerCase().includes(search.toLowerCase()) ||
      item.definition.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === "Todos" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar termo ou definição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background/80 border-border/50 input-glow text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "h-9 px-3 text-xs border-border/50 transition-all duration-200 cursor-pointer",
                activeCategory === cat
                  ? "bg-crypto-cyan/20 text-crypto-cyan hover:bg-crypto-cyan/30 border-crypto-cyan/30 font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/40"
              )}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Glossary Cards List */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border border-border/30 rounded-xl bg-secondary/10">
            <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs">Nenhum termo encontrado com estes filtros.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isExpanded = expandedTerm === item.term;
            return (
              <Card
                key={item.term}
                className={cn(
                  "glass-card border border-border/40 hover:border-crypto-cyan/30 transition-all duration-300 overflow-hidden cursor-pointer",
                  isExpanded ? "gradient-border border-crypto-cyan/40" : ""
                )}
                onClick={() => setExpandedTerm(isExpanded ? null : item.term)}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-bold text-sm text-foreground">{item.term}</span>
                      <Badge variant="outline" className="text-[8px] uppercase tracking-wider font-semibold border-border px-1.5 shrink-0">
                        {item.category}
                      </Badge>
                    </div>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-muted-foreground"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </motion.div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden mt-3 pt-3 border-t border-border/20 space-y-2.5 text-xs text-muted-foreground"
                      >
                        <p className="leading-relaxed text-foreground/90 font-medium">
                          {item.definition}
                        </p>
                        
                        {item.formula && (
                          <div className="bg-secondary/40 border border-border/50 rounded-lg p-2.5 font-mono text-[10px] text-crypto-cyan flex items-start gap-2">
                            <Tag className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-muted-foreground block text-[9px] uppercase tracking-wider mb-1">Fórmula Matemática</span>
                              {item.formula}
                            </div>
                          </div>
                        )}

                        <div className="bg-background/40 border border-border/20 rounded-lg p-2.5 text-[11px] italic leading-snug">
                          <span className="font-semibold text-foreground/80 not-italic block text-[9px] uppercase tracking-wider mb-0.5">Exemplo Prático</span>
                          {item.example}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
