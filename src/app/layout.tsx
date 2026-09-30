import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Crypto IA Pro - Advanced Trading & Analysis Platform",
  description:
    "Advanced cryptocurrency trading platform with AI-powered analysis, automated trading bots, and comprehensive market insights.",
  keywords: [
    "Crypto",
    "Trading",
    "AI",
    "Bitcoin",
    "Ethereum",
    "Cryptocurrency",
    "Bot Trading",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

