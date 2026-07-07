import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables crossOriginIsolated so the multi-threaded Stockfish WASM build
  // (SharedArrayBuffer) can be used when available; engine falls back to the
  // single-threaded build otherwise. See components/engine/useStockfish.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
