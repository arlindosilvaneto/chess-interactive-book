"use client";

import type { CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { PieceDropHandlerArgs } from "react-chessboard";

/** Shared background for both the origin and destination square of the last move played. */
const LAST_MOVE_SQUARE_STYLE: CSSProperties = {
  backgroundColor: "rgba(255, 200, 0, 0.35)",
};

export interface BoardProps {
  /** Distinguishes this board's internal DnD state from other simultaneous boards. */
  id: string;
  fen: string;
  orientation?: "white" | "black";
  interactive?: boolean;
  /** The move that produced `fen`, if any — highlighted on the board so readers can spot it at a glance. */
  lastMove?: { from: string; to: string } | null;
  /** Return true to accept the drop (legal move), false to reject it (snaps back). */
  onPieceDrop?: (args: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => boolean;
}

/** Thin wrapper around react-chessboard — owns no game state, just renders a FEN and reports drops. */
export function Board({
  id,
  fen,
  orientation = "white",
  interactive = true,
  lastMove,
  onPieceDrop,
}: BoardProps) {
  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: PieceDropHandlerArgs): boolean => {
    if (!onPieceDrop) return false;
    return onPieceDrop({ sourceSquare, targetSquare });
  };

  return (
    // aspect-square gives this wrapper a height computed directly from its
    // own width — react-chessboard's grid instead derives its height
    // indirectly (each square is `aspect-ratio:1/1`, sized off the *column*
    // width, with the grid container itself set to `height:100%`), which is
    // fine for the board alone but gives a sibling relying on flex
    // `items-stretch` (the eval bar, `h-full`) nothing non-circular to
    // stretch against — it was collapsing to ~0 height instead.
    <div className="aspect-square w-full">
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          onPieceDrop: interactive ? handlePieceDrop : undefined,
          showNotation: true,
          // Spread onto each square's own style by react-chessboard, so this
          // merges cleanly with its other square styling (drop targets,
          // dragged-piece square, etc.) instead of replacing it.
          squareStyles: lastMove
            ? {
                [lastMove.from]: LAST_MOVE_SQUARE_STYLE,
                [lastMove.to]: LAST_MOVE_SQUARE_STYLE,
              }
            : undefined,
          // `boardStyle` merges on top of react-chessboard's own defaults
          // (which already set overflow:hidden), so rounding the corners
          // here also clips the square grid to match, instead of squares
          // poking out past a rounded board frame.
          boardStyle: {
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
            boxShadow:
              "0 20px 35px -15px rgb(0 0 0 / 0.35), 0 4px 10px -4px rgb(0 0 0 / 0.2)",
          },
        }}
      />
    </div>
  );
}
