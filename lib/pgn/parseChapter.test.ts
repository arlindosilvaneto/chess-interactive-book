import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseChapter } from "./parseChapter";
import { START_FEN } from "../chess/fen";
import type { MoveNode } from "@/types/chapter";

const GAMES_DIR = path.join(process.cwd(), "content", "games");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(GAMES_DIR, name), "utf-8");
}

/** Finds a direct child by SAN, throwing (via the assertion below) instead of
 * silently returning undefined so a broken tree fails with a clear message. */
function child(node: MoveNode, san: string): MoveNode {
  const found = node.children.find((c) => c.san === san);
  expect(found, `expected a child "${san}" under "${node.san ?? "root"}"`).toBeDefined();
  return found as MoveNode;
}

describe("parseChapter — opera-game.pgn", () => {
  const chapter = parseChapter(readFixture("opera-game.pgn"), "opera-game");

  it("extracts PGN tag metadata", () => {
    expect(chapter.tags.Event).toBe("Paris Opera");
    expect(chapter.tags.White).toBe("Paul Morphy");
    expect(chapter.tags.Black).toBe("Duke Karl / Count Isouard");
    expect(chapter.tags.Result).toBe("1-0");
    expect(chapter.tags.ECO).toBe("C41");
  });

  it("uses the Event tag as the title", () => {
    expect(chapter.title).toBe("Paris Opera");
  });

  it("sets introComment from the comment attached to move 1", () => {
    expect(chapter.introComment).toContain("The Opera Game: Morphy plays a casual game");
    expect(chapter.introComment).toContain("most famous");
    expect(chapter.introComment).toContain("miniature in chess history.");
  });

  it("starts from the standard starting position (no [SetUp]/[FEN] tags)", () => {
    expect(chapter.root.fenAfter).toBe(START_FEN);
  });

  it("builds a mainline with children[0] as the played continuation", () => {
    const e4 = child(chapter.root, "e4");
    const e5 = child(e4, "e5");
    const nf3 = child(e5, "Nf3");
    const d6 = child(nf3, "d6");
    const d4 = child(d6, "d4");

    expect(chapter.root.children[0]).toBe(e4);
    expect(d4.ply).toBe(5);
  });

  it("attaches the RAV sideline (3...exd4) as a sibling branch off the pre-move position", () => {
    const e4 = child(chapter.root, "e4");
    const e5 = child(e4, "e5");
    const nf3 = child(e5, "Nf3");
    const d6 = child(nf3, "d6");
    const d4 = child(d6, "d4");

    // d4 is the branch point: mainline continues 3...Bg4, sideline offers 3...exd4.
    expect(d4.children.map((c) => c.san).sort()).toEqual(["Bg4", "exd4"]);
    expect(d4.children[0].san).toBe("Bg4"); // mainline stays at index 0

    const exd4 = child(d4, "exd4");
    expect(exd4.origin).toBe("pgn");
    expect(exd4.ply).toBe(6);

    const nxd4 = child(exd4, "Nxd4");
    const sidelineNf6 = child(nxd4, "Nf6");
    const nc3 = child(sidelineNf6, "Nc3");
    expect(nc3.comment).toContain("Black has a normal, slightly passive but solid");
  });

  it("continues the mainline through to checkmate", () => {
    let node = chapter.root;
    const mainline = [
      "e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5", "Bxf3", "Qxf3", "dxe5",
      "Bc4", "Nf6", "Qb3", "Qe7", "Nc3", "c6", "Bg5", "b5", "Nxb5", "cxb5",
      "Bxb5+", "Nbd7", "O-O-O", "Rd8", "Rxd7", "Rxd7", "Rd1", "Qe6", "Bxd7+",
      "Nxd7", "Qb8+", "Nxb8", "Rd8#",
    ];
    for (const san of mainline) {
      node = child(node, san);
    }
    expect(node.ply).toBe(33);
    expect(node.san).toBe("Rd8#");
  });
});

describe("parseChapter — berlin-wall.pgn", () => {
  const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 3";
  const chapter = parseChapter(readFixture("berlin-wall.pgn"), "berlin-wall");

  it("uses the [SetUp]/[FEN] tags as the starting position, not the default", () => {
    expect(chapter.tags.SetUp).toBe("1");
    expect(chapter.tags.FEN).toBe(FEN);
    expect(chapter.root.fenBefore).toBe(FEN);
    expect(chapter.root.fenAfter).toBe(FEN);
    expect(chapter.root.ply).toBe(0);
  });

  it("sets introComment from the comment on the first mainline move (3. Bb5)", () => {
    expect(chapter.introComment).toContain("Starting from the Ruy Lopez tabiya");
  });

  it("branches into mainline + sideline at ply 2 (Bb5's children), not before or after", () => {
    const bb5 = chapter.root.children[0];
    expect(bb5.san).toBe("Bb5");
    expect(bb5.ply).toBe(1);

    // Regression guard for the previously-fixed RAV placement bug: the
    // variation must attach as an alternative to 3...a6 (i.e. as a sibling
    // child of Bb5, both at ply 2) — not nested deeper inside the mainline
    // and not as a sibling of Bb5 itself.
    expect(bb5.children).toHaveLength(2);
    expect(bb5.children.every((c) => c.ply === 2)).toBe(true);
    expect(bb5.children.map((c) => c.san).sort()).toEqual(["Nf6", "a6"]);
    expect(bb5.children[0].san).toBe("a6"); // mainline continuation stays at index 0
  });

  it("continues the mainline (Closed Ruy) to its final commented move", () => {
    const bb5 = chapter.root.children[0];
    let node = child(bb5, "a6");
    for (const san of ["Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6"]) {
      node = child(node, san);
    }
    expect(node.san).toBe("d6");
    expect(node.ply).toBe(10);
    expect(node.comment).toContain("The Closed Ruy: a rich");
  });

  it("continues the sideline (Berlin Defense) to the Berlin Wall endgame with its comment", () => {
    const bb5 = chapter.root.children[0];
    let node = child(bb5, "Nf6");
    for (const san of ["O-O", "Nxe4", "d4", "Nd6", "Bxc6", "dxc6", "dxe5", "Nf5", "Qxd8+", "Kxd8"]) {
      node = child(node, san);
    }
    expect(node.san).toBe("Kxd8");
    expect(node.ply).toBe(12);
    expect(node.comment).toContain("The Berlin Wall");
    expect(node.comment).toContain("Kramnik against Kasparov");
  });
});
