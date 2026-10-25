import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async redirects() {
    return [
      {
        source: "/smart-trading",
        destination: "/",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/ticker",
        destination: "/api/market/ticker",
      },
      {
        source: "/api/klines",
        destination: "/api/market/klines",
      },
      {
        source: "/api/highlights",
        destination: "/api/market/highlights",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
