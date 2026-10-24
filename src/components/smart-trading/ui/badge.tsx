import * as React from "react";
import { cn } from "@/lib/utils";

export interface SmartBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "secondary" | "success" | "danger" | "warning" | "neutral" | "outline" | "blue" | "purple";
  size?: "sm" | "md";
  hasDot?: boolean;
  isDot?: boolean;
  dotColor?: string;
}

export function SmartBadge({
  className,
  variant = "primary",
  size = "md",
  hasDot = false,
  isDot = false,
  dotColor,
  children,
  ...props
}: SmartBadgeProps) {
  const showDot = hasDot || isDot;
  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px] font-semibold gap-1",
    md: "px-2.5 py-1 text-xs font-semibold gap-1.5",
  };

  const variantStyles = {
    primary: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    blue: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    secondary: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    purple: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    danger: "bg-red-500/15 text-red-400 border border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    neutral: "bg-neutral-800 text-neutral-300 border border-neutral-700",
    outline: "bg-transparent text-neutral-300 border border-neutral-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full tracking-wide select-none transition-colors",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full animate-pulse",
            dotColor ||
              (variant === "success"
                ? "bg-emerald-400"
                : variant === "danger"
                ? "bg-red-400"
                : variant === "primary"
                ? "bg-blue-400"
                : "bg-purple-400")
          )}
        />
      )}
      {children}
    </span>
  );
}
