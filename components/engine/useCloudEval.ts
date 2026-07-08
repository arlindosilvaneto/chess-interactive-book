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
  /**
   * The FEN that `lines`/`bestMove` actually reflect — this trails the
   * caller's `fen` argument while a request is in flight and stale results
   * are being held over (see the instant-feedback effect below). Score sign
   * is side-to-move-relative, so a caller must derive "which side" from
   * *this* FEN, not from whatever position is now current, or a held-over
   * score gets reinterpreted with the wrong side and its sign flips.
   */
  resultFen: string | undefined;
}

/** Positions repeat often when paging back and forth — cache avoids re-hitting Lichess (and its request budget). */
const cache = new Map<string, EngineLine[] | "not-found">();

function cacheKey(fen: string, multiPv: number): string {
  return `${fen}::${multiPv}`;
}

/**
 * Module-scope (not per-hook-instance) because Lichess's rate limit is a
 * shared budget across every board on the page, not a per-board one — once
 * one board gets 429'd, every other board's cloud lookup would fail too, so
 * there's no point letting each of them independently rediscover that. Set
 * on a real 429 response below; checked before firing (or even queueing) a
 * request so the whole page skips straight to the fallback chain instead of
 * spending a debounce window + a round trip on a request that would almost
 * certainly 429 again.
 */
let rateLimitedUntil = 0;
const RATE_LIMIT_COOLDOWN_MS = 3 * 60 * 1000;

function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
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
  const [resultFen, setResultFen] = useState<string | undefined>(undefined);

  const debouncedFen = useDebouncedValue(fen, FETCH_DEBOUNCE_MS);

  // Instant feedback as soon as the position changes: a cached position
  // resolves immediately (no request needed, so no reason to wait for the
  // debounce below). An uncached one deliberately does NOT clear `lines` —
  // it flips `ready`/`analyzing` so callers can show a busy indicator, but
  // leaves the previous position's score in place until the real request
  // (below) actually resolves. Clearing eagerly used to make the eval bar
  // flick to neutral and back on every move; holding the stale value is a
  // better trade than that flicker, since it's only ever visible for the
  // ~1s debounce window (or a failed/slow request) before being replaced.
  useEffect(() => {
    if (!enabled || !fen) return;

    const key = cacheKey(fen, multiPv);
    const cached = cache.get(key);

    // A fresh position is being looked up — previous error/not-found status
    // no longer applies (but `lines` does, see above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotFound(false);

    if (cached) {
      setError(undefined);
      setReady(true);
      setAnalyzing(false);
      setLines(cached === "not-found" ? [] : cached);
      setNotFound(cached === "not-found");
      setResultFen(fen);
    } else if (isRateLimited()) {
      // Still cooling down from a recent 429 — report failure immediately
      // (see `rateLimitedUntil`'s doc comment) rather than waiting out the
      // debounce and a request that would almost certainly fail again.
      // BoardCard reads this as `cloudFailed` and engages the fallback
      // chain right away.
      setError("Lichess cloud evaluation is rate-limited — using fallback engine for a few minutes.");
      setReady(true);
      setAnalyzing(false);
    } else {
      setError(undefined);
      setReady(false);
      setAnalyzing(true);
    }
  }, [fen, enabled, multiPv]);

  // The actual network request — debounced so holding an arrow key or
  // clicking "next" repeatedly through a line doesn't fire one Lichess
  // lookup per intermediate position, only once things settle.
  useEffect(() => {
    if (!enabled || !debouncedFen) return;
    // Already reported as failed by the instant-feedback effect above —
    // don't spend a request confirming what's already known.
    if (isRateLimited()) return;

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
      setResultFen(debouncedFen);
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
          // "No cloud data for this position" is a conclusive result for
          // debouncedFen, not "still working" — unlike the other branches
          // here, any held-over stale `lines` must be cleared now, or a
          // score computed for a *different* position would keep showing
          // paired with this (now up-to-date) resultFen/side-to-move.
          setLines([]);
          setResultFen(debouncedFen);
          return;
        }
        if (res.status === 429) {
          rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          throw new Error(
            "Lichess cloud evaluation is rate-limited — using fallback engine for a few minutes."
          );
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
        setResultFen(debouncedFen);
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
    resultFen,
  };
}
