import { Chess } from "chess.js";

/**
 * Lichess's cloud-eval (verified live — its PVs consistently do this, not
 * just for actual Chess960 games) encodes castling as "king takes its own
 * rook" — e1h1 for White kingside, rather than the standard UCI
 * king-destination square e1g1 that chess.js (and this app's local
 * Stockfish worker) expect. `e1h1`/`e1a1` etc. can never be a legal *normal*
 * king move regardless, so remapping them unconditionally is safe.
 */
const CASTLING_UCI_REMAP: Record<string, string> = {
  e1h1: "e1g1",
  e1a1: "e1c1",
  e8h8: "e8g8",
  e8a8: "e8c8",
};

export interface PvStep {
  /** Move-number prefix to render before this move ("12." / "12…" for a line starting on Black), or null when this move doesn't start a new displayed number (Black's move following White's in the same line). */
  label: string | null;
  san: string;
  /** Position immediately after this move — what a hover preview of this step should show. */
  fenAfter: string;
  /** Squares this move touched — chess.js's own reported from/to, so castling already comes out as the king's squares (e.g. "e1"/"g1"), matching `lastMoveSquares`' convention for the main board's highlight. */
  from: string;
  to: string;
}

/**
 * Converts a UCI long-algebraic move sequence (e.g. `["e2e4", "e7e5"]`,
 * exactly what both `useStockfish` and `useCloudEval` produce as
 * `EngineLine.pv`) played from `fen` into per-move display steps — SAN, a
 * move-number label, and the resulting FEN (so each move can drive its own
 * hover-preview board). Stops at the first move that fails to parse/apply
 * rather than throwing — a cut-off engine line (e.g. hitting a checkmate)
 * should just render shorter, not crash the panel.
 */
export function uciLineToSteps(fen: string, uciMoves: string[]): PvStep[] {
  const chess = new Chess(fen);
  const parts = fen.split(" ");
  let color: "w" | "b" = parts[1] === "b" ? "b" : "w";
  let moveNumber = Number(parts[5]) || 1;
  const steps: PvStep[] = [];

  for (let index = 0; index < uciMoves.length; index++) {
    const uciRaw = uciMoves[index];
    if (uciRaw.length < 4) break;
    const fromTo = uciRaw.slice(0, 4);
    const uci = CASTLING_UCI_REMAP[fromTo]
      ? CASTLING_UCI_REMAP[fromTo] + uciRaw.slice(4)
      : uciRaw;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;

    let move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      break;
    }
    if (!move) break;

    const label = color === "w" ? `${moveNumber}.` : index === 0 ? `${moveNumber}…` : null;
    steps.push({
      label,
      san: move.san,
      fenAfter: chess.fen(),
      from: move.from,
      to: move.to,
    });

    if (color === "w") {
      color = "b";
    } else {
      color = "w";
      moveNumber += 1;
    }
  }

  return steps;
}
