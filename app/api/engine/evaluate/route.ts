import { z } from "zod";

import { isValidFen } from "@/lib/chess/fen";
import { evaluatePosition } from "@/lib/engine/nodeStockfishEngine";

export const runtime = "nodejs";
// A single-threaded search at high depth on a shared serverless CPU can
// take a while — give it real headroom rather than the platform default.
// (On plans where the max configurable duration is lower than this, the
// platform's own cap wins regardless of what's set here.)
export const maxDuration = 60;

const evaluateRequestSchema = z.object({
  fen: z.string().min(1).refine(isValidFen, "Invalid FEN."),
  // Mirrors the sliders in EngineSettingsPanel — kept in sync deliberately,
  // not because this route requires it, so a depth/multiPv the UI lets you
  // pick never turns into a surprise 400 here.
  depth: z.number().int().min(6).max(30),
  multiPv: z.number().int().min(1).max(5),
});

/**
 * POST /api/engine/evaluate
 *
 * Runs a bounded (`go depth N`, not `go infinite`) Stockfish search
 * server-side and returns the finished result in one shot — deliberately
 * not a stream. Vercel Functions are request/response; there's no
 * `postMessage`-equivalent for a Node function to push incremental `info`
 * lines to the client mid-request the way the browser Worker does. A
 * depth-bounded search has a natural end (`bestmove`), which fits the
 * request/response model directly instead of needing SSE for what's a
 * one-shot per-position lookup anyway (same shape as the cloud-eval route).
 *
 * Request body: `{ fen: string; depth: number; multiPv: number }`.
 * Response: `{ lines: EngineLine[]; bestMove?: string }` (same `EngineLine`
 * shape `useStockfish`/`useCloudEval` already return, so the client hook
 * can slot in as a third interchangeable source).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = evaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await evaluatePosition(parsed.data.fen, {
      depth: parsed.data.depth,
      multiPv: parsed.data.multiPv,
    });
    return Response.json(result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Engine evaluation failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
