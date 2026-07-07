"use client";

import { Board } from "@/components/boards/Board";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { uciLineToSteps } from "@/lib/chess/pv";
import { cn } from "@/lib/utils";

import { formatScoreLabel } from "./EngineEvalBar";
import type { EngineLine } from "./stockfish.worker";

export interface AnalysisLinesProps {
  /** The position the lines were computed for — needed to convert UCI moves to SAN. */
  fen: string;
  sideToMove: "w" | "b";
  lines: EngineLine[];
  /**
   * Reserves this many row-slots (pass the MultiPV setting) so the panel's
   * height stays constant as `lines` empties out and refills on every move
   * navigation — otherwise the height change is picked up by BoardCard's
   * `motion.div layout`, animating the *entire card* on every update.
   */
  expectedLines: number;
  /**
   * Set once there's conclusively nothing to show (a fetch error, or cloud
   * has no data for this position) — an empty `lines` with no message means
   * "still loading," rendered as skeleton rows instead of collapsing.
   */
  emptyMessage?: string;
  /** Matches the parent board's orientation so a line's hover-preview boards read the same way. */
  orientation?: "white" | "black";
  /** Prefix for hover-preview board DOM ids — must be unique per BoardCard instance to avoid id collisions between simultaneously-analyzing boards. */
  idPrefix: string;
}

const ROW_HEIGHT = "h-7";

/**
 * Shows the actual analysis results — score + best line, one row per
 * MultiPV line — since the eval bar alone only conveys "who's better," not
 * "what's the idea." Each move in a line is individually hoverable: a small
 * popup board previews the position right after that move, since reading a
 * long SAN line and visualizing the resulting position in your head is slow.
 */
export function AnalysisLines({
  fen,
  sideToMove,
  lines,
  expectedLines,
  emptyMessage,
  orientation = "white",
  idPrefix,
}: AnalysisLinesProps) {
  const rowCount = Math.max(expectedLines, lines.length, 1);
  const showEmptyMessage = lines.length === 0 && emptyMessage;

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-2.5">
      {Array.from({ length: rowCount }, (_, index) => {
        if (showEmptyMessage) {
          // Only the first slot carries the message; the rest stay as
          // invisible same-height spacers so the container's total height
          // doesn't depend on whether we're showing a message or N lines.
          return index === 0 ? (
            <div
              key="empty-message"
              className={cn(ROW_HEIGHT, "flex items-center px-1 text-sm text-muted-foreground")}
            >
              {emptyMessage}
            </div>
          ) : (
            <div key={`empty-spacer-${index}`} className={ROW_HEIGHT} aria-hidden />
          );
        }

        const line = lines[index];
        if (!line) {
          return (
            <div
              key={`loading-${index}`}
              className={cn(ROW_HEIGHT, "animate-pulse rounded bg-muted/70")}
            />
          );
        }

        const steps = uciLineToSteps(fen, line.pv);
        const label = formatScoreLabel({ cp: line.scoreCp, mate: line.scoreMate }, sideToMove);
        const sign = sideToMove === "w" ? 1 : -1;
        const favorsWhite =
          line.scoreMate != null ? line.scoreMate * sign > 0 : (line.scoreCp ?? 0) * sign > 0;

        return (
          <div key={line.multipv} className={cn(ROW_HEIGHT, "flex items-center gap-2 text-sm")}>
            <span
              className={cn(
                "w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold tabular-nums",
                favorsWhite
                  ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-200"
                  : "bg-neutral-800 text-neutral-50"
              )}
            >
              {label}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
              {steps.length > 0 ? (
                steps.map((step, stepIndex) => (
                  <Tooltip key={stepIndex}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="shrink-0 rounded px-0.5 text-foreground/90 hover:bg-muted-foreground/15 hover:text-foreground"
                      >
                        {step.label ? `${step.label} ` : ""}
                        {step.san}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="w-40 p-1.5">
                      <Board
                        id={`${idPrefix}-preview-${line.multipv}-${stepIndex}`}
                        fen={step.fenAfter}
                        orientation={orientation}
                        interactive={false}
                      />
                    </TooltipContent>
                  </Tooltip>
                ))
              ) : (
                <span className="text-foreground/90">…</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
