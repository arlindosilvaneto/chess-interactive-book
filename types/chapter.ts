export interface PgnTags {
  Event?: string;
  Site?: string;
  Date?: string;
  Round?: string;
  White?: string;
  Black?: string;
  Result?: string;
  ECO?: string;
  WhiteElo?: string;
  BlackElo?: string;
  [key: string]: string | undefined;
}

export interface MoveNode {
  /** Stable id (nanoid) — NOT derived from path, since path-derived ids break on insertion. */
  id: string;
  /** 0 for the root (starting position) node. */
  ply: number;
  /** SAN of the move that produced this node; null only for the root. */
  san: string | null;
  fenBefore: string;
  fenAfter: string;
  comment?: string;
  nags?: number[];
  origin: "pgn" | "user";
  /** children[0] is the mainline continuation; children[1..] are variations. */
  children: MoveNode[];
}

export interface Chapter {
  id: string;
  title: string;
  tags: PgnTags;
  /** Comment attached to move 1 — rendered as the chapter's introduction. */
  introComment: string;
  root: MoveNode;
  rawPgn: string;
}
