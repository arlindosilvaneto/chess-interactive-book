import { tool } from "ai";
import { z } from "zod";
import { getOpeningExplorerLichess } from "@/lib/lichess/client";

const NOT_CONFIGURED_REASON =
  "No Lichess API token is configured. Add one in LLM commentary settings — " +
  "Settings → LLM commentary → \"Lichess API token\" — to enable opening-explorer lookups.";

/**
 * Builds the `lichessOpeningExplorer` tool bound to one request's user-supplied
 * token (BYOK, same handling as the LLM `apiKey` — see `LlmSettings.lichessApiToken`).
 * A factory rather than a static export because the token is only known per-request
 * (from the validated chat request body), not at module load time.
 */
export function createLichessTools(lichessApiToken: string | undefined) {
  const lichessOpeningExplorerTool = tool({
    description:
      "Look up aggregated Lichess opening-explorer statistics (how often each legal move is played by " +
      "other players, their win/draw/loss rates, and the current opening's ECO code/name) for a given " +
      "chess position. Use this instead of guessing when discussing opening theory, move popularity, or " +
      "how a position is typically handled. This can fail (e.g. no Lichess API token configured) — if " +
      "it returns `available: false`, say so briefly (and mention the user can add a token in Settings " +
      "if they want this) and fall back to your own knowledge instead of treating it as a fatal error.",
    inputSchema: z.object({
      fen: z.string().describe("FEN of the position to look up."),
      play: z
        .string()
        .optional()
        .describe(
          "Optional comma-separated additional moves in UCI notation (e.g. 'e2e4,e7e5') to play from " +
            "`fen` before looking up stats.",
        ),
    }),
    // Deliberately never throws: an AI SDK tool that throws surfaces as a
    // generic, unhelpful "An error occurred" error card in the chat UI.
    // Returning a normal `available: false` result instead lets the model
    // see *why* and respond naturally, and renders as a plain result in the
    // UI rather than an error. The missing-token case is checked up front
    // (no network round-trip) since it's a certain failure, not something
    // worth attempting first — Lichess's opening-explorer endpoints require
    // `security: [OAuth2: []]` per their own OpenAPI spec (any valid token,
    // no specific scope), confirmed live via a 401 with no token.
    execute: async ({ fen, play }) => {
      if (!lichessApiToken?.trim()) {
        return { available: false as const, reason: NOT_CONFIGURED_REASON };
      }
      try {
        const result = await getOpeningExplorerLichess(
          { fen, play },
          { token: lichessApiToken },
        );
        return { available: true as const, ...result };
      } catch (cause) {
        return {
          available: false as const,
          reason: cause instanceof Error ? cause.message : "Opening explorer lookup failed.",
        };
      }
    },
  });

  return { lichessOpeningExplorer: lichessOpeningExplorerTool };
}
