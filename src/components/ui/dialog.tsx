"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon, Maximize2, Minimize2 } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  resizable = true,
  allowMaximize = true,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  resizable?: boolean
  allowMaximize?: boolean
}) {
  const internalRef = React.useRef<HTMLDivElement>(null)
  const [isMaximized, setIsMaximized] = React.useState(false)
  const [customSize, setCustomSize] = React.useState<{ width: number; height: number } | null>(null)
  const [isResizing, setIsResizing] = React.useState(false)

  const hasCustomMaxWidth = className && /(^|\s)(sm:)?max-w-/.test(className)

  const toggleMaximize = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsMaximized((prev) => !prev)
  }

  // Corner resize (Width + Height)
  const handleResizeCornerStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!internalRef.current) return

    const rect = internalRef.current.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = rect.width
    const startHeight = rect.height

    setIsResizing(true)

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY

      const maxWidth = window.innerWidth - 24
      const maxHeight = window.innerHeight - 24
      const minWidth = 340
      const minHeight = 220

      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx * 2))
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy * 2))

      setCustomSize({ width: Math.round(newWidth), height: Math.round(newHeight) })
      setIsMaximized(false)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  // Right edge resize (Width only)
  const handleResizeRightStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!internalRef.current) return

    const rect = internalRef.current.getBoundingClientRect()
    const startX = e.clientX
    const startWidth = rect.width
    const currentHeight = customSize?.height || rect.height

    setIsResizing(true)

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      const dx = moveEvent.clientX - startX
      const maxWidth = window.innerWidth - 24
      const minWidth = 340
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx * 2))

      setCustomSize({ width: Math.round(newWidth), height: Math.round(currentHeight) })
      setIsMaximized(false)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  // Bottom edge resize (Height only)
  const handleResizeBottomStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!internalRef.current) return

    const rect = internalRef.current.getBoundingClientRect()
    const startY = e.clientY
    const startHeight = rect.height
    const currentWidth = customSize?.width || rect.width

    setIsResizing(true)

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      const dy = moveEvent.clientY - startY
      const maxHeight = window.innerHeight - 24
      const minHeight = 220
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy * 2))

      setCustomSize({ width: Math.round(currentWidth), height: Math.round(newHeight) })
      setIsMaximized(false)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  // Touch resize for corner
  const handleTouchResizeStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !internalRef.current) return
    const touch = e.touches[0]
    const rect = internalRef.current.getBoundingClientRect()
    const startX = touch.clientX
    const startY = touch.clientY
    const startWidth = rect.width
    const startHeight = rect.height

    setIsResizing(true)

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return
      const currentTouch = moveEvent.touches[0]
      const dx = currentTouch.clientX - startX
      const dy = currentTouch.clientY - startY

      const maxWidth = window.innerWidth - 24
      const maxHeight = window.innerHeight - 24
      const minWidth = 320
      const minHeight = 220

      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx * 2))
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy * 2))

      setCustomSize({ width: Math.round(newWidth), height: Math.round(newHeight) })
      setIsMaximized(false)
    }

    const onTouchEnd = () => {
      setIsResizing(false)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
    }

    window.addEventListener("touchmove", onTouchMove, { passive: false })
    window.addEventListener("touchend", onTouchEnd)
  }

  const computedStyle: React.CSSProperties = {
    ...style,
    ...(isMaximized
      ? {
          width: "calc(100vw - 2rem)",
          height: "calc(100vh - 2rem)",
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "calc(100vh - 2rem)",
        }
      : customSize
      ? {
          width: `${customSize.width}px`,
          height: `${customSize.height}px`,
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "calc(100vh - 2rem)",
        }
      : {}),
  }

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={internalRef}
        data-slot="dialog-content"
        style={computedStyle}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100vh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200",
          !hasCustomMaxWidth && !customSize && !isMaximized && "sm:max-w-lg",
          isResizing && "select-none transition-none",
          className
        )}
        {...props}
      >
        {children}

        {/* Top-Right Window Controls (Maximize / Restore + Close) */}
        <div className="absolute top-3.5 right-3.5 z-30 flex items-center gap-1">
          {allowMaximize && (
            <button
              type="button"
              onClick={toggleMaximize}
              className="p-1.5 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.1] transition-colors focus:outline-none cursor-pointer"
              title={isMaximized ? "Restaurar tamanho original" : "Maximizar pop-up"}
              aria-label={isMaximized ? "Restaurar tamanho" : "Maximizar"}
            >
              {isMaximized ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </button>
          )}

          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="p-1.5 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.1] transition-colors focus:outline-none cursor-pointer disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </div>

        {/* Resize Handles */}
        {resizable && !isMaximized && (
          <>
            {/* Right edge strip */}
            <div
              onMouseDown={handleResizeRightStart}
              className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-cyan-500/10 transition-colors z-20"
              title="Arraste para ajustar largura"
            />
            {/* Bottom edge strip */}
            <div
              onMouseDown={handleResizeBottomStart}
              className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize hover:bg-cyan-500/10 transition-colors z-20"
              title="Arraste para ajustar altura"
            />
            {/* Corner Grip Icon */}
            <div
              onMouseDown={handleResizeCornerStart}
              onTouchStart={handleTouchResizeStart}
              className="absolute bottom-1 right-1 p-1 cursor-nwse-resize select-none touch-none text-muted-foreground/40 hover:text-cyan-400 transition-colors z-30 group"
              title="Arraste para redimensionar"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                className="transition-transform group-hover:scale-110"
              >
                <path
                  d="M14 6L6 14M14 10L10 14M14 14L14 14.01"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
