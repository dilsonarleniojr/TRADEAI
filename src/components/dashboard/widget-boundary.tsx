"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WidgetBoundaryProps {
  name: string;
  children: ReactNode;
}

interface WidgetBoundaryState {
  hasError: boolean;
}

// Isola falhas por widget: um card quebrado não derruba o painel inteiro.
export class WidgetBoundary extends Component<WidgetBoundaryProps, WidgetBoundaryState> {
  state: WidgetBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WidgetBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[widget:${this.props.name}]`, error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="rounded-xl border border-crypto-red/30 bg-card/60 p-6 flex flex-col items-center justify-center gap-2.5 text-center min-h-[200px]"
      >
        <AlertTriangle className="w-6 h-6 text-crypto-red" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Não foi possível carregar {this.props.name}</p>
        <p className="text-xs text-muted-foreground max-w-[260px]">
          Os outros widgets continuam funcionando.
        </p>
        <Button
          size="sm"
          onClick={() => this.setState({ hasError: false })}
          className="h-9 gap-1.5 text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar de novo
        </Button>
      </div>
    );
  }
}
