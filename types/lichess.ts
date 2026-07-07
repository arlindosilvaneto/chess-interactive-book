export interface OpeningExplorerMove {
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

export interface OpeningExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: OpeningExplorerMove[];
  opening?: { eco: string; name: string } | null;
}

export interface TablebaseMove {
  san: string;
  category: string;
  dtz?: number | null;
}

export interface TablebaseResponse {
  category:
    | "win"
    | "loss"
    | "draw"
    | "unknown"
    | "cursed-win"
    | "blessed-loss";
  dtz?: number | null;
  dtm?: number | null;
  moves: TablebaseMove[];
}

export interface CloudEvalPv {
  /** Space-separated UCI moves, e.g. "e2e4 e7e5 g1f3". */
  moves: string;
  /** Centipawns from White's perspective (Lichess's own convention — NOT side-to-move, unlike UCI engine output). */
  cp?: number;
  /** Mate in N from White's perspective (positive = White mates), if the line is forced mate. */
  mate?: number;
}

export interface CloudEvalResponse {
  fen: string;
  /** Thousands of nodes searched to produce this cached evaluation. */
  knodes: number;
  depth: number;
  pvs: CloudEvalPv[];
}
