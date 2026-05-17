'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCryptoStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  MessageSquare,
  Trash2,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { SignalGenerator } from './signal-generator';

const SUGGESTED_QUESTIONS = [
  'Analisar tendência BTC',
  'O que é RSI?',
  'Melhor estratégia para iniciantes',
  'Explique stop loss',
  'Perspectiva do mercado hoje',
];

const WELCOME_MESSAGE = {
  id: 'welcome-msg',
  role: 'assistant' as const,
  content: `👋 **Bem-vindo ao Crypto IA Pro!**\n\nSou seu assistente de trading com IA. Posso ajudar com:\n\n- 📊 **Análise Técnica** — RSI, MACD, níveis de suporte/resistência\n- 🤖 **Estratégias de Trading** — Recomendações personalizadas de estratégia\n- 📈 **Insights de Mercado** — Análise e tendências em tempo real\n- ⚡ **Geração de Sinais** — Sinais de compra/venda com IA\n\nPergunte qualquer coisa sobre mercados crypto, ou experimente uma das perguntas sugeridas abaixo!`,
  timestamp: new Date().toISOString(),
};

// AI thinking indicator
function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="flex gap-3"
    >
      <div className="w-8 h-8 rounded-lg bg-crypto-cyan/10 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-crypto-cyan" />
      </div>
      <div className='bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm'>
        <div className='flex items-center gap-2 mb-1.5'>
          <Sparkles className='w-3 h-3 text-crypto-cyan' />
          <span className='text-[10px] text-crypto-cyan font-medium'>IA está pensando...</span>
        </div>
        <div className='flex items-center gap-1.5'>
          <span className='sr-only'>Loading...</span>
          <span className='typing-dot' />
          <span className='typing-dot' />
          <span className='typing-dot' />
        </div>
      </div>
    </motion.div>
  );
}

// Gradient border button wrapper
function GradientBorderButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="relative group rounded-md p-[1px] bg-gradient-to-r from-crypto-cyan/40 via-crypto-green/40 to-crypto-gold/40 hover:from-crypto-cyan/60 hover:via-crypto-green/60 hover:to-crypto-gold/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
    >
      <span className="flex items-center justify-center rounded-[5px] bg-card px-3 py-1.5 text-xs text-foreground group-hover:bg-card/80 transition-colors">
        {children}
      </span>
    </motion.button>
  );
}

// AI Tips Card content (reusable in both desktop sidebar and mobile sheet)
function AiTipsContent() {
  return (
    <Card className="bg-card/60 backdrop-blur-md gradient-border relative overflow-hidden">
      <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-b from-crypto-gold/20 to-transparent pointer-events-none" />
      <CardHeader className="pb-3 relative">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-crypto-gold" />
          <CardTitle className="text-sm">Dicas da IA</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 relative">
        <TipItem
          title="Estratégia RSI"
          description="Compre quando RSI cair abaixo de 30 (sobrevendido), venda quando RSI subir acima de 70 (sobrecomprado)."
        />
        <Separator className="bg-border" />
        <TipItem
          title="Stop Loss"
          description="Sempre defina um stop loss 2-5% abaixo do preço de entrada para limitar perdas potenciais."
        />
        <Separator className="bg-border" />
        <TipItem
          title="Diversificação"
          description="Não coloque todo seu capital em uma moeda. Distribua entre 3-5 ativos diferentes."
        />
        <Separator className="bg-border" />
        <TipItem
          title="Confirmação por Volume"
          description="Confirme rompimentos com volume acima da média para evitar sinais falsos."
        />
      </CardContent>
    </Card>
  );
}

export function ChatSection() {
  const { chatMessages, addChatMessage, clearChat, selectedSymbol, tickers } =
    useCryptoStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [hasInitialized, setHasInitialized] = useState(false);
  const [signalSheetOpen, setSignalSheetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Add welcome message on first load
  useEffect(() => {
    if (!hasInitialized) {
      setHasInitialized(true);
      // Only add welcome message if chat is empty
      const currentMessages = useCryptoStore.getState().chatMessages;
      if (currentMessages.length === 0) {
        addChatMessage(WELCOME_MESSAGE);
      }
    }
  }, [hasInitialized, addChatMessage]);

  // Smooth scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages, isLoading]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || isLoading) return;

      const userMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user' as const,
        content: message.trim(),
        timestamp: new Date().toISOString(),
      };
      addChatMessage(userMessage);
      setInput('');
      setIsLoading(true);

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: message.trim() }),
        });

        const data = await res.json();

        if (data.success) {
          const assistantMessage = {
            id: `msg-${Date.now()}-ai`,
            role: 'assistant' as const,
            content: data.response,
            timestamp: new Date().toISOString(),
          };
          addChatMessage(assistantMessage);
        } else {
          const errorMessage = {
            id: `msg-${Date.now()}-error`,
            role: 'assistant' as const,
            content:
              'Desculpe, ocorreu um erro. Por favor, tente novamente. ⚠️',
            timestamp: new Date().toISOString(),
          };
          addChatMessage(errorMessage);
        }
      } catch {
        const errorMessage = {
          id: `msg-${Date.now()}-error`,
          role: 'assistant' as const,
          content:
            'Erro de rede. Verifique sua conexão e tente novamente. ⚠️',
          timestamp: new Date().toISOString(),
        };
        addChatMessage(errorMessage);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [isLoading, sessionId, addChatMessage]
  );

  const handleClearChat = async () => {
    try {
      await fetch(`/api/ai/chat?sessionId=${sessionId}`, { method: 'DELETE' });
    } catch {
      // Ignore error, clear local state anyway
    }
    clearChat();
    // Re-add welcome message after clearing
    addChatMessage(WELCOME_MESSAGE);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100dvh-12rem)] lg:h-[calc(100vh-10rem)]">
      {/* Chat Interface - Full width on mobile, 2/3 on desktop */}
      <Card className="lg:col-span-2 flex flex-col glass border border-border/50 overflow-hidden relative">
        {/* Gradient border glow */}
        <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-b from-crypto-cyan/20 to-transparent pointer-events-none" />

        {/* Header */}
        <CardHeader className="pb-3 border-b border-border shrink-0 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-crypto-cyan/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-crypto-cyan" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Assistente de Trading IA
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Powered by AI • {selectedSymbol}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs gap-1 hidden sm:flex">
                <MessageSquare className="w-3 h-3" />
                {chatMessages.length} mensagens
              </Badge>
              {/* Mobile: Sinais button to open Sheet */}
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden h-9 gap-1.5 text-xs border-crypto-cyan/30 text-crypto-cyan hover:bg-crypto-cyan/10 touch-target"
                onClick={() => setSignalSheetOpen(true)}
              >
                <Zap className="w-3.5 h-3.5" />
                Sinais
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearChat}
                className="h-8 w-8 text-muted-foreground hover:text-destructive touch-target"
                title="Limpar chat"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Messages Area */}
        <div className="flex-1 min-h-0 relative">
          <ScrollArea className="h-full">
            <div ref={scrollRef} className="p-4 space-y-4 min-h-full">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                  <div className="w-16 h-16 rounded-2xl bg-crypto-cyan/10 flex items-center justify-center mb-4">
                    <Bot className="w-8 h-8 text-crypto-cyan" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    Bem-vindo ao Crypto IA Pro
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mb-6">
                    Pergunte qualquer coisa sobre mercados crypto, análise técnica,
                    estratégias de trading, ou obtenha insights em tempo real.
                  </p>

                  {/* Suggested Questions with gradient borders */}
                  <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                    {SUGGESTED_QUESTIONS.map((question) => (
                      <GradientBorderButton
                        key={question}
                        onClick={() => sendMessage(question)}
                        disabled={isLoading}
                      >
                        {question}
                      </GradientBorderButton>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {chatMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex gap-3 ${
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        msg.role === 'user'
                          ? 'bg-crypto-cyan/10'
                          : 'bg-crypto-cyan/10'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-crypto-cyan" />
                      ) : (
                        <Bot className="w-4 h-4 text-crypto-cyan" />
                      )}
                    </div>

                    {/* Message Bubble - 85% max on mobile, 80% on desktop */}
                    <div
                      className={`max-w-[85%] lg:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-crypto-cyan/20 via-crypto-cyan/10 to-crypto-green/5 text-foreground rounded-tr-sm border border-crypto-cyan/20 shadow-sm shadow-crypto-cyan/5'
                          : 'bg-card/90 backdrop-blur-sm border border-border/50 rounded-tl-sm shadow-sm'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <p
                        className={`text-[10px] mt-1.5 ${
                          msg.role === 'user'
                            ? 'text-crypto-cyan/50'
                            : 'text-muted-foreground/50'
                        }`}
                      >
                        {formatMessageTime(msg.timestamp)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Thinking indicator */}
              {isLoading && <ThinkingIndicator />}
            </div>
          </ScrollArea>
        </div>

        {/* Suggested questions (when chat has messages) */}
        {chatMessages.length > 0 && (
          <div className="px-4 py-2 border-t border-border shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {SUGGESTED_QUESTIONS.map((question) => (
                <GradientBorderButton
                  key={question}
                  onClick={() => sendMessage(question)}
                  disabled={isLoading}
                >
                  {question}
                </GradientBorderButton>
              ))}
            </div>
          </div>
        )}

        {/* Input Area - safe-bottom for mobile nav */}
        <div className="p-3 border-t border-border shrink-0 safe-bottom relative">
          {/* Gradient border on focus */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-crypto-cyan/0 to-transparent transition-all duration-300 peer-focus:via-crypto-cyan/50 peer-focus:h-[2px]" />
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre mercados crypto..."
              aria-label="Type your message"
              disabled={isLoading}
              className="flex-1 bg-background/80 backdrop-blur-sm border-border/50 input-glow peer focus-visible:ring-crypto-cyan/30 focus-visible:border-crypto-cyan/30 transition-all duration-300"
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0 bg-crypto-cyan hover:bg-crypto-cyan/90 transition-transform duration-200 hover:scale-105 active:scale-95 touch-target"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Respostas da IA são apenas informativas. Não é recomendação
            financeira.
          </p>
        </div>
      </Card>

      {/* Desktop: Right Side Panel - Signal Generator & Tips */}
      <div className="hidden lg:flex flex-col gap-4 overflow-y-auto">
        <SignalGenerator />
        <AiTipsContent />
      </div>

      {/* Mobile: Signal Sheet (slides from right) */}
      <Sheet open={signalSheetOpen} onOpenChange={setSignalSheetOpen}>
        <SheetContent side="right" className="w-[85vw] sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-crypto-cyan" />
              Sinais e Dicas
            </SheetTitle>
            <SheetDescription>
              Gerador de sinais IA e dicas de trading
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-4">
            <SignalGenerator />
            <AiTipsContent />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TipItem({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}
