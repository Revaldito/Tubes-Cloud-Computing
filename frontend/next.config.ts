import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const backendUrl = (process.env.BACKEND_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");

export default function nextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    outputFileTracingRoot: path.resolve(__dirname, ".."),
    poweredByHeader: false,
    async headers() {
      return [
        {
          source: "/menu/:path*",
          headers: [
            {
              key: "Cache-Control",
              value: "public, max-age=86400, stale-while-revalidate=604800",
            },
          ],
        },
        {
          source: "/hero-banatier-v2.jpg",
          headers: [
            {
              key: "Cache-Control",
              value: "public, max-age=86400, stale-while-revalidate=604800",
            },
          ],
        },
        {
          source: "/hero-banatier.jpg",
          headers: [
            {
              key: "Cache-Control",
              value: "public, max-age=86400, stale-while-revalidate=604800",
            },
          ],
        },
        {
          source: "/qris-ayyas.jpg",
          headers: [
            {
              key: "Cache-Control",
              value: "public, max-age=86400, stale-while-revalidate=604800",
            },
          ],
        },
        {
          source: "/:path*",
          headers: [
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=()",
            },
            {
              key: "Content-Security-Policy",
              value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
            },
          ],
        },
      ];
    },
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ];
    },
  };
}
