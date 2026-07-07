"use client";

import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { CloudEvalResponse } from "@/types/lichess";

import type { EngineLine } from "./stockfish.worker";

/**
 * Deliberately longer than the local/server engine hooks' debounce (300ms):
 * Lichess's cloud-eval is a shared third-party resource with its own rate
 * limits (confirmed live — even the standard starting position, which is
 * always cached, started returning 429 "Too many requests" after enough
 * cumulative requests), unlike local/server Stockfish which only cost this
 * app's own CPU. Cloud is the default and generally best-quality source, so
 * it's worth erring conservative here specifically to avoid tripping that
 * limit during normal fast paging, even at the cost of feeling a bit less
 * snappy than the other two sources.
 */
const FETCH_DEBOUNCE_MS = 1000;

export interface UseCloudEvalOptions {
  /** Skips fetching at all while false — avoids one request per board when analysis is off. */
  enabled?: boolean;
  multiPv?: number;
}

export interface UseCloudEvalResult {
  /** True once a request for the current position has resolved (success, not-found, or error). */
  ready: boolean;
  analyzing: boolean;
  /** Sorted by multipv ascending; index 0 is the primary line. Empty when `notFound`. */
  lines: EngineLine[];
  bestMove: string | undefined;
  engineLabel: string;
  error: string | undefined;
  /** True when Lichess has no cached community analysis for this exact position — not an error. */
  notFound: boolean;
}

/** Positions repeat often when paging back and forth — cache avoids re-hitting Lichess (and its request budget). */
const cache = new Map<string, EngineLine[] | "not-found">();

function cacheKey(fen: string, multiPv: number): string {
  return `${fen}::${multiPv}`;
}

/**
 * Looks up Lichess's Cloud Evaluation for a position — a cache of
 * community-contributed engine analysis, not a live engine — as an
 * alternative to running Stockfish locally in a Web Worker. See
 * `lib/lichess/client.ts#getCloudEval` for the upstream contract details
 * (score-sign convention, coverage caveats). Requests go through
 * `/api/lichess/cloud-eval` (this app's own proxy), matching how every other
 * Lichess lookup in this app is routed.
 */
export function useCloudEval(
  fen: string | undefined,
  { enabled = true, multiPv = 1 }: UseCloudEvalOptions = {}
): UseCloudEvalResult {
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [depth, setDepth] = useState<number | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);

  const debouncedFen = useDebouncedValue(fen, FETCH_DEBOUNCE_MS);

  // Instant feedback as soon as the position changes: a cached position
  // resolves immediately (no request needed, so no reason to wait for the
  // debounce below); an uncached one shows loading right away even though
  // the actual request is debounced, so paging quickly never displays a
  // stale score left over from a previous position.
  useEffect(() => {
    if (!enabled || !fen) return;

    const key = cacheKey(fen, multiPv);
    const cached = cache.get(key);

    // A fresh position is being looked up — previous results no longer apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(undefined);
    setNotFound(false);

    if (cached) {
      setReady(true);
      setAnalyzing(false);
      setLines(cached === "not-found" ? [] : cached);
      setNotFound(cached === "not-found");
    } else {
      setReady(false);
      setAnalyzing(true);
      setLines([]);
    }
  }, [fen, enabled, multiPv]);

  // The actual network request — debounced so holding an arrow key or
  // clicking "next" repeatedly through a line doesn't fire one Lichess
  // lookup per intermediate position, only once things settle.
  useEffect(() => {
    if (!enabled || !debouncedFen) return;

    const key = cacheKey(debouncedFen, multiPv);
    const cached = cache.get(key);
    // Someone else (another board analyzing the same position) may have
    // populated the cache while this request sat waiting out the debounce —
    // apply it directly rather than firing a redundant request.
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      setAnalyzing(false);
      setLines(cached === "not-found" ? [] : cached);
      setNotFound(cached === "not-found");
      return;
    }

    const sideToMove: "w" | "b" = debouncedFen.split(" ")[1] === "b" ? "b" : "w";
    const controller = new AbortController();

    fetch(
      `/api/lichess/cloud-eval?fen=${encodeURIComponent(debouncedFen)}&multiPv=${multiPv}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        if (res.status === 404) {
          cache.set(key, "not-found");
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          throw new Error(`Lichess cloud eval request failed (${res.status}).`);
        }

        const data = (await res.json()) as CloudEvalResponse;
        // Lichess's cp/mate are always from White's perspective; this app's
        // EngineLine (and EngineEvalBar) expect side-to-move perspective,
        // matching local UCI engine output — flip the sign for Black to move.
        const sign = sideToMove === "w" ? 1 : -1;
        const converted: EngineLine[] = data.pvs.map((pv, index) => ({
          multipv: index + 1,
          depth: data.depth,
          scoreCp: pv.cp != null ? pv.cp * sign : undefined,
          scoreMate: pv.mate != null ? pv.mate * sign : undefined,
          pv: pv.moves.split(" "),
        }));

        cache.set(key, converted);
        setDepth(data.depth);
        setLines(converted);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Cloud evaluation request failed."
        );
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setReady(true);
        setAnalyzing(false);
      });

    return () => controller.abort();
  }, [debouncedFen, enabled, multiPv]);

  return {
    ready,
    analyzing,
    lines,
    bestMove: lines[0]?.pv[0],
    engineLabel: depth != null ? `Lichess cloud analysis (depth ${depth})` : "Lichess cloud analysis",
    error,
    notFound,
  };
}
