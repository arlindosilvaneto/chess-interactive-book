import { getNodeByPath } from "@/lib/chess/moveTree";
import type { MoveNode } from "@/types/chapter";

export interface MoveToken {
  path: string[];
  san: string;
  moveNumber: number;
  color: "w" | "b";
}

/** Reads the starting side-to-move + move number off a FEN (handles mid-game chapters). */
export function startingMoveInfo(fen: string): { moveNumber: number; color: "w" | "b" } {
  const parts = fen.split(" ");
  return {
    color: parts[1] === "b" ? "b" : "w",
    moveNumber: Number(parts[5]) || 1,
  };
}

/** Shared by GameText (book rendering) and CommentaryPanel (PGN-ish context text). */
export function getMoveTokens(root: MoveNode, path: string[]): MoveToken[] {
  let { color, moveNumber } = startingMoveInfo(root.fenAfter);
  const tokens: MoveToken[] = [];
  let prefix: string[] = [];

  for (const id of path) {
    const nextPrefix = [...prefix, id];
    const node = getNodeByPath(root, nextPrefix);
    if (!node || node.san == null) break;

    tokens.push({ path: nextPrefix, san: node.san, moveNumber, color });
    prefix = nextPrefix;

    if (color === "w") {
      color = "b";
    } else {
      color = "w";
      moveNumber += 1;
    }
  }

  return tokens;
}
