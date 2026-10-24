"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SmartInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightSuffix?: React.ReactNode;
  isNumeric?: boolean;
}

export const SmartInput = React.forwardRef<HTMLInputElement, SmartInputProps>(
  (
    {
      className,
      type = "text",
      label,
      helperText,
      error,
      leftIcon,
      rightSuffix,
      isNumeric = false,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || React.useId();
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";
    const resolvedType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold tracking-wide uppercase text-neutral-400 dark:text-neutral-400"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-neutral-500">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            className={cn(
              "w-full h-10 px-3 py-2 text-sm rounded-lg transition-all duration-150 outline-none",
              "bg-neutral-900/80 text-white placeholder-neutral-500",
              "border border-neutral-700/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
              leftIcon && "pl-9",
              (rightSuffix || isPassword) && "pr-10",
              isNumeric && "font-mono tracking-tight text-right",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
              className
            )}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 text-neutral-400 hover:text-white transition-colors focus:outline-none"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}

          {!isPassword && rightSuffix && (
            <div className="absolute right-3 flex items-center text-xs font-semibold text-neutral-400 pointer-events-none">
              {rightSuffix}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400 animate-fadeIn">{error}</p>}
        {!error && helperText && (
          <p className="text-xs text-neutral-500">{helperText}</p>
        )}
      </div>
    );
  }
);

SmartInput.displayName = "SmartInput";
