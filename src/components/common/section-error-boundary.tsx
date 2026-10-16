"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, LayoutDashboard, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCryptoStore } from "@/lib/store";
import { DEFAULT_BOTS } from "@/lib/store/botSlice";

interface Props {
  children: ReactNode;
  sectionName?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[SectionErrorBoundary] Erro capturado na seção:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleResetBots = () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("tradeai_bots_v1");
        localStorage.removeItem("tradeai_fleet_bots");
      }
      useCryptoStore.getState().setBots(DEFAULT_BOTS);
      useCryptoStore.getState().setActiveSection("bot");
      this.setState({ hasError: false, error: null });
    } catch (err) {
      console.warn("Falha ao redefinir frota:", err);
      this.setState({ hasError: false, error: null });
    }
  };

  private handleGoDashboard = () => {
    useCryptoStore.getState().setActiveSection("dashboard");
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const sectionTitle = this.props.sectionName || "esta seção";

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
          <Card className="max-w-xl w-full border-red-500/30 bg-red-950/20 backdrop-blur-xl shadow-2xl">
            <CardHeader className="flex flex-col items-center pb-2">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mb-3">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <CardTitle className="text-lg font-bold text-red-200">
                Não foi possível carregar {sectionTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ocorreu uma instabilidade pontual ao renderizar os dados desta tela. Você pode tentar recarregar ou restaurar os parâmetros operacionais da frota para corrigir dados legados do navegador.
              </p>

              {this.state.error?.message && (
                <div className="p-2.5 rounded-lg bg-black/40 border border-red-500/20 text-left font-mono text-[11px] text-red-300/80 overflow-x-auto max-h-24">
                  {this.state.error.message}
                </div>
              )}

              <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={this.handleRetry}
                  className="text-xs border-white/[0.1] hover:bg-white/[0.05] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Tentar Novamente
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={this.handleResetBots}
                  className="text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/15 cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  Restaurar Robôs Padrão
                </Button>

                <Button
                  size="sm"
                  onClick={this.handleGoDashboard}
                  className="text-xs bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
                  Painel Principal
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
