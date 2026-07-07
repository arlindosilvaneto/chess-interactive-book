"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuIcon,
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
  /** Only one board analyzes by default, to avoid running many engines at once. */
  defaultAnalysisEnabled?: boolean;
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
  defaultAnalysisEnabled = false,
  containerRef,
}: BoardCardProps) {
  const navigateBoardAt = useChapterStore((state) => state.navigateBoardAt);
  const playMove = useChapterStore((state) => state.playMove);

  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [analysisEnabled, setAnalysisEnabled] = useState(defaultAnalysisEnabled);
  const [rejectedFlash, setRejectedFlash] = useState(false);

  const currentNode = getNodeByPath(root, path) ?? root;
  const currentFen = currentNode.fenAfter;
  const lastMove = useMemo(() => lastMoveSquares(currentNode), [currentNode]);
  const sideToMove: "w" | "b" = currentFen.split(" ")[1] === "b" ? "b" : "w";
  const atStart = path.length === 0;
  const atEnd = currentNode.children.length === 0;

  const analysisSource = useEngineSettingsStore((state) => state.settings.analysisSource);
  const multiPv = useEngineSettingsStore((state) => state.settings.multiPv);
  // Both hooks are always called (rules of hooks). Cloud runs whenever it's
  // the selected source; local runs either as the selected source, or as an
  // automatic fallback when cloud has nothing for this position — so at
  // most one is "really" active per board, except during that handoff.
  const cloudEnabled = analysisEnabled && analysisSource === "cloud";
  const cloudEval = useCloudEval(currentFen, { enabled: cloudEnabled, multiPv });
  const usingFallback =
    analysisSource === "cloud" && (cloudEval.notFound || !!cloudEval.error);
  const localEnabled = analysisEnabled && (analysisSource === "local" || usingFallback);
  const stockfish = useStockfish(currentFen, { enabled: localEnabled });
  const engine = analysisSource === "local" || usingFallback ? stockfish : cloudEval;
  const primaryLine = engine.lines[0];
  const accent = boardAccent(levelIndex);
  const isMainline = levelIndex === 0;

  // Only set once there's conclusively nothing to show — an empty `lines`
  // with no message means "still loading," not "nothing here." Once the
  // fallback engine has its own lines, `engine` already points at it, so
  // this naturally stops applying without any extra branching.
  const analysisEmptyMessage = engine.error
    ? `Error: ${engine.error}`
    : usingFallback && engine.lines.length === 0
      ? "No cloud evaluation for this position — falling back to local Stockfish…"
      : undefined;

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
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
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
                      <CpuIcon className="size-3" />
                      fallback
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Lichess has no cloud evaluation for this position — showing local Stockfish
                    analysis instead.
                  </TooltipContent>
                </Tooltip>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
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
            <EngineEvalBar
              // Only pass a real score object once there's an actual line —
              // otherwise (still loading, or cloud has nothing cached for
              // this position) the bar should show its neutral "no data"
              // state rather than a misleading "0.0 / equal" reading.
              score={
                analysisEnabled && primaryLine
                  ? { cp: primaryLine.scoreCp, mate: primaryLine.scoreMate }
                  : undefined
              }
              sideToMove={sideToMove}
            />
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
              fen={currentFen}
              sideToMove={sideToMove}
              lines={engine.lines}
              expectedLines={multiPv}
              emptyMessage={analysisEmptyMessage}
              orientation={orientation}
              idPrefix={`board-${chapterId}-${levelIndex}`}
            />
          )}

          <CommentPanel node={currentNode} introComment={introComment} />
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={engine.error ? "text-destructive" : undefined}>
            {analysisEnabled
              ? engine.error
                ? `Engine error: ${engine.error}`
                : usingFallback
                  ? engine.ready
                    ? `${engine.engineLabel} (cloud fallback)`
                    : "Cloud unavailable — starting local fallback engine…"
                  : engine.ready
                    ? engine.engineLabel
                    : analysisSource === "cloud"
                      ? "Looking up cloud analysis…"
                      : "Loading engine…"
              : "Analysis off"}
          </span>
          <div className="flex items-center gap-2">
            <span>Analyze</span>
            <Switch checked={analysisEnabled} onCheckedChange={setAnalysisEnabled} />
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
