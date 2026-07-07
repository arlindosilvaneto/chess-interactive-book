import path from "path";

import {
  parseBestMoveLine,
  parseInfoLine,
  type EngineLine,
} from "@/components/engine/stockfish.worker";

/**
 * Server-side counterpart to `components/engine/useStockfish.ts`'s Web
 * Worker: runs the *same* single-threaded lite WASM build the browser uses
 * by default, but directly in the Node process — no Worker/`postMessage`
 * hop, and (on a warm serverless instance) no per-request WASM
 * instantiation cost, since the engine below is a module-scope singleton
 * reused across invocations of the same warm instance.
 *
 * This deliberately does NOT go through the `stockfish` npm package's own
 * Node entry point (`index.js`, `require("stockfish")`). That file locates
 * the build via a *runtime-computed* path
 * (`require(path.join(__dirname, "bin", filename))`) — Next's build-time
 * bundler/file-tracer (Turbopack) can't statically follow that and fails
 * with "Module not found ... <dynamic>" the instant this route is hit, even
 * though the identical engine code runs fine in a plain Node script
 * (verified directly). Requiring the exact build file with a literal
 * string, as below, is exactly as statically-resolvable to the bundler as
 * any normal import and sidesteps the problem entirely.
 *
 * It also doesn't give the caller any way to read engine output —
 * `index.js` never sets `engine.listener`, so all UCI lines silently go to
 * `console.log`/`console.error` instead. The Emscripten module's
 * `print`/`printErr` callbacks check `config.listener` at *call time*, and
 * `config` here is the exact object we pass in and get handed back — so
 * setting `.listener` on it after creation does work, it's just an
 * unlisted side door onto the object rather than a documented API.
 */
const ENGINE_JS_PATH = "stockfish/bin/stockfish-18-lite-single.js";
const ENGINE_WASM_FILENAME = "stockfish-18-lite-single.wasm";
const HANDSHAKE_TIMEOUT_MS = 15_000;
const SEARCH_TIMEOUT_MS = 30_000;
const HASH_MB = 32;

interface StockfishEmscriptenConfig {
  locateFile?: (file: string) => string;
  listener?: (line: string) => void;
  ccall?: (
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[],
    opts?: { async?: boolean }
  ) => unknown;
}

type StockfishModuleFactory = (
  config: StockfishEmscriptenConfig
) => Promise<StockfishEmscriptenConfig>;

let enginePromise: Promise<StockfishEmscriptenConfig> | null = null;
let readyPromise: Promise<void> | null = null;
// The engine has exactly one `listener` slot and can only run one search at
// a time — concurrent `evaluatePosition` calls (e.g. two boards on the same
// page both using the server source) are serialized through this queue
// rather than racing to overwrite each other's listener.
let queue: Promise<unknown> = Promise.resolve();

export interface ServerEvaluateOptions {
  depth: number;
  multiPv: number;
}

export interface ServerEvaluateResult {
  lines: EngineLine[];
  bestMove: string | undefined;
}

function sendCommand(engine: StockfishEmscriptenConfig, command: string): void {
  // Mirrors the wrapper the engine's own compiled JS uses internally for
  // this exact call — `go` searches run async, everything else sync.
  setImmediate(() => {
    engine.ccall?.("command", null, ["string"], [command], {
      async: /^go\b/.test(command),
    });
  });
}

function createEngine(): Promise<StockfishEmscriptenConfig> {
  // Literal specifier, resolved statically by the bundler — see file doc comment.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const required: unknown = require(ENGINE_JS_PATH);
  // Turbopack's bundling of this CJS `module.exports = <function>` file
  // doesn't come through as a bare function the way plain Node's `require`
  // does (verified against the dev server) — it arrives wrapped as
  // `{ default: <function> }` instead, matching ESM-interop shape. Accept
  // either so this keeps working regardless of which one shows up.
  const getModuleFactory = (
    typeof required === "function" ? required : (required as { default: unknown }).default
  ) as () => StockfishModuleFactory;

  // NOT `require.resolve(ENGINE_JS_PATH)`: Turbopack rewrites that into its
  // own virtual `[project]/...` module identifier rather than a real
  // filesystem path (confirmed against the actual dev server —
  // `fs.readFileSync` on the result throws ENOENT), so it can't be handed
  // to `locateFile` below. Building the path from `process.cwd()` instead
  // sidesteps the module system entirely — Vercel Node.js Functions (and
  // `next dev`/`next start`) run with cwd at the project/function-bundle
  // root, which is exactly where `outputFileTracingIncludes`
  // (next.config.ts) places `node_modules/stockfish/bin/**` in production.
  const jsPath = path.join(process.cwd(), "node_modules", ...ENGINE_JS_PATH.split("/"));
  const wasmPath = path.join(path.dirname(jsPath), ENGINE_WASM_FILENAME);

  const config: StockfishEmscriptenConfig = {
    locateFile: (file) => (file.indexOf(".wasm") > -1 ? wasmPath : jsPath),
  };

  // CRITICAL: the compiled engine's own Node-detection shim
  // (`"undefined"!=typeof global && ... && "undefined"!=typeof fetch &&
  // (...,fetch=null)` in the vendored .js) unconditionally sets the GLOBAL
  // `fetch` to `null` the moment it detects it's running under Node — it's
  // an old-Node-compat shim (falls back to an `fs`-based XHR polyfill for
  // its own WASM loading) that only checks `typeof global.process`, not
  // whether `fetch` already works. Since this engine runs in the same
  // Node.js process as every other route (the Lichess proxy, the AI SDK's
  // HTTP calls in /api/chat), leaving this in place silently breaks fetch
  // everywhere else in the server for the rest of its process lifetime the
  // first time any board uses the server analysis source — confirmed live:
  // /api/lichess and /api/chat both started throwing "fetch is not a
  // function" immediately after the first /api/engine/evaluate call. The
  // nulling happens synchronously inside this call (before any `await`),
  // so snapshotting and restoring `fetch` immediately after is safe and
  // sufficient — this engine never needs fetch itself, since `locateFile`
  // above already routes its WASM loading through `fs`, not the network.
  const originalFetch = globalThis.fetch;
  const readyPromise = getModuleFactory()(config);
  if (globalThis.fetch !== originalFetch) {
    globalThis.fetch = originalFetch;
  }
  return readyPromise;
}

function waitForLine(
  engine: StockfishEmscriptenConfig,
  matches: (line: string) => boolean,
  timeoutMs: number,
  timeoutMessage: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      engine.listener = undefined;
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    engine.listener = (line) => {
      if (matches(line)) {
        clearTimeout(timeout);
        engine.listener = undefined;
        resolve();
      }
    };
  });
}

/** Creates (once) and completes the UCI handshake on the shared engine instance. */
async function getReadyEngine(): Promise<StockfishEmscriptenConfig> {
  if (!enginePromise) {
    enginePromise = createEngine();
  }
  const engine = await enginePromise;

  if (!readyPromise) {
    readyPromise = (async () => {
      const uciAck = waitForLine(
        engine,
        (line) => line === "uciok",
        HANDSHAKE_TIMEOUT_MS,
        'Engine did not respond to "uci".'
      );
      sendCommand(engine, "uci");
      await uciAck;

      sendCommand(engine, `setoption name Hash value ${HASH_MB}`);

      const readyAck = waitForLine(
        engine,
        (line) => line === "readyok",
        HANDSHAKE_TIMEOUT_MS,
        'Engine did not respond to "isready".'
      );
      sendCommand(engine, "isready");
      await readyAck;
    })();
  }
  await readyPromise;

  return engine;
}

async function runSearch(
  fen: string,
  { depth, multiPv }: ServerEvaluateOptions
): Promise<ServerEvaluateResult> {
  const engine = await getReadyEngine();

  sendCommand(engine, `setoption name MultiPV value ${multiPv}`);
  sendCommand(engine, `position fen ${fen}`);

  const lines = new Map<number, EngineLine>();
  let bestMove: string | undefined;

  const searchDone = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      engine.listener = undefined;
      reject(new Error("Engine search timed out."));
    }, SEARCH_TIMEOUT_MS);

    engine.listener = (line) => {
      const info = parseInfoLine(line);
      if (info) {
        lines.set(info.multipv, info);
        return;
      }
      const best = parseBestMoveLine(line);
      if (best) {
        clearTimeout(timeout);
        engine.listener = undefined;
        bestMove = best.bestMove;
        resolve();
      }
    };
  });

  sendCommand(engine, `go depth ${depth}`);
  await searchDone;

  return {
    lines: Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv),
    bestMove,
  };
}

/** Evaluates `fen` to a fixed depth, returning once the search's `bestmove` line arrives (not incrementally — see the route's doc comment for why). */
export function evaluatePosition(
  fen: string,
  options: ServerEvaluateOptions
): Promise<ServerEvaluateResult> {
  const run = queue.then(() => runSearch(fen, options));
  // A failed search must not wedge the queue for requests behind it.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
