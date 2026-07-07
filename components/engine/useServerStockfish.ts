"use client";

import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

import type { EngineLine } from "./stockfish.worker";

/** Holding an arrow key or clicking "next" repeatedly shouldn't fire a server request per intermediate position — wait for things to settle first. */
const FETCH_DEBOUNCE_MS = 300;

export interface UseServerStockfishOptions {
  /** Skips fetching at all while false — avoids one request per board when this isn't the selected source. */
  enabled?: boolean;
  depth: number;
  multiPv: number;
}

export interface UseServerStockfishResult {
  /** True once a request for the current position/settings has resolved (success or error). */
  ready: boolean;
  analyzing: boolean;
  /** Sorted by multipv ascending; index 0 is the primary line. */
  lines: EngineLine[];
  bestMove: string | undefined;
  engineLabel: string;
  error: string | undefined;
}

interface EvaluateResponse {
  lines: EngineLine[];
  bestMove?: string;
}

/** Positions repeat often when paging back and forth — cache avoids re-running a server search for one already seen at the same depth/multiPv. */
const cache = new Map<string, EvaluateResponse>();

function cacheKey(fen: string, depth: number, multiPv: number): string {
  return `${fen}::${depth}::${multiPv}`;
}

/**
 * Runs Stockfish server-side (`POST /api/engine/evaluate`,
 * `lib/engine/nodeStockfishEngine.ts`) instead of in a browser Worker — same
 * engine build, same `EngineLine` output shape as `useStockfish`, so
 * `BoardCard` can treat this as a third interchangeable analysis source.
 * Structured the same way as `useCloudEval`: an instant-feedback effect on
 * the raw `fen` (cache hit resolves immediately, a miss shows loading) plus
 * a debounced effect that fires the actual request once the position
 * settles, so paging quickly through a line doesn't fire one request per
 * intermediate move.
 */
export function useServerStockfish(
  fen: string | undefined,
  { enabled = true, depth, multiPv }: UseServerStockfishOptions
): UseServerStockfishResult {
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [bestMove, setBestMove] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const debouncedFen = useDebouncedValue(fen, FETCH_DEBOUNCE_MS);

  // Instant feedback as soon as the position (or depth/multiPv) changes —
  // see useCloudEval's identically-shaped effect for the full rationale.
  useEffect(() => {
    if (!enabled || !fen) return;

    const cached = cache.get(cacheKey(fen, depth, multiPv));

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(undefined);

    if (cached) {
      setReady(true);
      setAnalyzing(false);
      setLines(cached.lines);
      setBestMove(cached.bestMove);
    } else {
      setReady(false);
      setAnalyzing(true);
      setLines([]);
      setBestMove(undefined);
    }
  }, [fen, enabled, depth, multiPv]);

  // The actual server request — debounced, see useCloudEval for why.
  useEffect(() => {
    if (!enabled || !debouncedFen) return;

    const key = cacheKey(debouncedFen, depth, multiPv);
    const cached = cache.get(key);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      setAnalyzing(false);
      setLines(cached.lines);
      setBestMove(cached.bestMove);
      return;
    }

    const controller = new AbortController();

    fetch("/api/engine/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen: debouncedFen, depth, multiPv }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as EvaluateResponse | { error: string };
        if (!res.ok) {
          throw new Error(
            "error" in data ? data.error : `Server evaluation request failed (${res.status}).`
          );
        }
        const result = data as EvaluateResponse;
        cache.set(key, result);
        setLines(result.lines);
        setBestMove(result.bestMove);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Server evaluation request failed."
        );
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setReady(true);
        setAnalyzing(false);
      });

    return () => controller.abort();
  }, [debouncedFen, enabled, depth, multiPv]);

  return {
    ready,
    analyzing,
    lines,
    bestMove,
    engineLabel: "Stockfish 18 Lite (server)",
    error,
  };
}
