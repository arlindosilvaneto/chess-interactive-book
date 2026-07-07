import { NextRequest, NextResponse } from "next/server";
import {
  LICHESS_EXPLORER_BASE_URL,
  LICHESS_MAIN_BASE_URL,
  LICHESS_TABLEBASE_BASE_URL,
  lichessAuthHeaders,
} from "@/lib/lichess/client";

export const runtime = "nodejs";

/**
 * Generic GET proxy for Lichess's public APIs. Browser code should call this
 * (e.g. `/api/lichess/lichess?fen=...`) instead of hitting lichess.org/lichess.ovh
 * directly, since Lichess does not reliably send CORS headers for browser
 * fetches.
 *
 * The first path segment selects the upstream endpoint; the rest of the path
 * is ignored, and the query string is forwarded as-is:
 *   - /api/lichess/lichess     -> https://explorer.lichess.org/lichess    (working)
 *   - /api/lichess/masters     -> https://explorer.lichess.org/masters   (working)
 *   - /api/lichess/player      -> https://explorer.lichess.org/player    (working, TODO: not yet consumed)
 *   - /api/lichess/tablebase   -> https://tablebase.lichess.org/standard (working, TODO: not yet consumed)
 *   - /api/lichess/cloud-eval  -> https://lichess.org/api/cloud-eval     (working)
 *
 * The `lichess`/`masters`/`player` (Opening Explorer) upstream endpoints
 * require a Lichess API token — see lib/lichess/client.ts for details. The
 * `tablebase` and `cloud-eval` upstreams do not (verified live, 2026-07).
 */
const UPSTREAM_ROUTES: Record<string, { url: string; requiresAuth: boolean }> = {
  lichess: { url: `${LICHESS_EXPLORER_BASE_URL}/lichess`, requiresAuth: true },
  masters: { url: `${LICHESS_EXPLORER_BASE_URL}/masters`, requiresAuth: true },
  player: { url: `${LICHESS_EXPLORER_BASE_URL}/player`, requiresAuth: true },
  tablebase: { url: `${LICHESS_TABLEBASE_BASE_URL}/standard`, requiresAuth: false },
  "cloud-eval": { url: `${LICHESS_MAIN_BASE_URL}/api/cloud-eval`, requiresAuth: false },
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const segment = path?.[0];
  const route = segment ? UPSTREAM_ROUTES[segment] : undefined;

  if (!route) {
    return NextResponse.json(
      { error: `Unknown Lichess proxy route "/${(path ?? []).join("/")}"` },
      { status: 404 },
    );
  }

  const upstreamRes = await fetch(`${route.url}${request.nextUrl.search}`, {
    headers: route.requiresAuth ? lichessAuthHeaders() : undefined,
  });

  const body = await upstreamRes.text();

  return new NextResponse(body, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": upstreamRes.headers.get("content-type") ?? "application/json",
    },
  });
}
