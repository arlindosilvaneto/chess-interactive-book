"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuIcon,
  Loader2Icon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnalysisLines } from "@/components/engine/AnalysisLines";
import { EngineEvalBar } from "@/components/engine/EngineEvalBar";
import { useCloudEval } from "@/components/engine/useCloudEval";
import { useServerStockfish } from "@/components/engine/useServerStockfish";
import { useStockfish } from "@/components/engine/useStockfish";
import {
  applyMove,
  getNodeByPath,
  lastMoveSquares,
  stepBack,
  stepForward,
  stepToEnd,
} from "@/lib/chess/moveTree";
import { useChapterStore } from "@/lib/store/chapterStore";
import { useEngineSettingsStore } from "@/lib/store/engineSettingsStore";
import { boardAccent } from "@/lib/ui/variationAccent";
import { cn } from "@/lib/utils";
import type { MoveNode } from "@/types/chapter";

import { Board } from "./Board";
import { CommentPanel } from "./CommentPanel";

/** Small "whose turn" pill — a filled dot plus label, next to the board. */
function TurnIndicator({ sideToMove }: { sideToMove: "w" | "b" }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm">
      <span
        className={cn(
          "size-2.5 rounded-full ring-1 ring-inset ring-foreground/25",
          sideToMove === "w" ? "bg-white" : "bg-neutral-900"
        )}
        aria-hidden
      />
      {sideToMove === "w" ? "White" : "Black"} to move
    </span>
  );
}

export interface BoardCardProps {
  chapterId: string;
  root: MoveNode;
  path: string[];
  /** This board's position in the stack: 0 = mainline, 1+ = sideline nesting depth. */
  levelIndex: number;
  introComment?: string;
  /**
   * Whether this is the deepest board currently open. Closing is only ever
   * offered on the last board — a nested sideline must be closed before the
   * one it branched from, so the stack always unwinds from the top down.
   */
  isLast: boolean;
  onClose?: () => void;
  /** Lets the parent panel scroll this specific board into view. */
  containerRef?: (element: HTMLDivElement | null) => void;
}

export function BoardCard({
  chapterId,
  root,
  path,
  levelIndex,
  introComment,
  isLast,
  onClose,
  containerRef,
}: BoardCardProps) {
  const navigateBoardAt = useChapterStore((state) => state.navigateBoardAt);
  const playMove = useChapterStore((state) => state.playMove);
  // Lives in the chapter store (not local state) so a newly-opened sideline
  // board can inherit the mainline's current flag instead of always
  // starting from a static default — see `setAnalysisEnabled`'s doc comment.
  const analysisEnabled = useChapterStore(
    (state) => state.chapters[chapterId]?.analysisEnabled[levelIndex] ?? false
  );
  const setAnalysisEnabledAt = useChapterStore((state) => state.setAnalysisEnabled);

  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [rejectedFlash, setRejectedFlash] = useState(false);

  const currentNode = getNodeByPath(root, path) ?? root;
  const currentFen = currentNode.fenAfter;
  const lastMove = useMemo(() => lastMoveSquares(currentNode), [currentNode]);
  const sideToMove: "w" | "b" = currentFen.split(" ")[1] === "b" ? "b" : "w";
  const atStart = path.length === 0;
  const atEnd = currentNode.children.length === 0;

  const analysisSource = useEngineSettingsStore((state) => state.settings.analysisSource);
  const multiPv = useEngineSettingsStore((state) => state.settings.multiPv);
  const depth = useEngineSettingsStore((state) => state.settings.depth);
  // All three hooks are always called (rules of hooks). Which ones are
  // `enabled` follows a fallback CHAIN, not just the raw selected source:
  //   cloud  → server → local   (cloud has nothing / errors, try server, then local)
  //   server → local            (server errors, try local)
  //   local  (no further fallback — it's already the last resort)
  // so at most one is "really" active per board, except during a handoff.
  const cloudEnabled = analysisEnabled && analysisSource === "cloud";
  const cloudEval = useCloudEval(currentFen, { enabled: cloudEnabled, multiPv });
  const cloudFailed = analysisSource === "cloud" && (cloudEval.notFound || !!cloudEval.error);

  const serverEnabled = analysisEnabled && (analysisSource === "server" || cloudFailed);
  const serverStockfish = useServerStockfish(currentFen, {
    enabled: serverEnabled,
    depth,
    multiPv,
  });
  // Only meaningful while `serverEnabled` — otherwise the hook is idle and
  // its stale `error` (if any) from a previous source must not count.
  const serverFailed = serverEnabled && !!serverStockfish.error;

  const localEnabled = analysisEnabled && (analysisSource === "local" || serverFailed);
  const stockfish = useStockfish(currentFen, { enabled: localEnabled });

  // Which fallback tier (if any) is currently in effect, for badges/copy.
  const usingServerFallback = analysisSource === "cloud" && cloudFailed && !serverFailed;
  const usingLocalFallback =
    (analysisSource === "cloud" && cloudFailed && serverFailed) ||
    (analysisSource === "server" && serverFailed);
  const usingFallback = usingServerFallback || usingLocalFallback;

  const engine = usingLocalFallback
    ? stockfish
    : usingServerFallback
      ? serverStockfish
      : analysisSource === "server"
        ? serverStockfish
        : analysisSource === "local"
          ? stockfish
          : cloudEval;
  const primaryLine = engine.lines[0];
  // `engine.lines` may be held over from a previous position (see the
  // engine hooks' doc comments) — a score's cp/mate is side-to-move-
  // relative, so it must be paired with the side-to-move of whichever
  // position it was actually computed for (`resultFen`), not the board's
  // current position, or a held-over score gets its sign flipped the
  // instant the actual side to move changes. Falls back to `currentFen`
  // only when nothing has ever resolved yet (resultFen undefined).
  const evalFen = engine.resultFen ?? currentFen;
  const evalSideToMove: "w" | "b" = evalFen.split(" ")[1] === "b" ? "b" : "w";
  const accent = boardAccent(levelIndex);
  const isMainline = levelIndex === 0;

  // Only set once there's conclusively nothing to show — an empty `lines`
  // with no message means "still loading," not "nothing here." Once the
  // fallback engine has its own lines, `engine` already points at it, so
  // this naturally stops applying without any extra branching.
  const fallbackStarting = usingFallback && engine.lines.length === 0 && !engine.error;
  const analysisEmptyMessage = engine.error
    ? `Error: ${engine.error}`
    : fallbackStarting
      ? usingServerFallback
        ? "No cloud evaluation for this position — trying the server engine…"
        : "Falling back to local Stockfish (this can take a few seconds to spin up)…"
      : undefined;
  // Drives the footer/header spinners: true whenever the board is actively
  // working toward a result the reader can't see yet — covers the quick
  // cases (cloud lookup, local/server engine startup) as well as the slower
  // multi-tier fallback handoffs this was specifically added to make less
  // confusing (each hop can take noticeably longer than a plain cloud hit).
  // Uses `analyzing` rather than `engine.lines.length === 0`: the engine
  // hooks now hold the previous position's `lines` until a new result
  // arrives (see their doc comments), so an empty-lines check would miss
  // an in-flight request for a position that already has a stale score.
  const analysisBusy = analysisEnabled && !engine.error && engine.analyzing;
  const footerStatusText = !analysisEnabled
    ? "Analysis off"
    : engine.error
      ? `Engine error: ${engine.error}`
      : usingServerFallback
        ? engine.ready
          ? `${engine.engineLabel} (server fallback)`
          : "Cloud unavailable — trying server engine (may take a few seconds)…"
        : usingLocalFallback
          ? engine.ready
            ? `${engine.engineLabel} (local fallback)`
            : "Falling back to local engine (may take a few seconds)…"
          : engine.ready
            ? engine.engineLabel
            : analysisSource === "cloud"
              ? "Looking up cloud analysis…"
              : analysisSource === "server"
                ? "Evaluating on the server…"
                : "Loading engine…";

  const goTo = (newPath: string[]) => navigateBoardAt(chapterId, levelIndex, newPath);

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean => {
    if (!targetSquare) return false;
    try {
      const newNode = applyMove(currentNode, {
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
      playMove(chapterId, levelIndex, path, newNode);
      return true;
    } catch {
      setRejectedFlash(true);
      window.setTimeout(() => setRejectedFlash(false), 400);
      return false;
    }
  };

  return (
    <motion.div
      ref={containerRef}
      layout
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          "gap-0 overflow-hidden border-t-4 py-0 shadow-md transition-shadow duration-300 hover:shadow-lg",
          accent.border,
          rejectedFlash && "ring-2 ring-destructive"
        )}
      >
        <CardHeader className="gap-2 border-b bg-muted/30 py-4">
          {/* `flex-wrap` here (plus `min-w-0` on CardTitle) is load-bearing,
              not cosmetic: title text + up to two badges + two icon buttons
              all have their own non-shrinkable min-content width, and a
              plain nowrap flex row's own minimum width defaults to the SUM
              of all of them (the same "automatic minimum size" quirk
              documented on EngineEvalBar/AnalysisLines, here on the
              cross/inline axis instead of block). On a narrow phone with
              the fallback badge showing, that sum can exceed the viewport
              and force the whole card — and page — wider than the screen.
              `flex-wrap` changes that minimum to just the widest single
              child, so it drops the button group to its own line instead
              of overflowing. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
              {isMainline ? "Main line" : `Sideline ${levelIndex}`}
              <Badge variant={isMainline ? "default" : "secondary"}>
                {isMainline ? "mainline" : `depth ${levelIndex}`}
              </Badge>
              {analysisEnabled && usingFallback && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
                    >
                      {engine.ready ? (
                        <CpuIcon className="size-3" />
                      ) : (
                        <Loader2Icon className="size-3 animate-spin" />
                      )}
                      {usingServerFallback ? "server fallback" : "local fallback"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {usingServerFallback
                      ? engine.ready
                        ? "Lichess has no cloud evaluation for this position — showing server Stockfish analysis instead."
                        : "Lichess has no cloud evaluation for this position — trying the server engine. This can take a few seconds longer than usual."
                      : analysisSource === "cloud"
                        ? engine.ready
                          ? "Neither Lichess nor the server engine had this position — showing local Stockfish analysis instead."
                          : "Neither Lichess nor the server engine had this position — starting local Stockfish. This can take a few seconds longer than usual."
                        : engine.ready
                          ? "The server engine failed for this position — showing local Stockfish analysis instead."
                          : "The server engine failed for this position — starting local Stockfish. This can take a few seconds longer than usual."}
                  </TooltipContent>
                </Tooltip>
              )}
            </CardTitle>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Flip board"
                onClick={() =>
                  setOrientation((prev) => (prev === "white" ? "black" : "white"))
                }
              >
                <RotateCcwIcon />
              </Button>
              {!isMainline && onClose && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    isLast
                      ? "Close this sideline"
                      : "Close the deeper sideline first"
                  }
                  disabled={!isLast}
                  onClick={onClose}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          </div>
          <TurnIndicator sideToMove={sideToMove} />
        </CardHeader>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex items-stretch gap-2 rounded-xl border bg-muted/20 p-3">
            {analysisEnabled && (
              <EngineEvalBar
                // Only pass a real score object once there's an actual
                // line — otherwise (still loading, or cloud has nothing
                // cached for this position) the bar should show its
                // neutral "no data" state rather than a misleading
                // "0.0 / equal" reading.
                score={
                  primaryLine
                    ? { cp: primaryLine.scoreCp, mate: primaryLine.scoreMate }
                    : undefined
                }
                sideToMove={evalSideToMove}
                orientation={orientation}
              />
            )}
            <div className="min-w-0 flex-1">
              <Board
                // Prefixed with a letter: react-chessboard uses this id in an
                // internal `querySelector('#<id>-square-...')` call, and
                // chapter ids can be bare numbers (e.g. "1"), which are
                // invalid CSS identifiers when leading — `1-mainline-...`
                // throws "not a valid selector".
                id={`board-${chapterId}-${levelIndex}`}
                fen={currentFen}
                orientation={orientation}
                lastMove={lastMove}
                onPieceDrop={handlePieceDrop}
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Go to start"
              disabled={atStart}
              onClick={() => goTo([])}
            >
              <ChevronFirstIcon />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Previous move"
              disabled={atStart}
              onClick={() => goTo(stepBack(path))}
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
            <Button
              type="button"
              variant="default"
              size="icon-lg"
              // The default/primary action for this board — visually the
              // biggest and most saturated of the four, and the one the
              // global ArrowRight keyboard shortcut drives (see BoardsPanel).
              className="shadow-md shadow-primary/30"
              aria-label="Next move"
              disabled={atEnd}
              onClick={() => goTo(stepForward(root, path))}
            >
              <ChevronRightIcon className="size-6" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Go to end of line"
              disabled={atEnd}
              onClick={() => goTo(stepToEnd(root, path))}
            >
              <ChevronLastIcon className="size-5" />
            </Button>
          </div>

          {analysisEnabled && (
            <AnalysisLines
              // `evalFen` (not `currentFen`): `engine.lines` may still be a
              // held-over result for the previous position, and its PV
              // moves only replay correctly from the position they were
              // actually computed against — see `evalFen`'s doc comment.
              fen={evalFen}
              sideToMove={evalSideToMove}
              lines={engine.lines}
              expectedLines={multiPv}
              emptyMessage={analysisEmptyMessage}
              emptyMessageBusy={fallbackStarting}
              orientation={orientation}
              idPrefix={`board-${chapterId}-${levelIndex}`}
            />
          )}

          <CommentPanel node={currentNode} introComment={introComment} />
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              // `min-w-0` lets this flex item actually shrink below its
              // content's width instead of pushing the "Analyze" switch off
              // to the side; `overflow-hidden` (paired with `truncate`
              // below) stops a long fallback message from wrapping to two
              // lines and growing the footer — see AnalysisLines' identical
              // fix for why a flex item needs this even with the row's own
              // height otherwise fixed.
              "flex min-w-0 items-center gap-1.5 overflow-hidden",
              engine.error && "text-destructive"
            )}
          >
            {analysisBusy && <Loader2Icon className="size-3 shrink-0 animate-spin" />}
            <span className="min-w-0 truncate">{footerStatusText}</span>
          </span>
          <div className="flex items-center gap-2">
            <span>Analyze</span>
            <Switch
              checked={analysisEnabled}
              onCheckedChange={(checked) =>
                setAnalysisEnabledAt(chapterId, levelIndex, checked)
              }
            />
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
