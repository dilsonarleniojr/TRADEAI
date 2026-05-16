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
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { SignalGenerator } from './signal-generator';

const SUGGESTED_QUESTIONS = [
  'Analyze BTC trend',
  'What is RSI?',
  'Best strategy for beginners',
  'Explain stop loss',
  'Market outlook today',
];

// Bouncing dots loading animation
function BouncingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <span className="sr-only">Loading...</span>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-primary"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export function ChatSection() {
  const { chatMessages, addChatMessage, clearChat, selectedSymbol, tickers } =
    useCryptoStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
              'Sorry, I encountered an error. Please try again. ⚠️',
            timestamp: new Date().toISOString(),
          };
          addChatMessage(errorMessage);
        }
      } catch {
        const errorMessage = {
          id: `msg-${Date.now()}-error`,
          role: 'assistant' as const,
          content:
            'Network error. Please check your connection and try again. ⚠️',
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-10rem)]">
      {/* Chat Interface - Left side (2/3) */}
      <Card className="lg:col-span-2 flex flex-col bg-card border-border overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  AI Trading Assistant
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Powered by AI • {selectedSymbol}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs gap-1">
                <MessageSquare className="w-3 h-3" />
                {chatMessages.length} messages
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearChat}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Clear chat"
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
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Bot className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    Welcome to Crypto IA Pro
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mb-6">
                    Ask me anything about crypto markets, technical analysis,
                    trading strategies, or get real-time insights.
                  </p>

                  {/* Suggested Questions */}
                  <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                    {SUGGESTED_QUESTIONS.map((question) => (
                      <Button
                        key={question}
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 border-primary/20 hover:bg-primary/10 hover:text-primary"
                        onClick={() => sendMessage(question)}
                        disabled={isLoading}
                      >
                        {question}
                      </Button>
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
                          ? 'bg-primary/10'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-primary" />
                      ) : (
                        <Bot className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary/10 text-foreground rounded-tr-sm'
                          : 'bg-card border border-border rounded-tl-sm'
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
                            ? 'text-primary/50'
                            : 'text-muted-foreground/50'
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Loading indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                    <BouncingDots />
                  </div>
                </motion.div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Suggested questions (when chat has messages) */}
        {chatMessages.length > 0 && (
          <div className="px-4 py-2 border-t border-border shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {SUGGESTED_QUESTIONS.map((question) => (
                <Button
                  key={question}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 shrink-0 border-border hover:bg-primary/10 hover:text-primary"
                  onClick={() => sendMessage(question)}
                  disabled={isLoading}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about crypto markets, analysis, strategies..."
              disabled={isLoading}
              className="flex-1 bg-background border-border focus-visible:ring-primary/30"
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            AI responses are for informational purposes only. Not financial
            advice.
          </p>
        </div>
      </Card>

      {/* Right Side Panel - Signal Generator & Tips */}
      <div className="flex flex-col gap-4 overflow-y-auto">
        <SignalGenerator />

        {/* AI Tips Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">AI Tips</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <TipItem
              title="RSI Strategy"
              description="Buy when RSI drops below 30 (oversold), sell when RSI rises above 70 (overbought)."
            />
            <Separator className="bg-border" />
            <TipItem
              title="Stop Loss"
              description="Always set a stop loss 2-5% below your entry price to limit potential losses."
            />
            <Separator className="bg-border" />
            <TipItem
              title="Diversification"
              description="Don't put all your capital in one coin. Spread across 3-5 different assets."
            />
            <Separator className="bg-border" />
            <TipItem
              title="Volume Confirmation"
              description="Confirm breakouts with above-average volume to avoid false signals."
            />
          </CardContent>
        </Card>
      </div>
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
