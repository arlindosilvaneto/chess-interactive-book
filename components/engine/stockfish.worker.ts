/**
 * Thin typed wrapper around a Stockfish WASM Web Worker, talking UCI over
 * postMessage.
 *
 * Deliberately NOT created via `new Worker(new URL('./stockfish.worker.ts',
 * import.meta.url))`. The vendored engine builds
 * (node_modules/stockfish/bin/stockfish-*.js) are themselves complete,
 * self-initializing worker scripts — they detect they're running in a
 * worker context and wire up `onmessage`/`postMessage` for the UCI protocol
 * on their own, and locate their `.wasm` pair next to themselves via
 * `self.location.href`. Letting Turbopack bundle that script as our worker
 * module instead trips a known bug where the bundled worker executes in a
 * `blob:` URL context with no usable origin to resolve the sibling `.wasm`
 * file against (https://github.com/vercel/next.js/issues/84782).
 *
 * Instead, `scripts/copy-stockfish-assets.mjs` copies the engine + wasm
 * pair into `public/stockfish/`, and this module does
 * `new Worker("/stockfish/<file>.js")` directly against that stable public
 * URL — exactly how the upstream project's own browser integration works.
 */

export interface EngineLine {
  multipv: number;
  depth: number;
  scoreCp?: number;
  scoreMate?: number;
  /** UCI long-algebraic moves, e.g. ["e2e4", "e7e5", "g1f3"]. */
  pv: string[];
}

export interface EngineBestMove {
  bestMove: string;
  ponder?: string;
}

export interface StockfishClientCallbacks {
  onReady?: () => void;
  onInfo?: (line: EngineLine) => void;
  onBestMove?: (result: EngineBestMove) => void;
  /** Fires if the worker script fails to load/execute (e.g. missing public/stockfish assets). */
  onError?: (message: string) => void;
}

/** Exported for reuse by `lib/engine/nodeStockfishEngine.ts` — the server-side engine speaks the same UCI text protocol, just without a Worker in between. */
export function parseInfoLine(line: string): EngineLine | null {
  if (!line.startsWith("info") || !line.includes(" pv ")) return null;

  const depthMatch = line.match(/\bdepth (\d+)/);
  const multipvMatch = line.match(/\bmultipv (\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);
  if (!pvMatch) return null;

  return {
    depth: depthMatch ? Number(depthMatch[1]) : 0,
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    scoreCp: cpMatch ? Number(cpMatch[1]) : undefined,
    scoreMate: mateMatch ? Number(mateMatch[1]) : undefined,
    pv: pvMatch[1].trim().split(/\s+/),
  };
}

export function parseBestMoveLine(line: string): EngineBestMove | null {
  const match = line.match(/^bestmove (\S+)(?: ponder (\S+))?/);
  if (!match) return null;
  return { bestMove: match[1], ponder: match[2] };
}

export class StockfishClient {
  private worker: Worker;
  private callbacks: StockfishClientCallbacks;

  constructor(scriptUrl: string, callbacks: StockfishClientCallbacks = {}) {
    this.callbacks = callbacks;
    this.worker = new Worker(scriptUrl);
    this.worker.onmessage = (event: MessageEvent<string>) => {
      this.handleMessage(String(event.data));
    };
    this.worker.onerror = (event: ErrorEvent) => {
      this.callbacks.onError?.(
        event.message || `Failed to load engine worker at ${scriptUrl}`
      );
    };
    this.worker.postMessage("uci");
  }

  private handleMessage(line: string) {
    if (line === "uciok") {
      this.send("isready");
      return;
    }
    if (line === "readyok") {
      this.callbacks.onReady?.();
      return;
    }
    if (line.startsWith("bestmove")) {
      const result = parseBestMoveLine(line);
      if (result) this.callbacks.onBestMove?.(result);
      return;
    }
    if (line.startsWith("info")) {
      const info = parseInfoLine(line);
      if (info) this.callbacks.onInfo?.(info);
    }
  }

  send(command: string) {
    this.worker.postMessage(command);
  }

  setOption(name: string, value: string | number) {
    this.send(`setoption name ${name} value ${value}`);
  }

  setPosition(fen: string) {
    this.send(`position fen ${fen}`);
  }

  go(depth: number) {
    this.send(`go depth ${depth}`);
  }

  stop() {
    this.send("stop");
  }

  terminate() {
    this.worker.terminate();
  }
}
