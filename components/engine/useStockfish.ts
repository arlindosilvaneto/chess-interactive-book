"use client";

import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useEngineSettingsStore } from "@/lib/store/engineSettingsStore";

import { StockfishClient, type EngineLine } from "./stockfish.worker";

const SINGLE_THREAD_SCRIPT = "/stockfish/stockfish-18-lite-single.js";
const MULTI_THREAD_SCRIPT = "/stockfish/stockfish-18.js";

/** Holding an arrow key or clicking "next" repeatedly shouldn't restart the engine's search per intermediate position — wait for things to settle first. */
const SEARCH_DEBOUNCE_MS = 300;

/** The multi-threaded WASM build needs SharedArrayBuffer, gated on COOP/COEP headers. */
export function supportsCrossOriginIsolation(): boolean {
  return typeof self !== "undefined" && self.crossOriginIsolated === true;
}

export interface UseStockfishOptions {
  /** Skips spinning up a worker at all while false — avoids running one engine per board. */
  enabled?: boolean;
}

export interface UseStockfishResult {
  ready: boolean;
  analyzing: boolean;
  /** Sorted by multipv ascending; index 0 is the primary line. */
  lines: EngineLine[];
  bestMove: string | undefined;
  engineLabel: string;
  usingMultiThread: boolean;
  /** Set if the worker script failed to load, or never became ready. */
  error: string | undefined;
  /**
   * The FEN that `lines`/`bestMove` actually reflect — trails the caller's
   * `fen` argument while a search is in flight and a stale result is being
   * held over. See `useCloudEval`'s identical field for why a caller must
   * derive side-to-move from this, not from whatever position is now
   * current.
   */
  resultFen: string | undefined;
}

/** If the engine hasn't reported ready by this point, treat it as a load failure
 * rather than leaving the UI stuck on "Loading engine…" forever. */
const READY_TIMEOUT_MS = 15_000;

export function useStockfish(
  fen: string | undefined,
  { enabled = true }: UseStockfishOptions = {}
): UseStockfishResult {
  const settings = useEngineSettingsStore((state) => state.settings);

  const usingMultiThread =
    settings.useMultiThreadIfAvailable && supportsCrossOriginIsolation();
  const scriptUrl = usingMultiThread ? MULTI_THREAD_SCRIPT : SINGLE_THREAD_SCRIPT;

  const clientRef = useRef<StockfishClient | null>(null);
  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [bestMove, setBestMove] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [resultFen, setResultFen] = useState<string | undefined>(undefined);
  // Mutable, not state: read from the `onInfo`/`onBestMove` closures (set up
  // once per worker lifetime) to know which FEN the search *currently*
  // running against the engine was started for — updated synchronously
  // right before each `client.go()` below, so even info lines that arrive
  // before React re-renders are attributed to the right position.
  const searchFenRef = useRef<string | undefined>(undefined);

  // Create/tear down the worker when analysis is (de)activated or the
  // chosen build changes.
  useEffect(() => {
    if (!enabled) return;

    // Resetting to a fresh loading state is the correct synchronization here:
    // a brand-new worker is being created below, so any previous engine's
    // results are stale.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false);
    setLines([]);
    setBestMove(undefined);
    setError(undefined);
    setResultFen(undefined);
    searchFenRef.current = undefined;

    const readyTimeout = window.setTimeout(() => {
      setError((prev) => prev ?? "Engine did not respond — it may have failed to load.");
    }, READY_TIMEOUT_MS);

    const client = new StockfishClient(scriptUrl, {
      onReady: () => {
        window.clearTimeout(readyTimeout);
        // Read settings imperatively (not via a render-time ref) since this
        // callback fires asynchronously, well outside any render.
        const current = useEngineSettingsStore.getState().settings;
        client.setOption("MultiPV", current.multiPv);
        if (usingMultiThread) {
          client.setOption("Threads", current.threads);
        }
        client.setOption("Hash", current.hashMb);
        setReady(true);
      },
      onInfo: (line) => {
        setResultFen(searchFenRef.current);
        setLines((prev) => {
          const next = prev.filter(
            (existing) => existing.multipv !== line.multipv
          );
          next.push(line);
          next.sort((a, b) => a.multipv - b.multipv);
          return next;
        });
      },
      onBestMove: (result) => {
        setResultFen(searchFenRef.current);
        setBestMove(result.bestMove);
        setAnalyzing(false);
      },
      onError: (message) => {
        setError(message);
        setReady(false);
      },
    });
    clientRef.current = client;

    return () => {
      window.clearTimeout(readyTimeout);
      client.terminate();
      clientRef.current = null;
    };
  }, [enabled, scriptUrl, usingMultiThread]);

  // Re-apply option changes in place once ready, without recreating the worker.
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !ready) return;
    client.setOption("MultiPV", settings.multiPv);
    if (usingMultiThread) {
      client.setOption("Threads", settings.threads);
    }
    client.setOption("Hash", settings.hashMb);
  }, [ready, settings.multiPv, settings.threads, settings.hashMb, usingMultiThread]);

  const debouncedFen = useDebouncedValue(fen, SEARCH_DEBOUNCE_MS);

  // Instant feedback as soon as the position changes — flips `analyzing` so
  // callers can show a busy indicator, but deliberately leaves `lines`/
  // `bestMove` alone (the previous position's result) until the debounced
  // restart below produces a new one via `onInfo`/`onBestMove` — clearing
  // eagerly here used to make the eval bar flick to neutral and back on
  // every move.
  useEffect(() => {
    if (!enabled || !fen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnalyzing(true);
  }, [fen, enabled]);

  // The actual engine restart — debounced so holding an arrow key or
  // clicking "next" repeatedly through a line doesn't restart Stockfish's
  // search once per intermediate position, only once things settle.
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !ready || !enabled || !debouncedFen) return;

    searchFenRef.current = debouncedFen;
    client.stop();
    client.setPosition(debouncedFen);
    client.go(settings.depth);
  }, [debouncedFen, ready, enabled, settings.depth]);

  return {
    ready,
    analyzing,
    lines,
    bestMove,
    engineLabel: usingMultiThread
      ? "Stockfish 18 (multi-thread)"
      : "Stockfish 18 Lite (single-thread)",
    usingMultiThread,
    error,
    resultFen,
  };
}
