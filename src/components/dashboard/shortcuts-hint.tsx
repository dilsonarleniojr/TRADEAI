"use client";

import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Keyboard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const shortcuts = [
  { keys: ["1", "-", "6"], label: "Navigate sections" },
  { keys: ["B"], label: "Toggle bot" },
  { keys: ["T"], label: "Toggle theme" },
  { keys: ["M"], label: "Toggle trading mode" },
  { keys: ["S"], label: "Cycle symbols" },
];

export function ShortcutsHint() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="fixed bottom-16 left-3 md:bottom-4 md:left-4 z-50 w-9 h-9 rounded-full bg-secondary/60 border border-border/50 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 hover:border-border transition-all duration-200 shadow-sm"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56 p-3 bg-popover/95 backdrop-blur-md border border-border/60 shadow-lg rounded-xl"
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                Keyboard Shortcuts
              </p>
              <div className="space-y-2">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      {shortcut.label}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {shortcut.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded text-[10px] font-mono font-medium bg-secondary border border-border/60 text-foreground/70"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
