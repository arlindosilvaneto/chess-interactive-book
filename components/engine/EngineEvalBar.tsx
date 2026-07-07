"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export interface EngineScore {
  /** Centipawns, from the perspective of the side to move. */
  cp?: number;
  /** Mate in N (positive = side to move mates), from the perspective of the side to move. */
  mate?: number;
}

export interface EngineEvalBarProps {
  score: EngineScore | undefined;
  /** Whose move the analyzed position is at — needed to normalize the score to White's perspective. */
  sideToMove: "w" | "b";
  className?: string;
}

const CP_CLAMP = 800;

/** Maps a score (from the side-to-move's perspective) to a 0-100 "White is winning by this %" fill. */
function scoreToWhiteFillPercent(
  score: EngineScore | undefined,
  sideToMove: "w" | "b"
): number {
  if (!score) return 50;
  const sign = sideToMove === "w" ? 1 : -1;

  if (typeof score.mate === "number") {
    const whiteMate = score.mate * sign;
    return whiteMate >= 0 ? 100 : 0;
  }

  const whiteCp = (score.cp ?? 0) * sign;
  const clamped = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, whiteCp));
  return 50 + (clamped / CP_CLAMP) * 50;
}

/** Takes a side-to-move-perspective score, returns a White-perspective "+0.3"/"M4" label — shared with AnalysisLines. */
export function formatScoreLabel(
  score: EngineScore | undefined,
  sideToMove: "w" | "b"
): string {
  if (!score) return "…";
  const sign = sideToMove === "w" ? 1 : -1;
  if (typeof score.mate === "number") {
    const whiteMate = score.mate * sign;
    return `M${Math.abs(whiteMate)}`;
  }
  const whitePawns = ((score.cp ?? 0) * sign) / 100;
  return whitePawns > 0 ? `+${whitePawns.toFixed(1)}` : whitePawns.toFixed(1);
}

/** Vertical eval bar: white fill grows from the bottom, animated on score changes. */
export function EngineEvalBar({ score, sideToMove, className }: EngineEvalBarProps) {
  const whiteFillPercent = scoreToWhiteFillPercent(score, sideToMove);
  const label = formatScoreLabel(score, sideToMove);

  return (
    <div
      // Deliberately no explicit height (no `h-full`): a flex item's
      // `height: 100%` is a *definite* percentage computed against a flex
      // container whose own height is itself indefinite (auto, driven by
      // the board sibling's content) until stretch resolves it — a fragile
      // two-pass dependency that was collapsing this bar to ~0 height.
      // Leaving height unset and relying on the parent's `items-stretch`
      // (the standard, no-percentage-math way to size a flex sibling to
      // match its neighbor) is the robust fix.
      className={cn(
        // min-h is a defensive floor, not the intended sizing mechanism —
        // self-stretch above should make this match the board's full
        // height; this just guarantees it's never a sliver if that fails.
        "relative flex min-h-48 w-7 shrink-0 flex-col-reverse self-stretch overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-foreground/10",
        className
      )}
      role="meter"
      aria-label="Engine evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(whiteFillPercent)}
      title={label}
    >
      <motion.div
        className="w-full bg-neutral-50"
        initial={false}
        animate={{ height: `${whiteFillPercent}%` }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
      />
      {/* A small pill behind the label keeps it legible regardless of
          whether the fill happens to sit behind it. */}
      <span className="pointer-events-none absolute inset-x-0.5 bottom-0.5 rounded bg-background/80 py-0.5 text-center text-[11px] font-bold text-foreground">
        {label}
      </span>
    </div>
  );
}
