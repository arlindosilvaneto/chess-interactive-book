"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { startingMoveInfo } from "@/components/boards/MoveList";
import { cn } from "@/lib/utils";
import { useChapterStore } from "@/lib/store/chapterStore";
import { MAINLINE_ACCENT, variationAccent } from "@/lib/ui/variationAccent";
import type { Chapter, MoveNode } from "@/types/chapter";

import { ChapterIntro } from "./ChapterIntro";

export interface GameTextProps {
  chapter: Chapter;
  /** Globally-unique store key for this chapter (`${bookId}__${chapter.id}`) — see `useChapterStore`'s `initChapter` doc comment. */
  chapterKey: string;
}

interface RenderCtx {
  /** One path per open board, deepest last — see chapterStore's `boardPaths`. */
  boardPaths: string[][];
  onSelectPath: (path: string[]) => void;
}

function pathsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function MoveLink({
  node,
  path,
  moveNumber,
  color,
  showNumber,
  depth,
  ctx,
}: {
  node: MoveNode;
  path: string[];
  moveNumber: number;
  color: "w" | "b";
  showNumber: boolean;
  /** 0 = mainline, 1+ = how many variations deep this move is nested. */
  depth: number;
  ctx: RenderCtx;
}) {
  // This move is "active" for board `depth` exactly when that board is
  // currently showing this exact position — boardPaths[i] is by
  // construction the i-th nesting level's path, so depth doubles as the
  // board index to compare against.
  const isActive = pathsEqual(path, ctx.boardPaths[depth] ?? []) && path.length > 0;
  const accent = depth === 0 ? MAINLINE_ACCENT : variationAccent(depth);

  return (
    // The trailing space is deliberately OUTSIDE the nowrap span: it needs
    // to be a normal, breakable space so the browser can wrap the line
    // between moves — the same way it already wraps between words in a
    // comment. Only "3." and "Nf6" themselves (inside the span) must stay
    // glued together; the gap *between* moves must not.
    <>
      <span className="whitespace-nowrap">
        {showNumber && (
          <span className="tabular-nums text-muted-foreground">
            {moveNumber}
            {color === "b" ? "…" : "."}{" "}
          </span>
        )}
        <button
          type="button"
          data-path={path.join("/")}
          onClick={() => ctx.onSelectPath(path)}
          className={cn(
            "rounded px-0.5 text-foreground transition-colors hover:bg-accent",
            // Weight, not color, marks the mainline as the "spine" of the
            // game — variation moves stay at normal weight so bold reads as
            // "main line" at a glance without competing with the per-depth
            // variation colors used elsewhere (parens, tint, left border).
            depth === 0 ? "font-semibold" : "font-normal",
            isActive && accent.active
          )}
        >
          {node.san}
        </button>
      </span>{" "}
    </>
  );
}

function CommentText({ children, depth }: { children: string; depth: number }) {
  // Mainline prose reads as the book's own narration, so it gets full
  // foreground contrast and upright type, matching ChapterIntro. Variation
  // comments stay muted/italic — annotation on a sideline, not the main text.
  const isMainline = depth === 0;
  return (
    <span
      className={cn(
        "my-3 block text-pretty leading-relaxed first:mt-0",
        isMainline ? "text-foreground" : "text-muted-foreground italic"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Renders `node` itself (its move token + comment, if it has a move) then
 * recurses: any siblings beyond `children[0]` are variations branching from
 * `node`'s position, rendered as parenthetical groups; `children[0]` is the
 * line's own continuation. `depth` increases by one every time recursion
 * enters a variation (however deeply nested), and never decreases again —
 * it's both "how many parens deep is this" for styling and "which board
 * index would show this" for active-highlighting.
 */
function renderLine(
  node: MoveNode,
  path: string[],
  color: "w" | "b",
  moveNumber: number,
  forceNumber: boolean,
  depth: number,
  ctx: RenderCtx
): ReactNode[] {
  const out: ReactNode[] = [];

  if (node.san != null) {
    out.push(
      <MoveLink
        key={`move-${path.join("/")}`}
        node={node}
        path={path}
        moveNumber={moveNumber}
        color={color}
        showNumber={color === "w" || forceNumber}
        depth={depth}
        ctx={ctx}
      />
    );
    // The very first mainline move's comment is `chapter.introComment`
    // (see `parseChapter.ts`) and already rendered once by `ChapterIntro`
    // above — skip it here so it doesn't appear twice in the flowing text.
    const isChapterIntroComment = depth === 0 && path.length === 1;
    if (node.comment && !isChapterIntroComment) {
      out.push(
        <CommentText key={`comment-${path.join("/")}`} depth={depth}>
          {node.comment}
        </CommentText>
      );
    }
  }

  if (node.children.length === 0) return out;

  // `node` only represents a played move when it has a `san` — the tree
  // root doesn't (it's "no move yet"), so its children continue at the
  // *same* color/moveNumber rather than advancing past a move that was
  // never actually played. Getting this wrong shifts every move's color
  // label by one ply and drops the "1." prefix on the very first move.
  const isRoot = node.san == null;
  const childColor: "w" | "b" = isRoot ? color : color === "w" ? "b" : "w";
  const childMoveNumber = isRoot ? moveNumber : color === "w" ? moveNumber : moveNumber + 1;
  // The first move of the whole chapter always shows its number, even if
  // it's Black's move as White (e.g. a [SetUp]/[FEN] chapter starting mid-game).
  const childForceNumber = isRoot;

  const [mainChild, ...variations] = node.children;
  const mainPath = [...path, mainChild.id];

  for (const alt of variations) {
    const altPath = [...path, alt.id];
    const altDepth = depth + 1;
    const accent = variationAccent(altDepth);
    out.push(
      // Block-level (not inline) so a sideline reads as its own indented
      // line rather than running inline after the move it branches from —
      // indentation grows with nesting depth (capped so deeply-nested lines
      // don't drift off the right edge) and the left border + tint repeat
      // the same depth color used inline elsewhere (MoveLink, BoardCard).
      <div
        key={`variation-${altPath.join("/")}`}
        style={{ marginLeft: `${Math.min(altDepth, 4) * 1.25}rem` }}
        className={cn(
          "my-1.5 rounded-sm border-l-2 py-0.5 pl-2 text-[0.94em] italic leading-relaxed before:content-['('] after:content-[')']",
          accent.tint,
          accent.paren,
          accent.rule
        )}
      >
        {renderLine(alt, altPath, childColor, childMoveNumber, true, altDepth, ctx)}
      </div>
    );
  }

  out.push(
    ...renderLine(mainChild, mainPath, childColor, childMoveNumber, childForceNumber, depth, ctx)
  );

  return out;
}

/**
 * Renders the whole chapter as flowing "book" text: the intro paragraph,
 * then every move as a clickable link with inline variations (in parens,
 * colored and tinted by nesting depth so they're easy to spot at a glance)
 * and comments (as prose), instead of a separate per-board move list.
 */
export function GameText({ chapter, chapterKey }: GameTextProps) {
  const initChapter = useChapterStore((state) => state.initChapter);
  const slice = useChapterStore((state) => state.chapters[chapterKey]);
  const selectPath = useChapterStore((state) => state.selectPath);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initChapter(chapterKey, chapter);
  }, [chapter, chapterKey, initChapter]);

  // Whichever board is deepest/active — same "active" position used for
  // highlighting and keyboard navigation. Scroll its move-link into view
  // whenever it changes, whether that's from clicking the board's own
  // Next/Previous arrows, the ArrowRight/ArrowLeft keys, or a click here in
  // the text (a no-op scroll in that case, since it's already in view) — so
  // paging forward on the board always keeps the current move visible.
  const activeKey = slice?.boardPaths.at(-1)?.join("/") ?? "";
  useEffect(() => {
    if (!activeKey) return;
    containerRef.current
      ?.querySelector(`[data-path="${activeKey}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeKey]);

  if (!slice) return <ChapterIntro chapter={chapter} />;

  const ctx: RenderCtx = {
    boardPaths: slice.boardPaths,
    onSelectPath: (path) => selectPath(chapterKey, path),
  };

  const { color, moveNumber } = startingMoveInfo(slice.root.fenAfter);
  const content = renderLine(slice.root, [], color, moveNumber, true, 0, ctx);

  return (
    <div ref={containerRef} className="book-content flex min-w-0 flex-col gap-1">
      <ChapterIntro chapter={chapter} />
      {/* min-w-0 is required here: a flex column's children default to
          min-width:auto, which lets a long run of inline tokens grow past
          the container instead of wrapping. */}
      <div className="min-w-0 break-words leading-loose">{content}</div>
    </div>
  );
}
