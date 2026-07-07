import { Chess } from "chess.js";
import { nanoid } from "nanoid";
import { parseGame, type ParseTree } from "@mliebelt/pgn-parser";
import type { Chapter, MoveNode, PgnTags } from "@/types/chapter";
import { START_FEN, assertValidFen } from "../chess/fen";
import { createRoot } from "../chess/moveTree";

/**
 * A single move as produced by `@mliebelt/pgn-parser`'s `parseGame`/`parseGames`.
 * Pulled via indexed access on `ParseTree` rather than importing `PgnMove`
 * directly from `@mliebelt/pgn-types` (a transitive, undeclared dependency).
 */
type ParsedMove = ParseTree["moves"][number];

/**
 * Recursively replays a flat sequence of parsed PGN moves (a mainline or a
 * variation line) on top of `parent`, mutating `parent`'s descendant tree.
 *
 * PGN variations attach as *alternatives* to a move, i.e. they branch off of
 * the position the move started from (`parent`), not from the move itself.
 * Pushing the mainline continuation first and variations after preserves the
 * `children[0] === mainline` contract on `MoveNode`.
 */
function replayLine(moves: ParsedMove[], parent: MoveNode): void {
  let current = parent;

  for (const pgnMove of moves) {
    const chess = new Chess(current.fenAfter);
    const notation = pgnMove.notation.notation;

    let result;
    try {
      result = chess.move(notation);
    } catch (cause) {
      throw new Error(
        `Illegal move "${notation}" at ply ${current.ply + 1} from FEN "${current.fenAfter}": ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }

    const comment = combineComments(pgnMove);
    const nags = parseNags(pgnMove.nag);

    const node: MoveNode = {
      id: nanoid(),
      ply: current.ply + 1,
      san: result.san,
      fenBefore: current.fenAfter,
      fenAfter: chess.fen(),
      origin: "pgn",
      children: [],
      ...(comment ? { comment } : {}),
      ...(nags.length ? { nags } : {}),
    };

    // Mainline continuation is pushed first so it lands at children[0].
    current.children.push(node);

    for (const variation of pgnMove.variations ?? []) {
      replayLine(variation, current);
    }

    current = node;
  }
}

/** Comment text attached to a move: `commentMove` (before) + `commentAfter` (after), if present. */
function combineComments(pgnMove: ParsedMove): string | undefined {
  const parts = [pgnMove.commentMove, pgnMove.commentAfter]
    .filter((comment): comment is string => typeof comment === "string" && comment.trim().length > 0)
    .map((comment) => comment.trim());
  return parts.length ? parts.join(" ") : undefined;
}

/** Converts pgn-parser's NAG strings (e.g. "$3") to numbers (e.g. 3). */
function parseNags(nag: string[] | null | undefined): number[] {
  if (!nag) return [];
  return nag
    .map((n) => Number.parseInt(n.replace("$", ""), 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Flattens pgn-parser's `Tags` (which nests Date/Time/TimeControl tags as
 * structured objects, and includes a non-tag `messages` field) down to the
 * plain string-keyed `PgnTags` shape our app uses.
 */
function normalizeTags(tags: ParseTree["tags"]): PgnTags {
  const result: PgnTags = {};
  if (!tags) return result;

  for (const [key, value] of Object.entries(tags)) {
    if (key === "messages" || value == null) continue;
    if (typeof value === "string") {
      result[key] = value;
    } else if (typeof value === "object" && "value" in value) {
      result[key] = String((value as { value?: unknown }).value ?? "");
    } else {
      result[key] = String(value);
    }
  }

  return result;
}

/**
 * Parses a single PGN game's text into a `Chapter`. Honors `[SetUp "1"]` /
 * `[FEN "..."]` tags as the starting position instead of the default start
 * FEN. `introComment` is the comment attached to the very first move of the
 * mainline (ply 1).
 *
 * `id` and `rawPgn` are supplied by the caller (typically `loadBooks`, which
 * knows the source filename and — for multi-game files — the raw text of
 * this specific game as split out from the rest of the file).
 */
export function parseChapter(pgnText: string, id: string, rawPgn: string = pgnText): Chapter {
  const game = parseGame(pgnText);
  const tags = normalizeTags(game.tags);

  const rootFen = tags.SetUp === "1" && tags.FEN ? tags.FEN : START_FEN;
  assertValidFen(rootFen);

  const root = createRoot(rootFen);
  replayLine(game.moves, root);

  const introComment = root.children[0]?.comment ?? "";
  const title =
    tags.Event && tags.Event !== "?" ? tags.Event : `${tags.White ?? "?"} vs ${tags.Black ?? "?"}`;

  return { id, title, tags, introComment, root, rawPgn };
}
