"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SmartSwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function SmartSwitch({
  checked,
  onCheckedChange,
  onChange,
  label,
  description,
  disabled = false,
}: SmartSwitchProps) {
  const handleChange = (newVal: boolean) => {
    if (onCheckedChange) onCheckedChange(newVal);
    if (onChange) onChange(newVal);
  };
  return (
    <div className="flex items-center justify-between gap-4 select-none">
      {(label || description) && (
        <div>
          {label && <p className="text-sm font-semibold text-white">{label}</p>}
          {description && <p className="text-xs text-neutral-400">{description}</p>}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && handleChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-blue-600 shadow-sm shadow-blue-500/50" : "bg-neutral-800"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}
