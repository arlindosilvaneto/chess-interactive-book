import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Stockfish WASM engine builds, copied verbatim from
    // node_modules/stockfish/bin/ by scripts/copy-stockfish-assets.mjs —
    // not our source, shouldn't be linted.
    "public/stockfish/**",
    // Vendored AI Elements component source, installed verbatim via
    // `npx ai-elements add` from the shadcn-style registry — not our source,
    // shouldn't be linted or hand-edited to satisfy our lint rules.
    "components/ai-elements/**",
  ]),
]);

export default eslintConfig;
