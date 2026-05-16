"use client";

import { useCryptoStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BotConfigForm } from "./bot-config-form";
import { BotActivityLog } from "./bot-activity-log";
import { BotPortfolio } from "./bot-portfolio";
import { Play, Square, Bot, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BotSection() {
  const { botActive, setBotActive, botConfig, tradingMode, setPortfolio, setTrades, trades } =
    useCryptoStore();

  const toggleBot = () => {
    if (botActive) {
      setBotActive(false);
    } else {
      setBotActive(true);
      // Reset portfolio when starting with paper mode
      if (tradingMode === "paper" && trades.length === 0) {
        setPortfolio({
          totalValue: botConfig.initialBalance,
          cashBalance: botConfig.initialBalance,
          assetBalance: 0,
          assetQuantity: 0,
          pnl: 0,
          pnlPercent: 0,
        });
      }
    }
  };

  return (
    <motion.div
      key="bot"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Bot Control Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-card border border-border rounded-xl p-4">
        <Button
          onClick={toggleBot}
          size="lg"
          className={`relative overflow-hidden h-12 px-8 text-base font-semibold transition-all ${
            botActive
              ? "bg-crypto-red hover:bg-crypto-red/90 text-white"
              : "bg-crypto-green hover:bg-crypto-green/90 text-white"
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={botActive ? "stop" : "start"}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2"
            >
              {botActive ? (
                <>
                  <Square className="w-5 h-5" />
                  STOP BOT
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  START BOT
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </Button>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  botActive ? "bg-crypto-green" : "bg-muted-foreground/50"
                }`}
              />
              {botActive && (
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-crypto-green animate-ping" />
              )}
            </div>
            <span className="text-sm font-medium">
              {botActive ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Strategy Badge */}
          <Badge
            variant="outline"
            className="border-crypto-cyan/30 text-crypto-cyan text-xs"
          >
            <Bot className="w-3 h-3 mr-1" />
            {botConfig.strategy}
          </Badge>

          {/* Trading Mode Badge */}
          <Badge
            className={`text-xs ${
              tradingMode === "paper"
                ? "bg-crypto-cyan/15 text-crypto-cyan border-crypto-cyan/30"
                : "bg-crypto-red/15 text-crypto-red border-crypto-red/30"
            }`}
          >
            <Zap className="w-3 h-3 mr-1" />
            {tradingMode === "paper" ? "Paper" : "Live"}
          </Badge>

          {/* Symbol Badge */}
          <Badge variant="outline" className="text-xs border-border">
            {botConfig.symbol}
          </Badge>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Config Form */}
        <div className="lg:col-span-1">
          <BotConfigForm />
        </div>

        {/* Right: Activity Log + Portfolio */}
        <div className="lg:col-span-2 space-y-4">
          <BotActivityLog />
          <BotPortfolio />
        </div>
      </div>
    </motion.div>
  );
}
