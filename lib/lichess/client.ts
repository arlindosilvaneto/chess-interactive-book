import type { CloudEvalResponse, OpeningExplorerResponse, TablebaseResponse } from "@/types/lichess";

/**
 * Base URLs for Lichess's public APIs. Exported so the proxy route
 * (app/api/lichess/[...path]/route.ts) can reuse the same upstream mapping
 * instead of re-declaring it.
 */
export const LICHESS_EXPLORER_BASE_URL = "https://explorer.lichess.org";
export const LICHESS_TABLEBASE_BASE_URL = "https://tablebase.lichess.org";
export const LICHESS_MAIN_BASE_URL = "https://lichess.org";

/**
 * IMPORTANT: confirmed against Lichess's own OpenAPI spec
 * (github.com/lichess-org/api, doc/specs/tags/openingexplorer/*.yaml) — the
 * Opening Explorer (`/lichess`, `/masters`, `/player` on
 * explorer.lichess.org) is declared `security: [OAuth2: []]` (any valid
 * token, no specific scope required) and returns a live `401 Unauthorized`
 * without one — confirmed live too. This is a change from the
 * historically-public/unauthenticated explorer API. The Cloud Evaluation
 * endpoint this app also uses is explicitly `security: []` (public) and is
 * unaffected. The Tablebase API is likewise unauthenticated.
 *
 * `token` is normally the user's own BYOK Lichess token (`LlmSettings.lichessApiToken`,
 * same handling as the LLM `apiKey` — see `lib/ai/tools/lichess-tools.ts`, the only
 * caller that actually needs auth today). Falls back to `LICHESS_API_TOKEN` from the
 * server environment when no explicit token is passed, for the proxy route's
 * env-configured case.
 */
export function lichessAuthHeaders(token?: string): HeadersInit {
  const resolvedToken = token || process.env.LICHESS_API_TOKEN;
  return resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {};
}

export type ExplorerVariant =
  | "standard"
  | "chess960"
  | "antichess"
  | "atomic"
  | "crazyhouse"
  | "horde"
  | "kingOfTheHill"
  | "racingKings"
  | "threeCheck";

export type ExplorerSpeed =
  | "ultraBullet"
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "correspondence";

export interface OpeningExplorerLichessParams {
  /** FEN (or EPD) of the root position to look up. */
  fen: string;
  /** Comma-separated additional moves in UCI notation, played from `fen`. */
  play?: string;
  variant?: ExplorerVariant;
  speeds?: ExplorerSpeed[];
  /** Rating group floors, e.g. [1600, 1800] — see Lichess docs for the fixed bucket list. */
  ratings?: number[];
  /** Include only games from this month or later, format `YYYY-MM`. */
  since?: string;
  /** Include only games from this month or earlier, format `YYYY-MM`. */
  until?: string;
  /** Number of most common moves to return (default 12 upstream). */
  moves?: number;
  /** Max number of top games to return (upstream max 4). */
  topGames?: number;
  /** Max number of recent games to return (upstream max 4-8). */
  recentGames?: number;
}

/** Raw shape returned by GET https://explorer.lichess.org/lichess. */
interface RawOpeningExplorerMove {
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number | null;
}

interface RawOpeningExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: RawOpeningExplorerMove[];
  opening?: { eco: string; name: string } | null;
}

function buildExplorerSearchParams(params: OpeningExplorerLichessParams): URLSearchParams {
  const searchParams = new URLSearchParams({ fen: params.fen });
  if (params.play) searchParams.set("play", params.play);
  if (params.variant) searchParams.set("variant", params.variant);
  if (params.speeds?.length) searchParams.set("speeds", params.speeds.join(","));
  if (params.ratings?.length) searchParams.set("ratings", params.ratings.join(","));
  if (params.since) searchParams.set("since", params.since);
  if (params.until) searchParams.set("until", params.until);
  if (params.moves != null) searchParams.set("moves", String(params.moves));
  if (params.topGames != null) searchParams.set("topGames", String(params.topGames));
  if (params.recentGames != null) searchParams.set("recentGames", String(params.recentGames));
  return searchParams;
}

/**
 * Queries the Lichess Opening Explorer for aggregated Lichess-games
 * statistics (move popularity, win/draw/loss rates, opening name) at a given
 * position. Requires a Lichess personal API token (see notes above) or
 * upstream will respond 401 — callers should pass the user's own
 * `LlmSettings.lichessApiToken` via `init.token`.
 */
export async function getOpeningExplorerLichess(
  params: OpeningExplorerLichessParams,
  init?: { signal?: AbortSignal; token?: string },
): Promise<OpeningExplorerResponse> {
  const searchParams = buildExplorerSearchParams(params);

  const res = await fetch(`${LICHESS_EXPLORER_BASE_URL}/lichess?${searchParams.toString()}`, {
    headers: lichessAuthHeaders(init?.token),
    signal: init?.signal,
  });

  if (!res.ok) {
    throw new Error(
      `Lichess opening explorer request failed: ${res.status} ${res.statusText}` +
        (res.status === 401 ? " (invalid or expired Lichess API token?)" : ""),
    );
  }

  const data = (await res.json()) as RawOpeningExplorerResponse;

  return {
    white: data.white,
    draws: data.draws,
    black: data.black,
    moves: data.moves.map((move) => ({
      san: move.san,
      white: move.white,
      draws: move.draws,
      black: move.black,
      ...(move.averageRating != null ? { averageRating: move.averageRating } : {}),
    })),
    opening: data.opening ?? null,
  };
}

/**
 * Result of hitting `GET /api/cloud-eval` for a position with no cached
 * community analysis. Distinguished from a network/server error so callers
 * can show "no cloud evaluation for this position" instead of a scary error.
 */
export class CloudEvalNotFoundError extends Error {
  constructor(fen: string) {
    super(`No cloud evaluation available for position "${fen}"`);
    this.name = "CloudEvalNotFoundError";
  }
}

/**
 * Queries Lichess's Cloud Evaluation API — a lookup against Lichess's own
 * community-contributed cache of engine analysis, not a live engine. Verified
 * live (2026-07): no authentication required, response is
 * `{ fen, knodes, depth, pvs: [{ moves: "e2e4 e7e5 ...", cp?, mate? }] }` with
 * `moves` already in UCI long-algebraic form (matching this app's local
 * Stockfish `EngineLine.pv` shape) — but `cp`/`mate` are from **White's**
 * perspective, unlike UCI engine output's side-to-move perspective, so
 * callers must flip the sign themselves when the position has Black to move.
 * Returns 404 (thrown here as `CloudEvalNotFoundError`) for positions Lichess
 * hasn't cached — coverage is best for well-known openings and positions
 * other users have already analyzed, and can be sparse for a specific book's
 * deep/obscure lines.
 */
export async function getCloudEval(
  fen: string,
  multiPv: number,
  init?: { signal?: AbortSignal },
): Promise<CloudEvalResponse> {
  const searchParams = new URLSearchParams({ fen, multiPv: String(multiPv) });
  const res = await fetch(`${LICHESS_MAIN_BASE_URL}/api/cloud-eval?${searchParams.toString()}`, {
    signal: init?.signal,
  });

  if (res.status === 404) {
    throw new CloudEvalNotFoundError(fen);
  }
  if (!res.ok) {
    throw new Error(`Lichess cloud-eval request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as CloudEvalResponse;
}

/**
 * TODO (deferred, see architecture brief): Lichess Tablebase lookup.
 * Endpoint: `GET https://tablebase.lichess.org/standard?fen=<X-FEN>` — no
 * authentication required (verified live). Response shape documented in
 * `types/lichess.ts` (`TablebaseResponse`); upstream schema has a wider
 * `category` union (adds `syzygy-win` / `maybe-win` / `syzygy-loss` /
 * `maybe-loss`) that will need mapping down to our narrower contract.
 */
export async function getTablebase(fen: string): Promise<TablebaseResponse> {
  throw new Error(
    `getTablebase is not implemented yet (deferred) for FEN "${fen}" — see TODO comment above.`,
  );
}

/**
 * TODO (deferred, see architecture brief): Lichess per-player opening
 * explorer lookup. Endpoint: `GET https://explorer.lichess.org/player`
 * (params: `player`, `color`, `fen`, `play`, `variant`, `modes`, `speeds`,
 * `since`, `until`) — requires the same OAuth2 token as `getOpeningExplorerLichess`.
 */
export async function getOpeningExplorerPlayer(): Promise<never> {
  throw new Error(
    "getOpeningExplorerPlayer is not implemented yet (deferred) — see TODO comment above.",
  );
}
