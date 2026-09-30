import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
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
};

export default nextConfig;
