"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface MobileSectionProps {
  title: string;
  icon?: string;
  itemCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function MobileSection({
  title,
  icon,
  itemCount,
  defaultOpen = false,
  children,
}: MobileSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col">
      {/* Section Header - only visible on mobile, clickable toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden flex items-center justify-between w-full glass rounded-xl px-4 py-3 mb-2 active:scale-[0.98] transition-transform duration-150"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <span className="font-semibold gradient-text-cyan text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">
            {itemCount}
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </div>
      </button>

      {/* Content area */}
      {/* On mobile: animated show/hide based on isOpen */}
      <div className="md:hidden">
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden space-y-3"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* On desktop: always visible */}
      <div className="hidden md:block space-y-4">
        {children}
      </div>
    </div>
  );
}
