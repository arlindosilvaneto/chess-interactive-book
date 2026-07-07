import { Chess } from "chess.js";
import { nanoid } from "nanoid";
import type { MoveNode } from "@/types/chapter";
import { START_FEN, assertValidFen } from "./fen";

/**
 * Creates a fresh root MoveNode at the given FEN (defaults to the standard
 * starting position). The root has `san: null` and represents "no move played
 * yet" — every chapter's move tree and every user-created variation subtree
 * starts from a root like this.
 */
export function createRoot(fen: string = START_FEN): MoveNode {
  assertValidFen(fen);
  return {
    id: nanoid(),
    ply: 0,
    san: null,
    fenBefore: fen,
    fenAfter: fen,
    origin: "pgn",
    children: [],
  };
}

/**
 * Validates and applies a move against `node`'s resulting position
 * (`node.fenAfter`), returning a brand-new child MoveNode (origin: "user").
 *
 * Does NOT mutate `node` or attach the returned node to `node.children` —
 * the caller decides where the new node belongs (e.g. push onto
 * `node.children` to extend the mainline/spawn a new sideline).
 *
 * Throws if `moveInput` is illegal in the position at `node.fenAfter`.
 */
export function applyMove(
  node: MoveNode,
  moveInput: string | { from: string; to: string; promotion?: string },
): MoveNode {
  const chess = new Chess(node.fenAfter);

  let move;
  try {
    move = chess.move(moveInput);
  } catch {
    const description =
      typeof moveInput === "string"
        ? moveInput
        : `${moveInput.from}-${moveInput.to}${moveInput.promotion ? `=${moveInput.promotion}` : ""}`;
    throw new Error(`Illegal move "${description}" from position ${node.fenAfter}`);
  }

  return {
    id: nanoid(),
    ply: node.ply + 1,
    san: move.san,
    fenBefore: node.fenAfter,
    fenAfter: chess.fen(),
    origin: "user",
    children: [],
  };
}

/**
 * Walks `path` — a sequence of child node ids, each identifying which child
 * to descend into at that level (NOT indices, since sideline ordering can
 * change) — starting from `root`'s children. Returns the node reached, or
 * null if any id in the path doesn't match a child at that level.
 *
 * An empty path returns `root` itself.
 */
export function getNodeByPath(root: MoveNode, path: string[]): MoveNode | null {
  let current = root;
  for (const id of path) {
    const next = current.children.find((child) => child.id === id);
    if (!next) return null;
    current = next;
  }
  return current;
}

/**
 * Decomposes `path` into one sub-path per "nesting level": level 0 is the
 * mainline-only prefix (every step selects `children[0]`); level 1 starts at
 * the first step that instead selects a variation (`children[1..]`) and
 * continues mainline-wise *within that variation* until either `path` ends
 * or crosses into a further-nested variation, which starts level 2, and so
 * on. Each returned sub-path is absolute (from `root`), so `getNodeByPath`
 * can be called on it directly.
 *
 * This is what lets the boards panel show exactly as many boards as the
 * reader has actually drilled into: `levels.length` is the required board
 * count, and `levels[i]` is board `i`'s position.
 *
 * A stale id (one that doesn't match any child at that point) stops the
 * walk early rather than throwing — whatever was decomposed so far is
 * still returned.
 */
export function getPathLevels(root: MoveNode, path: string[]): string[][] {
  const levels: string[][] = [[]];
  let node = root;
  let prefix: string[] = [];

  for (const id of path) {
    const index = node.children.findIndex((child) => child.id === id);
    if (index === -1) break;

    prefix = [...prefix, id];
    if (index !== 0) {
      levels.push(prefix);
    } else {
      levels[levels.length - 1] = prefix;
    }
    node = node.children[index];
  }

  return levels;
}

/**
 * Recovers the board squares a move's SAN affects, given the position it was
 * played from — MoveNode doesn't store `from`/`to` directly (only SAN plus
 * the resulting FENs), so this replays the move through chess.js once to
 * recover them, for "last move" square highlighting. Returns null for the
 * root node (no move played yet) or if replay somehow fails.
 */
export function lastMoveSquares(node: MoveNode): { from: string; to: string } | null {
  if (!node.san) return null;
  try {
    const chess = new Chess(node.fenBefore);
    const move = chess.move(node.san);
    return { from: move.from, to: move.to };
  } catch {
    return null;
  }
}

/** One step back toward root (drops the last id), or `path` unchanged if already at root. */
export function stepBack(path: string[]): string[] {
  return path.slice(0, -1);
}

/** One step along the current line's own continuation (`children[0]`), or `path` unchanged at a leaf. */
export function stepForward(root: MoveNode, path: string[]): string[] {
  const node = getNodeByPath(root, path);
  const next = node?.children[0];
  return next ? [...path, next.id] : path;
}

/** Follows `children[0]` all the way to the end of the current line. */
export function stepToEnd(root: MoveNode, path: string[]): string[] {
  let current = path;
  for (let next = stepForward(root, current); next !== current; next = stepForward(root, current)) {
    current = next;
  }
  return current;
}
