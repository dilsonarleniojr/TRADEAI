"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SmartButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const SmartButton = React.forwardRef<HTMLButtonElement, SmartButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-200 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";

    const sizeStyles = {
      sm: "h-8 px-3 text-xs rounded-md gap-1.5",
      md: "h-10 px-4 text-sm rounded-lg gap-2",
      lg: "h-12 px-6 text-base rounded-xl gap-2.5 font-semibold",
      icon: "h-9 w-9 p-0 rounded-lg",
    };

    const variantStyles = {
      primary:
        "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/25 border border-blue-500/50 hover:shadow-blue-500/40 focus-visible:ring-blue-500",
      secondary:
        "bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/25 border border-purple-500/50 hover:shadow-purple-500/40 focus-visible:ring-purple-500",
      ghost:
        "bg-transparent hover:bg-white/10 text-neutral-300 hover:text-white dark:hover:bg-white/5 dark:text-neutral-300 dark:hover:text-white focus-visible:ring-neutral-500",
      danger:
        "bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/25 border border-red-500/40 focus-visible:ring-red-500",
      success:
        "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25 border border-emerald-500/40 focus-visible:ring-emerald-500",
      outline:
        "bg-transparent hover:bg-white/5 border border-neutral-700 hover:border-neutral-500 text-neutral-200 focus-visible:ring-neutral-400",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-current" />}
        {!isLoading && leftIcon}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

SmartButton.displayName = "SmartButton";
