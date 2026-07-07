import { DEFAULT_POSITION, validateFen } from "chess.js";

/** FEN of the standard chess starting position. */
export const START_FEN = DEFAULT_POSITION;

/** Returns whether `fen` is a structurally valid FEN string (per chess.js rules). */
export function isValidFen(fen: string): boolean {
  return validateFen(fen).ok;
}

/**
 * Throws a descriptive error if `fen` is not a valid FEN string.
 * Use at trust boundaries (parsing untrusted PGN tags, user input) before
 * handing the FEN to chess.js elsewhere.
 */
export function assertValidFen(fen: string): void {
  const result = validateFen(fen);
  if (!result.ok) {
    throw new Error(`Invalid FEN "${fen}": ${result.error ?? "unknown error"}`);
  }
}
