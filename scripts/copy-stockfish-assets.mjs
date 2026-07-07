#!/usr/bin/env node
/**
 * Copies the Stockfish WASM engine builds we actually use from
 * node_modules/stockfish/bin/ into public/stockfish/ so they can be served
 * as static assets at a stable URL.
 *
 * Why this is needed: the vendored `stockfish-*.js` files are themselves
 * complete, self-initializing Web Worker scripts (they detect they're
 * running in a worker and wire up `onmessage`/`postMessage` for the UCI
 * protocol on their own — see node_modules/stockfish/bin/*.js). They locate
 * their `.wasm` pair next to themselves via `self.location.href`, so the
 * `.js` and `.wasm` files must be served from the same directory over HTTP,
 * not bundled through Turbopack/webpack (bundling the engine script trips a
 * known Next.js/Turbopack issue where WASM fetches from a worker fail
 * because the bundled worker runs in a `blob:` URL context with no usable
 * origin to resolve the sibling .wasm file against — see
 * https://github.com/vercel/next.js/issues/84782).
 *
 * `useStockfish` therefore does `new Worker("/stockfish/<file>.js")`
 * pointing directly at these public files instead of wrapping the engine in
 * a Turbopack-compiled worker module.
 *
 * Run via `npm run predev` / `npm run postinstall` (wired in package.json),
 * or manually: `node scripts/copy-stockfish-assets.mjs`.
 */
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const srcDir = join(repoRoot, "node_modules", "stockfish", "bin");
const destDir = join(repoRoot, "public", "stockfish");

// Default (recommended) single-threaded lite build + the full multi-threaded
// build offered as an opt-in when `self.crossOriginIsolated` is true.
const FILES = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
  "stockfish-18.js",
  "stockfish-18.wasm",
];

function main() {
  if (!existsSync(srcDir)) {
    console.warn(
      `[copy-stockfish-assets] ${srcDir} not found — is the "stockfish" package installed? Skipping.`
    );
    return;
  }

  mkdirSync(destDir, { recursive: true });

  let copied = 0;
  for (const file of FILES) {
    const src = join(srcDir, file);
    const dest = join(destDir, file);
    if (!existsSync(src)) {
      console.warn(`[copy-stockfish-assets] missing ${src}, skipping.`);
      continue;
    }
    copyFileSync(src, dest);
    copied += 1;
  }

  console.log(
    `[copy-stockfish-assets] copied ${copied}/${FILES.length} files to public/stockfish/`
  );
}

main();
