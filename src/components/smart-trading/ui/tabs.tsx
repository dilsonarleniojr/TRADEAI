"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (val: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function SmartTabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (val: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function SmartTabsList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 bg-neutral-900/90 border border-neutral-800 rounded-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SmartTabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("SmartTabsTrigger must be used within SmartTabs");

  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-2 select-none",
        isActive
          ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
          : "text-neutral-400 hover:text-white hover:bg-neutral-800/60",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SmartTabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("SmartTabsContent must be used within SmartTabs");

  if (ctx.value !== value) return null;

  return <div className={cn("mt-4 animate-fadeIn", className)}>{children}</div>;
}
