"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ==========================================
// CARD: default, focal (dark), secondary, dashed
// ==========================================
export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "focal" | "secondary" | "dashed";
  padding?: "none" | "sm" | "md" | "lg";
}

export function AppCard({
  variant = "default",
  padding = "md",
  className,
  children,
  ...props
}: AppCardProps) {
  const variantStyles = {
    default: "bg-[#FFFFFF] dark:bg-[#0f1622] text-[#0E1B2C] dark:text-[#f8fafc] border border-[#E7EBF0] dark:border-white/10 rounded-[24px] shadow-[0_1px_3px_rgba(14,27,44,0.02)]",
    focal: "bg-[#0E1B2C] text-[#FFFFFF] border border-[#1d2f4a] rounded-[28px] shadow-[0_4px_20px_rgba(14,27,44,0.08)]",
    secondary: "bg-[#EEF1F5] dark:bg-[#162032] text-[#0E1B2C] dark:text-[#f8fafc] border border-[#E7EBF0] dark:border-white/10 rounded-[20px]",
    dashed: "bg-transparent border-2 border-dashed border-[#D3DAE3] dark:border-white/20 text-[#4A586A] dark:text-[#94a3b8] rounded-[24px]",
  };

  const paddingStyles = {
    none: "p-0",
    sm: "p-4 sm:p-5",
    md: "p-5 sm:p-7",
    lg: "p-6 sm:p-9",
  };

  return (
    <div
      className={cn(
        "transition-all duration-150",
        variantStyles[variant],
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ==========================================
// METRIC: rótulo + número serifado + legenda
// ==========================================
export interface MetricDisplayProps {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: "hero" | "kpi" | "card" | "compact";
  isGain?: boolean | null; // true: gain, false: loss, null: neutral
  onFocalDark?: boolean;
  prefix?: string;
  className?: string;
}

export function MetricDisplay({
  label,
  value,
  subtitle,
  size = "card",
  isGain = null,
  onFocalDark = false,
  prefix,
  className,
}: MetricDisplayProps) {
  const sizeStyles = {
    hero: "text-[50px] md:text-[76px] leading-[1.02]",
    kpi: "text-[32px] md:text-[40px] leading-[1.08]",
    card: "text-[26px] md:text-[34px] leading-[1.12]",
    compact: "text-[20px] md:text-[24px] leading-[1.15]",
  };

  const colorStyles = onFocalDark
    ? isGain === true
      ? "text-[#5BE3A8]"
      : isGain === false
      ? "text-[#FF8A80]"
      : "text-[#FFFFFF]"
    : isGain === true
    ? "text-[#0A7A59] dark:text-[#5BE3A8]"
    : isGain === false
    ? "text-[#B42318] dark:text-[#FF8A80]"
    : "text-[#0E1B2C] dark:text-[#f8fafc]";

  return (
    <div className={cn("flex flex-col space-y-1", className)}>
      <span
        className={cn(
          "text-[13px] md:text-[14px] font-instrument-sans font-medium",
          onFocalDark ? "text-[#A9B7C8]" : "text-[#4A586A] dark:text-[#94a3b8]"
        )}
      >
        {label}
      </span>
      <div className="flex items-baseline space-x-1">
        {prefix && (
          <span
            className={cn(
              "font-instrument-serif text-[24px] select-none",
              onFocalDark ? "text-[#A9B7C8]" : "text-[#4A586A]"
            )}
          >
            {prefix}
          </span>
        )}
        <span
          className={cn(
            "font-instrument-serif tabular-nums tracking-[-0.02em]",
            sizeStyles[size],
            colorStyles
          )}
        >
          {value}
        </span>
      </div>
      {subtitle && (
        <div
          className={cn(
            "text-[12px] md:text-[13px] font-instrument-sans flex items-center space-x-1.5",
            onFocalDark ? "text-[#A9B7C8]" : "text-[#4A586A] dark:text-[#94a3b8]"
          )}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ==========================================
// METRIC STRIP: linha de métricas horizontais
// ==========================================
export function MetricStrip({
  children,
  onFocalDark = false,
  className,
}: {
  children: React.ReactNode;
  onFocalDark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-flow-col auto-cols-fr gap-4 sm:gap-6 divide-x",
        onFocalDark
          ? "divide-[#223652]"
          : "divide-[#E7EBF0] dark:divide-white/10",
        className
      )}
    >
      {React.Children.map(children, (child, idx) => (
        <div key={idx} className={idx > 0 ? "pl-4 sm:pl-6" : ""}>
          {child}
        </div>
      ))}
    </div>
  );
}

// ==========================================
// SEGMENTED CONTROL: trilho cinza e pílula ativa
// ==========================================
export interface SegmentedItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center p-1 bg-[#E4E8ED] dark:bg-[#162032] rounded-[999px] border border-[#D3DAE3]/50 dark:border-white/10",
        className
      )}
    >
      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              "flex items-center space-x-1.5 rounded-[999px] font-instrument-sans font-medium transition-all duration-150 select-none min-h-[36px]",
              size === "sm" ? "px-3 py-1 text-[13px]" : "px-4 py-1.5 text-[14px]",
              isActive
                ? "bg-[#FFFFFF] dark:bg-[#0f1622] text-[#0E1B2C] dark:text-[#f8fafc] shadow-[0_1px_2px_rgba(14,27,44,0.08)] font-semibold"
                : "text-[#4A586A] dark:text-[#94a3b8] hover:text-[#0E1B2C] dark:hover:text-[#FFFFFF]"
            )}
          >
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={cn(
                  "text-[11px] px-1.5 py-0.2 rounded-full tabular-nums font-semibold",
                  isActive
                    ? "bg-[#EEF1F5] dark:bg-white/10 text-[#0E1B2C] dark:text-white"
                    : "bg-[#D3DAE3]/60 dark:bg-white/5 text-[#4A586A]"
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ==========================================
// PILL / CHIP: tags de status e categorias
// ==========================================
export function AppChip({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "danger" | "warn" | "focal-gain" | "focal-loss" | "blue";
  className?: string;
}) {
  const variants = {
    default: "bg-[#EEF1F5] dark:bg-white/10 text-[#0E1B2C] dark:text-white border border-[#E7EBF0] dark:border-white/10",
    success: "bg-[#E6F4F1] text-[#0A7A59] border border-[#BDE5D8]",
    danger: "bg-[#FDF4F3] text-[#B42318] border border-[#F1C9C5]",
    warn: "bg-[#FFF4DC] text-[#6B4300] border border-[#FFE7A8]",
    "focal-gain": "bg-[rgba(91,227,168,0.16)] text-[#5BE3A8] border border-[rgba(91,227,168,0.3)]",
    "focal-loss": "bg-[rgba(255,138,128,0.16)] text-[#FF8A80] border border-[rgba(255,138,128,0.3)]",
    blue: "bg-[#E7EEFC] text-[#1F4FB0] border border-[#C5D7FA]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-[999px] text-[12px] font-instrument-sans font-medium tabular-nums select-none",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// ==========================================
// SWITCH BOTÃO COM ARIA-PRESSED
// ==========================================
export function AppSwitch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center space-x-2.5 select-none", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F5FD6] focus-visible:ring-offset-2",
          checked
            ? "bg-[#0B8F6A]"
            : "bg-[#D3DAE3] dark:bg-[#334155]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
      {label && (
        <span className="text-[14px] font-instrument-sans font-medium text-[#0E1B2C] dark:text-[#f8fafc]">
          {label}
        </span>
      )}
    </div>
  );
}

// ==========================================
// NOTICE / BANNER
// ==========================================
export function NoticeBanner({
  title,
  description,
  variant = "warn",
  action,
  className,
}: {
  title: string;
  description?: string;
  variant?: "warn" | "info" | "error";
  action?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    warn: "bg-[#FFF4DC] border-[#FFE7A8] text-[#6B4300]",
    info: "bg-[#E7EEFC] border-[#C5D7FA] text-[#1F4FB0]",
    error: "bg-[#FDF4F3] border-[#F1C9C5] text-[#B42318]",
  };

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-[16px] border gap-3 font-instrument-sans",
        styles[variant],
        className
      )}
    >
      <div className="space-y-0.5">
        <h4 className="font-semibold text-[14px]">{title}</h4>
        {description && <p className="text-[13px] opacity-90">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ==========================================
// EMPTY STATE
// ==========================================
export function EmptyStateView({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-[24px] border-2 border-dashed border-[#D3DAE3] dark:border-white/10 space-y-3 font-instrument-sans",
        className
      )}
    >
      {icon && <div className="p-3 bg-[#EEF1F5] dark:bg-white/5 rounded-full text-[#4A586A] dark:text-[#94a3b8]">{icon}</div>}
      <h3 className="text-[18px] font-semibold text-[#0E1B2C] dark:text-[#f8fafc]">{title}</h3>
      <p className="text-[14px] text-[#4A586A] dark:text-[#94a3b8] max-w-md">{description}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

