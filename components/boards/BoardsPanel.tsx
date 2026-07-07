"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";

import { stepBack, stepForward } from "@/lib/chess/moveTree";
import { useChapterStore } from "@/lib/store/chapterStore";
import type { Chapter } from "@/types/chapter";

import { BoardCard } from "./BoardCard";

export interface BoardsPanelProps {
  chapter: Chapter;
  /** Globally-unique store key for this chapter (`${bookId}__${chapter.id}`) — see `useChapterStore`'s `initChapter` doc comment. */
  chapterKey: string;
}

/** True while focus is in a text field — arrow keys should type there, not navigate boards. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/**
 * Renders one board per open level in `boardPaths`: always the mainline
 * board, plus one sideline board per level of variation nesting the reader
 * has drilled into — as many as necessary to show the full chain, not a
 * fixed maximum of one. New boards animate in when a deeper sideline opens
 * and out when closed (only ever the last/deepest one, enforced in
 * BoardCard via `isLast`).
 */
export function BoardsPanel({ chapter, chapterKey }: BoardsPanelProps) {
  const initChapter = useChapterStore((state) => state.initChapter);
  const closeBoardAt = useChapterStore((state) => state.closeBoardAt);
  const slice = useChapterStore((state) => state.chapters[chapterKey]);

  const boardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previousCountRef = useRef(0);

  useEffect(() => {
    initChapter(chapterKey, chapter);
  }, [chapter, chapterKey, initChapter]);

  // ArrowRight/ArrowLeft always step the deepest (last) open board — the
  // same one its own Next/Previous button would move.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (isTypingTarget(event.target)) return;

      const current = useChapterStore.getState().chapters[chapterKey];
      if (!current) return;

      const lastIndex = current.boardPaths.length - 1;
      const activePath = current.boardPaths[lastIndex];

      event.preventDefault();
      useChapterStore
        .getState()
        .navigateBoardAt(
          chapterKey,
          lastIndex,
          event.key === "ArrowRight"
            ? stepForward(current.root, activePath)
            : stepBack(activePath)
        );
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chapterKey]);

  // "Roll to" the deepest board whenever the stack's length changes: scrolls
  // to the newly-opened board when a sideline is selected, and back to the
  // (now-last) previous board when one is closed.
  const boardCount = slice?.boardPaths.length ?? 0;
  useEffect(() => {
    if (boardCount > 0 && boardCount !== previousCountRef.current) {
      boardRefs.current[boardCount - 1]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
    previousCountRef.current = boardCount;
  }, [boardCount]);

  if (!slice) {
    return <p className="text-sm text-muted-foreground">Loading boards…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence initial={false}>
        {slice.boardPaths.map((path, index) => (
          <BoardCard
            key={index}
            chapterId={chapterKey}
            root={slice.root}
            path={path}
            levelIndex={index}
            introComment={chapter.introComment}
            isLast={index === slice.boardPaths.length - 1}
            onClose={index > 0 ? () => closeBoardAt(chapterKey, index) : undefined}
            containerRef={(element) => {
              boardRefs.current[index] = element;
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
