import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/engine/evaluate (lib/engine/nodeStockfishEngine.ts) loads the
  // `stockfish` package's Node build via `fs.readFileSync`/`fs.existsSync`
  // against dynamically-constructed paths (node_modules/stockfish/index.js)
  // — Next's build-time file tracer (@vercel/nft) can't statically follow
  // that to know the .wasm/.js pair need to ship with the deployed function,
  // so without this they'd 404 (or throw ENOENT) in production despite
  // working fine in `next dev`, where the full repo is on disk regardless.
  outputFileTracingIncludes: {
    "/api/engine/evaluate": ["./node_modules/stockfish/bin/**/*"],
  },
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
