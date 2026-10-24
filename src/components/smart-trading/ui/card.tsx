import * as React from "react";
import { cn } from "@/lib/utils";

export interface SmartCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  glow?: "blue" | "purple" | "success" | "danger" | "none";
  variant?: "default" | "elevated" | "interactive";
}

export function SmartCard({
  className,
  glass = true,
  glow = "none",
  variant = "default",
  children,
  ...props
}: SmartCardProps) {
  const glowStyles = {
    none: "",
    blue: "hover:border-blue-500/50 hover:shadow-[0_0_25px_rgba(59,130,246,0.2)]",
    purple: "hover:border-purple-500/50 hover:shadow-[0_0_25px_rgba(139,92,246,0.2)]",
    success: "hover:border-emerald-500/50 hover:shadow-[0_0_25px_rgba(34,197,94,0.2)]",
    danger: "hover:border-red-500/50 hover:shadow-[0_0_25px_rgba(239,68,68,0.2)]",
  };

  const variantStyles = {
    default: "bg-[#141414]/90 border-neutral-800 text-neutral-100",
    elevated: "bg-[#181818]/95 border-neutral-700/80 shadow-lg text-neutral-100",
    interactive: "bg-[#141414]/90 border-neutral-800 hover:border-blue-500/50 hover:shadow-md cursor-pointer text-neutral-100",
  };

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden",
        variantStyles[variant],
        glass && "backdrop-blur-md",
        glowStyles[glow],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SmartCardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("p-5 border-b border-neutral-800/80 flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SmartCardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-bold text-white tracking-tight flex items-center gap-2", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function SmartCardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-neutral-400 mt-0.5", className)} {...props}>
      {children}
    </p>
  );
}

export function SmartCardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function SmartCardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "p-4 px-5 bg-neutral-900/60 border-t border-neutral-800/80 flex items-center justify-between",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
