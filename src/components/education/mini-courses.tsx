"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  XCircle,
  HelpCircle,
  Award,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface CourseStep {
  title: string;
  content: string;
  tip?: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Course {
  id: string;
  title: string;
  difficulty: "Fácil" | "Médio" | "Avançado";
  category: string;
  duration: string;
  emoji: string;
  steps: CourseStep[];
  quiz: QuizQuestion[];
}

const COURSES: Course[] = [
  {
    id: "quant-intro",
    title: "Introdução ao Trading Quantitativo",
    difficulty: "Fácil",
    category: "Algoritmos",
    duration: "10 min",
    emoji: "🤖",
    steps: [
      {
        title: "O que é Trading Quantitativo?",
        content: "Trading quantitativo (ou quant) baseia-se em análise matemática e algoritmos computacionais para identificar oportunidades de investimento e executar ordens. Em vez de confiar em intuições ou emoções humanas, o trading quant utiliza dados históricos, estatísticas e computação de alta performance para tomar decisões 100% racionais e sistemáticas.",
        tip: "Robôs não têm sentimentos. Eles nunca vendem em pânico ou compram por FOMO (Fear Of Missing Out).",
      },
      {
        title: "Paper Trading vs Live Trading",
        content: "O Paper Trading (Trading Simulado) executa ordens virtuais usando dados reais do mercado em tempo real. Permite que você teste robôs, indicadores e estratégias sem arriscar capital real. Já o Live Trading conecta o sistema à sua conta da corretora (via API) para enviar ordens reais com dinheiro de verdade. O ideal é validar novas estratégias no modo Simulado por semanas antes de ativá-las no modo Real.",
        tip: "A volatilidade do mercado real inclui taxas de execução e slippage que podem diferir ligeiramente da simulação.",
      },
      {
        title: "A Importância do Backtesting",
        content: "Backtesting é o processo de testar uma estratégia de trading em dados históricos de preços para ver qual teria sido seu desempenho no passado. Ele ajuda a avaliar a viabilidade de uma estratégia, seu rebaixamento máximo (drawdown) e métricas ajustadas ao risco antes de expor capital real. No entanto, lembre-se: performance passada não garante lucros futuros.",
      },
    ],
    quiz: [
      {
        question: "Qual é a principal vantagem do Trading Quantitativo?",
        options: [
          "Garantir lucros 100% livres de risco.",
          "Eliminar as emoções humanas e executar decisões baseadas em estatísticas.",
          "Adivinhar perfeitamente o preço futuro das moedas.",
          "Executar ordens sem custos ou taxas de corretagem.",
        ],
        correctIndex: 1,
        explanation: "O trading quantitativo remove emoções humanas e vieses psicológicos, substituindo-os por decisões matemáticas consistentes.",
      },
      {
        question: "O que é Backtesting?",
        options: [
          "Salvar uma cópia de segurança dos seus dados de login.",
          "Testar estratégias usando dados históricos para analisar o desempenho passado.",
          "Comprar ativos e segurá-los para sempre (HODL).",
          "Executar trades simultaneamente em duas corretoras diferentes.",
        ],
        correctIndex: 1,
        explanation: "Backtesting significa rodar um algoritmo com dados históricos reais para simular como ele teria perfomado.",
      },
    ],
  },
  {
    id: "risk-mgmt",
    title: "Gestão de Risco e Prevenção de Ruína",
    difficulty: "Médio",
    category: "Risco",
    duration: "15 min",
    emoji: "🛡️",
    steps: [
      {
        title: "A Regra de Ouro: Sobrevivência",
        content: "A regra número 1 no trading não é ganhar dinheiro, mas sim permanecer no jogo. Sem capital, você não pode negociar. Gestão de risco envolve dimensionar suas posições (Position Sizing) de modo que nenhuma perda individual consiga liquidar sua conta. Recomenda-se arriscar no máximo 1% a 2% do seu capital total por trade.",
        tip: "Gerencie o risco primeiro. Os lucros cuidarão de si mesmos.",
      },
      {
        title: "Stop Loss e Take Profit",
        content: "Stop Loss (SL) é uma ordem de saída programada para encerrar um trade perdedor se o preço atingir um nível limite de dor. Take Profit (TP) é o nível alvo onde você realiza lucros. Definir a relação Risco/Retorno (Risk/Reward) ideal é crucial: visar um ganho que seja pelo menos 2 vezes maior que a perda aceitável (R:R de 1:2) garante que você seja lucrativo mesmo acertando apenas 40% das vezes.",
      },
      {
        title: "Exposição Setorial e Diversificação",
        content: "Concentrar todo o capital em um único ativo ou setor (por exemplo, 100% em moedas de Meme) aumenta drasticamente o risco de ruína. Diversificar seu capital entre Layer 1s robustos, DeFi, Oracles e stablecoins ajuda a suavizar a volatilidade do portfólio. O índice HHI mede essa concentração: pontuações abaixo de 1500 indicam boa diversificação.",
        tip: "A correlação de preços indica se as moedas andam juntas. Se todas caem juntas, a diversificação foi ineficaz.",
      },
    ],
    quiz: [
      {
        question: "Com uma relação Risco/Retorno de 1:2 (arriscando $10 para ganhar $20), qual taxa de acerto é necessária para ficar empatado no longo prazo?",
        options: [
          "50% de acertos",
          "33.3% de acertos",
          "75% de acertos",
          "90% de acertos",
        ],
        correctIndex: 1,
        explanation: "Com R:R 1:2, cada acerto compensa dois erros. Logo, se acertar 1 a cada 3 trades (33.3%), seu saldo final será neutro.",
      },
      {
        question: "Qual índice matemático é usado para mensurar a concentração de ativos no portfólio?",
        options: [
          "Índice de Sharpe",
          "Pearson Correlation Coefficient",
          "Herfindahl-Hirschman Index (HHI)",
          "Desvio Padrão do Downside",
        ],
        correctIndex: 2,
        explanation: "O HHI (Herfindahl-Hirschman Index) é o padrão ouro na economia para medir a concentração de mercados ou portfólios.",
      },
    ],
  },
];

export function MiniCourses() {
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const activeCourse = COURSES.find((c) => c.id === activeCourseId);

  const startCourse = (id: string) => {
    setActiveCourseId(id);
    setStepIndex(0);
    setQuizAnswers({});
    setQuizSubmitted(false);
  };

  const handleNext = () => {
    if (!activeCourse) return;
    if (stepIndex < activeCourse.steps.length) {
      setStepIndex(stepIndex + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  const selectAnswer = (questionIdx: number, optionIdx: number) => {
    if (quizSubmitted) return;
    setQuizAnswers({ ...quizAnswers, [questionIdx]: optionIdx });
  };

  const submitQuiz = () => {
    setQuizSubmitted(true);
  };

  const getScore = () => {
    if (!activeCourse) return 0;
    let score = 0;
    activeCourse.quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correctIndex) score++;
    });
    return score;
  };

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {!activeCourseId ? (
          // Courses Selection List
          <motion.div
            key="selection"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {COURSES.map((course) => (
              <Card
                key={course.id}
                className="glass-card border border-border/40 hover:border-crypto-cyan/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-3xl">{course.emoji}</span>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-[8px] uppercase font-semibold border-border">
                        {course.difficulty}
                      </Badge>
                      <Badge className="text-[8px] bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/20">
                        {course.duration}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-sm font-bold text-foreground mt-1">
                    {course.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground pb-4">
                  Aprenda as bases teóricas e teste sua retenção com um quiz interativo de fixação no final.
                </CardContent>
                <CardFooter className="pt-0 border-t border-border/20 mt-auto pt-3">
                  <Button
                    onClick={() => startCourse(course.id)}
                    className="w-full h-8 text-xs font-semibold bg-crypto-cyan text-black hover:bg-crypto-cyan/85 cursor-pointer flex items-center gap-1.5"
                  >
                    Iniciar Curso
                    <BookOpen className="w-3.5 h-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </motion.div>
        ) : (
          // Active Course Screen
          <motion.div
            key="active-course"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="max-w-2xl mx-auto"
          >
            {activeCourse && (
              <Card className="glass-card border border-crypto-cyan/30 shadow-[0_0_24px_rgba(6,182,212,0.08)]">
                <CardHeader className="pb-3 border-b border-border/30">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      {activeCourse.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveCourseId(null)}
                      className="h-7 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Voltar ao Menu
                    </Button>
                  </div>
                  {/* Progress Indicator */}
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Progresso do Curso</span>
                      <span>
                        {stepIndex === activeCourse.steps.length
                          ? "Quiz Final"
                          : `Lição ${stepIndex + 1} de ${activeCourse.steps.length}`}
                      </span>
                    </div>
                    <Progress
                      value={
                        ((stepIndex + (stepIndex === activeCourse.steps.length ? 1 : 0)) /
                          (activeCourse.steps.length + 1)) *
                        100
                      }
                      className="h-1 bg-secondary/50"
                    />
                  </div>
                </CardHeader>

                <CardContent className="p-5 min-h-[200px]">
                  <AnimatePresence mode="wait">
                    {stepIndex < activeCourse.steps.length ? (
                      // Lesson Content Slide
                      <motion.div
                        key={`step-${stepIndex}`}
                        initial={{ opacity: 0, x: 15 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -15 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-3.5"
                      >
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-crypto-cyan/15 text-crypto-cyan flex items-center justify-center font-mono text-[10px] font-bold">
                            {stepIndex + 1}
                          </span>
                          {activeCourse.steps[stepIndex].title}
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {activeCourse.steps[stepIndex].content}
                        </p>

                        {activeCourse.steps[stepIndex].tip && (
                          <div className="bg-secondary/40 border border-border/40 p-3 rounded-lg text-[11px] text-muted-foreground italic leading-relaxed flex gap-2">
                            <Sparkles className="w-4 h-4 text-crypto-cyan shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-foreground/80 not-italic block text-[9px] uppercase tracking-wider mb-0.5">Dica Quant</span>
                              {activeCourse.steps[stepIndex].tip}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      // Quiz Slide
                      <motion.div
                        key="quiz"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                      >
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-crypto-gold" />
                          Questionário de Fixação
                        </h3>

                        <div className="space-y-5">
                          {activeCourse.quiz.map((q, qIdx) => (
                            <div key={qIdx} className="space-y-2.5">
                              <p className="text-xs font-semibold text-foreground leading-snug">
                                {qIdx + 1}. {q.question}
                              </p>
                              <div className="space-y-1.5">
                                {q.options.map((opt, oIdx) => {
                                  const isSelected = quizAnswers[qIdx] === oIdx;
                                  const isCorrect = q.correctIndex === oIdx;
                                  const isWrongSelected = isSelected && !isCorrect;

                                  let buttonClass = "bg-secondary/25 border-border/40 text-muted-foreground hover:bg-secondary/50";
                                  if (isSelected && !quizSubmitted) {
                                    buttonClass = "bg-crypto-cyan/15 border-crypto-cyan/50 text-crypto-cyan";
                                  }
                                  if (quizSubmitted) {
                                    if (isCorrect) {
                                      buttonClass = "bg-crypto-green/15 border-crypto-green/55 text-crypto-green";
                                    } else if (isWrongSelected) {
                                      buttonClass = "bg-crypto-red/15 border-crypto-red/55 text-crypto-red";
                                    } else {
                                      buttonClass = "bg-secondary/15 border-border/20 text-muted-foreground/50";
                                    }
                                  }

                                  return (
                                    <button
                                      key={oIdx}
                                      onClick={() => selectAnswer(qIdx, oIdx)}
                                      disabled={quizSubmitted}
                                      className={cn(
                                        "w-full text-left p-3 rounded-lg text-xs font-medium border transition-all duration-150 flex items-center justify-between cursor-pointer",
                                        buttonClass
                                      )}
                                    >
                                      <span>{opt}</span>
                                      {quizSubmitted && isCorrect && <CheckCircle className="w-3.5 h-3.5 text-crypto-green shrink-0 ml-2" />}
                                      {quizSubmitted && isWrongSelected && <XCircle className="w-3.5 h-3.5 text-crypto-red shrink-0 ml-2" />}
                                    </button>
                                  );
                                })}
                              </div>

                              {quizSubmitted && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  className="text-[10px] text-muted-foreground bg-secondary/15 p-2.5 rounded-md leading-relaxed border border-border/20"
                                >
                                  <span className="font-semibold text-foreground/80 block text-[9px] uppercase tracking-wider mb-0.5">Explicação</span>
                                  {q.explanation}
                                </motion.div>
                              )}
                            </div>
                          ))}
                        </div>

                        {quizSubmitted && (
                          <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-crypto-cyan/10 border border-crypto-cyan/30 rounded-xl p-4 flex items-center gap-3.5 mt-3"
                          >
                            <div className="w-10 h-10 rounded-full bg-crypto-cyan/15 flex items-center justify-center text-xl shrink-0">
                              🏆
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-foreground">Curso Concluído!</h4>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Você acertou {getScore()} de {activeCourse.quiz.length} perguntas.
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>

                <CardFooter className="border-t border-border/30 pt-3 flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBack}
                    disabled={stepIndex === 0}
                    className="h-8 text-xs font-semibold border-border/50 text-muted-foreground hover:bg-secondary/40 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Voltar
                  </Button>

                  {stepIndex < activeCourse.steps.length ? (
                    <Button
                      onClick={handleNext}
                      className="h-8 text-xs font-semibold bg-crypto-cyan text-black hover:bg-crypto-cyan/85 cursor-pointer"
                    >
                      Avançar
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  ) : (
                    !quizSubmitted && (
                      <Button
                        onClick={submitQuiz}
                        disabled={Object.keys(quizAnswers).length < activeCourse.quiz.length}
                        className="h-8 text-xs font-bold bg-crypto-gold text-black hover:bg-crypto-gold/85 cursor-pointer glow-gold-sm"
                      >
                        Enviar Respostas
                        <Award className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    )
                  )}
                </CardFooter>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
