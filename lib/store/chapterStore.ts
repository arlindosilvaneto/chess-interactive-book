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
  /**
   * Whether each open board (same indexing as `boardPaths`) has live engine
   * analysis on. Index 0 (mainline) starts `true`; every board opened after
   * it inherits the mainline's *current* flag at the moment it opens, so
   * evaluations keep flowing as the reader drills into sidelines instead of
   * silently going quiet on each new board.
   */
  analysisEnabled: boolean[];
}

interface ChapterStoreState {
  chapters: Record<string, ChapterSlice>;
  /**
   * Idempotent: seeds the tree + a single mainline board for a chapter, keyed
   * by `chapterKey` — NOT `chapter.id`. `Chapter.id` (from `parseChapter`) is
   * only unique *within one book* (chapters are numbered "1", "2", … per PGN
   * file, restarting for every book), so two different books' same-numbered
   * chapters would silently collide and share state if this were keyed by
   * `chapter.id` alone. Callers must pass a globally-unique key (e.g.
   * `${bookId}__${chapter.id}`, see `ChapterView.tsx`) — this is also exactly
   * what makes "leave a chapter, come back later" resume from where the
   * reader left off: the slice for that exact key is never touched again
   * once created, so a repeat `initChapter` call for the same key is a
   * true no-op, while a genuinely different chapter always starts fresh.
   */
  initChapter: (chapterKey: string, chapter: Chapter) => void;
  /**
   * Jumps to reading `path` — typically from clicking a move-link in the
   * book text. Recomputes the *entire* board stack via `getPathLevels`, so
   * clicking a mainline move collapses back to just the mainline board,
   * and clicking a move nested three variations deep opens exactly the
   * three sideline boards needed to show that chain, no more or fewer.
   */
  selectPath: (chapterKey: string, path: string[]) => void;
  /**
   * Moves *only* board `levelIndex` (its own Start/Prev/Next/End arrows) —
   * every other open board stays exactly where it was, since the reader is
   * deliberately paging through one specific board, not jumping to a new
   * reading position.
   */
  navigateBoardAt: (chapterKey: string, levelIndex: number, path: string[]) => void;
  /**
   * Attaches `newNode` under `parentPath` (a legal move played on board
   * `levelIndex`, at its current position) and opens exactly one new board
   * right after it showing the new line — discarding any boards that were
   * stacked deeper than `levelIndex`, since those belonged to whatever was
   * there before this move branched off.
   */
  playMove: (
    chapterKey: string,
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
  closeBoardAt: (chapterKey: string, levelIndex: number) => void;
  /** Toggles the "Analyze" switch for board `levelIndex` only — every other open board keeps its own setting. */
  setAnalysisEnabled: (chapterKey: string, levelIndex: number, enabled: boolean) => void;
}

export const useChapterStore = create<ChapterStoreState>((set) => ({
  chapters: {},

  initChapter: (chapterKey, chapter) => {
    set((state) => {
      if (state.chapters[chapterKey]) return state;
      return {
        chapters: {
          ...state.chapters,
          [chapterKey]: { root: chapter.root, boardPaths: [[]], analysisEnabled: [true] },
        },
      };
    });
  },

  selectPath: (chapterKey, path) => {
    set((state) => {
      const slice = state.chapters[chapterKey];
      if (!slice) return state;
      const boardPaths = getPathLevels(slice.root, path);
      // Preserve each still-existing board's own flag; any board that's new
      // in this recomputed stack inherits the mainline's current flag.
      const mainlineEnabled = slice.analysisEnabled[0] ?? true;
      const analysisEnabled = boardPaths.map(
        (_, index) => slice.analysisEnabled[index] ?? mainlineEnabled
      );
      return {
        chapters: {
          ...state.chapters,
          [chapterKey]: { ...slice, boardPaths, analysisEnabled },
        },
      };
    });
  },

  navigateBoardAt: (chapterKey, levelIndex, path) => {
    set((state) => {
      const slice = state.chapters[chapterKey];
      if (!slice || !slice.boardPaths[levelIndex]) return state;
      const boardPaths = [...slice.boardPaths];
      boardPaths[levelIndex] = path;
      return {
        chapters: { ...state.chapters, [chapterKey]: { ...slice, boardPaths } },
      };
    });
  },

  playMove: (chapterKey, levelIndex, parentPath, newNode) => {
    set((state) => {
      const slice = state.chapters[chapterKey];
      if (!slice) return state;
      const nextRoot = cloneWithAttachedChild(slice.root, parentPath, newNode);
      const newPath = [...parentPath, newNode.id];
      const boardPaths = [...slice.boardPaths.slice(0, levelIndex + 1), newPath];
      const mainlineEnabled = slice.analysisEnabled[0] ?? true;
      const analysisEnabled = [
        ...slice.analysisEnabled.slice(0, levelIndex + 1),
        mainlineEnabled,
      ];
      return {
        chapters: {
          ...state.chapters,
          [chapterKey]: { ...slice, root: nextRoot, boardPaths, analysisEnabled },
        },
      };
    });
  },

  closeBoardAt: (chapterKey, levelIndex) => {
    set((state) => {
      const slice = state.chapters[chapterKey];
      if (!slice) return state;
      const isLast = levelIndex === slice.boardPaths.length - 1;
      if (levelIndex === 0 || !isLast) return state;
      return {
        chapters: {
          ...state.chapters,
          [chapterKey]: {
            ...slice,
            boardPaths: slice.boardPaths.slice(0, -1),
            analysisEnabled: slice.analysisEnabled.slice(0, -1),
          },
        },
      };
    });
  },

  setAnalysisEnabled: (chapterKey, levelIndex, enabled) => {
    set((state) => {
      const slice = state.chapters[chapterKey];
      if (!slice || slice.analysisEnabled[levelIndex] === undefined) return state;
      const analysisEnabled = [...slice.analysisEnabled];
      analysisEnabled[levelIndex] = enabled;
      return {
        chapters: { ...state.chapters, [chapterKey]: { ...slice, analysisEnabled } },
      };
    });
  },
}));
