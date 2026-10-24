/**
 * Smart Trading Design System - Core Design Tokens
 * ------------------------------------------------
 * Tokenized specification for typography, color palettes (Dark & Light modes),
 * spacing, border radii, shadows, and animation transitions.
 * Inspired by Binance, TradingView, Notion, and Revolut.
 */

export const SmartTradingTokens = {
  meta: {
    name: "Smart Trading Design System",
    version: "2.0.0",
    description: "Fintech-grade, institutional trading UI design system for AI-powered crypto platforms.",
  },

  // 1. Color Palettes
  colors: {
    // Primary - Electric Blue
    primary: {
      50: "#EFF6FF",
      100: "#DBEAFE",
      200: "#BFDBFE",
      300: "#93C5FD",
      400: "#60A5FA",
      500: "#3B82F6", // Primary Electric Blue
      600: "#2563EB", // Deep Electric Blue
      700: "#1D4ED8", // Dark Navy Blue
      800: "#1E40AF",
      900: "#1E3A8A",
      950: "#172554",
    },

    // Secondary - Technological Purple
    secondary: {
      50: "#F5F3FF",
      100: "#EDE9FE",
      200: "#DDD6FE",
      300: "#C4B5FD",
      400: "#A78BFA",
      500: "#8B5CF6", // Technological Purple
      600: "#7C3AED", // Deep Violet
      700: "#6D28D9",
      800: "#5B21B6",
      900: "#4C1D95",
      950: "#2E1065",
    },

    // Feedback & Financial Status
    feedback: {
      success: {
        50: "#F0FDF4",
        100: "#DCFCE7",
        400: "#4ADE80",
        500: "#22C55E", // High/Profit Green
        600: "#16A34A",
        700: "#15803D",
      },
      danger: {
        50: "#FEF2F2",
        100: "#FEE2E2",
        400: "#F87171",
        500: "#EF4444", // Low/Loss Red
        600: "#DC2626",
        700: "#B91C1C",
      },
      warning: {
        50: "#FFFBEB",
        100: "#FEF3C7",
        400: "#FBBF24",
        500: "#F59E0B", // Alert/Warning Amber
        600: "#D97706",
        700: "#B45309",
      },
      info: {
        50: "#F0F9FF",
        100: "#E0F2FE",
        400: "#38BDF8",
        500: "#0EA5E9",
        600: "#0284C7",
      },
    },

    // Neutrals - Dark Mode (Default)
    dark: {
      background: "#0D0D0D", // Deep Black
      surface: "#141414",    // Card Background
      surfaceElevated: "#1A1A1A", // Graphite Hover / Modal
      surfaceBorder: "#2E2E2E",   // Charcoal Divider
      surfaceBorderSubtle: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#FFFFFF",     // Pure White
      textSecondary: "#A1A1AA",   // Muted Gray
      textTertiary: "#71717A",    // Subtle Gray
      accentGlow: "rgba(59, 130, 246, 0.15)", // Electric Glow
      purpleGlow: "rgba(139, 92, 246, 0.15)", // Violet Glow
    },

    // Neutrals - Light Mode
    light: {
      background: "#F8FAFC", // Clean Off-White
      surface: "#FFFFFF",    // Crisp Card
      surfaceElevated: "#F1F5F9", // Slate Tint
      surfaceBorder: "#E2E8F0",   // Light Gray Border
      surfaceBorderSubtle: "rgba(0, 0, 0, 0.06)",
      textPrimary: "#0A0A0A",     // Pure Black
      textSecondary: "#475569",   // Slate Gray
      textTertiary: "#94A3B8",    // Light Slate
      accentGlow: "rgba(59, 130, 246, 0.08)",
      purpleGlow: "rgba(139, 92, 246, 0.08)",
    },
  },

  // 2. Typography
  typography: {
    fontFamilies: {
      primary: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      numeric: "'JetBrains Mono', 'Roboto Mono', Menlo, monospace",
    },
    sizes: {
      "display-lg": { fontSize: "48px", lineHeight: "56px", fontWeight: "700" },
      "display-sm": { fontSize: "32px", lineHeight: "40px", fontWeight: "700" },
      title: { fontSize: "24px", lineHeight: "32px", fontWeight: "700" },
      subtitle: { fontSize: "18px", lineHeight: "26px", fontWeight: "600" },
      body: { fontSize: "15px", lineHeight: "22px", fontWeight: "400" },
      "body-sm": { fontSize: "13px", lineHeight: "18px", fontWeight: "400" },
      caption: { fontSize: "11px", lineHeight: "16px", fontWeight: "500" },
      "numeric-lg": { fontSize: "28px", lineHeight: "34px", fontWeight: "600", letterSpacing: "-0.02em" },
      "numeric-md": { fontSize: "16px", lineHeight: "22px", fontWeight: "500", letterSpacing: "-0.01em" },
      "numeric-sm": { fontSize: "13px", lineHeight: "18px", fontWeight: "500", letterSpacing: "0em" },
    },
  },

  // 3. Spacing Grid
  spacing: {
    "space-2": "2px",
    "space-4": "4px",
    "space-8": "8px",
    "space-12": "12px",
    "space-16": "16px",
    "space-20": "20px",
    "space-24": "24px",
    "space-32": "32px",
    "space-48": "48px",
    "space-64": "64px",
  },

  // 4. Border Radius
  radii: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px",
  },

  // 5. Shadows & Glassmorphism
  shadows: {
    sm: "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.15)",
    glowBlue: "0 0 20px rgba(59, 130, 246, 0.35)",
    glowPurple: "0 0 20px rgba(139, 92, 246, 0.35)",
    glowSuccess: "0 0 16px rgba(34, 197, 94, 0.3)",
    glowDanger: "0 0 16px rgba(239, 68, 68, 0.3)",
  },

  // 6. Animation Transitions
  transitions: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    normal: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
    smooth: "350ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
} as const;

export type SmartTradingThemeMode = "dark" | "light";
