"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SmartModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  size?: "sm" | "md" | "lg" | "xl";
}

export function SmartModal({
  isOpen,
  onClose,
  title,
  description,
  subtitle,
  children,
  footer,
  maxWidth = "md",
  size,
}: SmartModalProps) {
  const modalDescription = subtitle || description;
  const activeWidth = size || maxWidth;
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className={cn(
          "relative w-full rounded-2xl bg-[#141414] border border-neutral-800 cyan-glow-sm shadow-2xl z-10 overflow-hidden transform transition-all animate-scaleUp",
          maxWidthStyles[activeWidth]
        )}
      >
        {/* Header */}
        {(title || modalDescription) && (
          <div className="p-5 border-b border-neutral-800 flex items-start justify-between">
            <div>
              {title && <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>}
              {modalDescription && <p className="text-xs text-neutral-400 mt-1">{modalDescription}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto cyan-scrollbar">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-4 px-6 bg-neutral-900/80 border-t border-neutral-800 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
