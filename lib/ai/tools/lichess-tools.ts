import { tool } from "ai";
import { z } from "zod";
import { getOpeningExplorerLichess } from "@/lib/lichess/client";

/**
 * AI SDK tool giving the chat model access to Lichess Opening Explorer stats
 * (move popularity, win/draw/loss rates, opening name) for a position, so
 * commentary about opening theory/typical play is grounded in real data
 * instead of the model's memory.
 */
export const lichessOpeningExplorerTool = tool({
  description:
    "Look up aggregated Lichess opening-explorer statistics (how often each legal move is played by " +
    "other players, their win/draw/loss rates, and the current opening's ECO code/name) for a given " +
    "chess position. Use this instead of guessing when discussing opening theory, move popularity, or " +
    "how a position is typically handled.",
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
  execute: async ({ fen, play }) => getOpeningExplorerLichess({ fen, play }),
});

/** Tool set to register with `streamText`/`generateText` for the chat route. */
export const lichessTools = {
  lichessOpeningExplorer: lichessOpeningExplorerTool,
};
