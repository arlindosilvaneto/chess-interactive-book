import { create } from "zustand";

import { getPathLevels } from "@/lib/chess/moveTree";
import type { Chapter, MoveNode } from "@/types/chapter";

/** Immutably attach `newNode` as a child of the node at `parentPath`. */
function cloneWithAttachedChild(
  root: MoveNode,
  parentPath: string[],
  newNode: MoveNode
): MoveNode {
  if (parentPath.length === 0) {
    return { ...root, children: [...root.children, newNode] };
  }
  const [head, ...rest] = parentPath;
  return {
    ...root,
    children: root.children.map((child) =>
      child.id === head
        ? cloneWithAttachedChild(child, rest, newNode)
        : child
    ),
  };
}

interface ChapterSlice {
  root: MoveNode;
  /**
   * One path per currently-open board, deepest last: `boardPaths[0]` is
   * always the mainline board (never closable, always present — starts as
   * `[]`). `boardPaths[1..]` are sideline boards, one per level of variation
   * nesting the reader has drilled into — there are as many as needed to
   * show the full chain of reasoning, not a fixed maximum of one.
   */
  boardPaths: string[][];
}

interface ChapterStoreState {
  chapters: Record<string, ChapterSlice>;
  /** Idempotent: seeds the tree + a single mainline board for a chapter. */
  initChapter: (chapter: Chapter) => void;
  /**
   * Jumps to reading `path` — typically from clicking a move-link in the
   * book text. Recomputes the *entire* board stack via `getPathLevels`, so
   * clicking a mainline move collapses back to just the mainline board,
   * and clicking a move nested three variations deep opens exactly the
   * three sideline boards needed to show that chain, no more or fewer.
   */
  selectPath: (chapterId: string, path: string[]) => void;
  /**
   * Moves *only* board `levelIndex` (its own Start/Prev/Next/End arrows) —
   * every other open board stays exactly where it was, since the reader is
   * deliberately paging through one specific board, not jumping to a new
   * reading position.
   */
  navigateBoardAt: (chapterId: string, levelIndex: number, path: string[]) => void;
  /**
   * Attaches `newNode` under `parentPath` (a legal move played on board
   * `levelIndex`, at its current position) and opens exactly one new board
   * right after it showing the new line — discarding any boards that were
   * stacked deeper than `levelIndex`, since those belonged to whatever was
   * there before this move branched off.
   */
  playMove: (
    chapterId: string,
    levelIndex: number,
    parentPath: string[],
    newNode: MoveNode
  ) => void;
  /**
   * Closes board `levelIndex`. Only allowed when it's the *last* (deepest)
   * board — a sideline nested inside another sideline must be closed
   * before the one it branched from, so the stack always closes from the
   * top down. No-ops otherwise (including for the mainline board, index 0,
   * which can never be closed).
   */
  closeBoardAt: (chapterId: string, levelIndex: number) => void;
}

export const useChapterStore = create<ChapterStoreState>((set) => ({
  chapters: {},

  initChapter: (chapter) => {
    set((state) => {
      if (state.chapters[chapter.id]) return state;
      return {
        chapters: {
          ...state.chapters,
          [chapter.id]: { root: chapter.root, boardPaths: [[]] },
        },
      };
    });
  },

  selectPath: (chapterId, path) => {
    set((state) => {
      const slice = state.chapters[chapterId];
      if (!slice) return state;
      return {
        chapters: {
          ...state.chapters,
          [chapterId]: { ...slice, boardPaths: getPathLevels(slice.root, path) },
        },
      };
    });
  },

  navigateBoardAt: (chapterId, levelIndex, path) => {
    set((state) => {
      const slice = state.chapters[chapterId];
      if (!slice || !slice.boardPaths[levelIndex]) return state;
      const boardPaths = [...slice.boardPaths];
      boardPaths[levelIndex] = path;
      return {
        chapters: { ...state.chapters, [chapterId]: { ...slice, boardPaths } },
      };
    });
  },

  playMove: (chapterId, levelIndex, parentPath, newNode) => {
    set((state) => {
      const slice = state.chapters[chapterId];
      if (!slice) return state;
      const nextRoot = cloneWithAttachedChild(slice.root, parentPath, newNode);
      const newPath = [...parentPath, newNode.id];
      const boardPaths = [...slice.boardPaths.slice(0, levelIndex + 1), newPath];
      return {
        chapters: {
          ...state.chapters,
          [chapterId]: { ...slice, root: nextRoot, boardPaths },
        },
      };
    });
  },

  closeBoardAt: (chapterId, levelIndex) => {
    set((state) => {
      const slice = state.chapters[chapterId];
      if (!slice) return state;
      const isLast = levelIndex === slice.boardPaths.length - 1;
      if (levelIndex === 0 || !isLast) return state;
      return {
        chapters: {
          ...state.chapters,
          [chapterId]: { ...slice, boardPaths: slice.boardPaths.slice(0, -1) },
        },
      };
    });
  },
}));
