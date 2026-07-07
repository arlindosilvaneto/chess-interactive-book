import { describe, it, expect } from "vitest";
import { createRoot, applyMove, getNodeByPath } from "./moveTree";
import { START_FEN } from "./fen";

describe("createRoot", () => {
  it("defaults to the standard starting position", () => {
    const root = createRoot();
    expect(root.ply).toBe(0);
    expect(root.san).toBeNull();
    expect(root.fenBefore).toBe(START_FEN);
    expect(root.fenAfter).toBe(START_FEN);
    expect(root.origin).toBe("pgn");
    expect(root.children).toEqual([]);
  });

  it("accepts a custom starting FEN", () => {
    const customFen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 3";
    const root = createRoot(customFen);
    expect(root.fenBefore).toBe(customFen);
    expect(root.fenAfter).toBe(customFen);
  });

  it("throws on a structurally invalid FEN", () => {
    expect(() => createRoot("not-a-fen")).toThrow();
  });
});

describe("applyMove", () => {
  it("appends a legal move as a fresh child node with origin 'user'", () => {
    const root = createRoot();
    const child = applyMove(root, "e4");

    expect(child.san).toBe("e4");
    expect(child.ply).toBe(1);
    expect(child.origin).toBe("user");
    expect(child.fenBefore).toBe(root.fenAfter);
    expect(child.fenAfter).not.toBe(root.fenAfter);
    expect(child.children).toEqual([]);
    expect(child.id).toBeTruthy();
    expect(child.id).not.toBe(root.id);
  });

  it("accepts {from, to, promotion} move objects", () => {
    const root = createRoot();
    const child = applyMove(root, { from: "e2", to: "e4" });
    expect(child.san).toBe("e4");
  });

  it("does not mutate the parent node", () => {
    const root = createRoot();
    applyMove(root, "e4");
    expect(root.children).toEqual([]);
  });

  it("generates a fresh id on every call, even for the same move", () => {
    const root = createRoot();
    const first = applyMove(root, "e4");
    const second = applyMove(root, "e4");
    expect(first.id).not.toBe(second.id);
  });

  it("throws on an illegal move", () => {
    const root = createRoot();
    expect(() => applyMove(root, "e5")).toThrow();
  });

  it("throws on a nonsense move string", () => {
    const root = createRoot();
    expect(() => applyMove(root, "zz9")).toThrow();
  });

  it("throws on an illegal {from, to} move", () => {
    const root = createRoot();
    expect(() => applyMove(root, { from: "e2", to: "e5" })).toThrow();
  });
});

describe("getNodeByPath", () => {
  it("returns the root itself for an empty path", () => {
    const root = createRoot();
    expect(getNodeByPath(root, [])).toBe(root);
  });

  it("resolves a multi-level path by child id", () => {
    const root = createRoot();
    const e4 = applyMove(root, "e4");
    root.children.push(e4);
    const e5 = applyMove(e4, "e5");
    e4.children.push(e5);

    expect(getNodeByPath(root, [e4.id])).toBe(e4);
    expect(getNodeByPath(root, [e4.id, e5.id])).toBe(e5);
  });

  it("returns null when an id in the path doesn't match any child", () => {
    const root = createRoot();
    const e4 = applyMove(root, "e4");
    root.children.push(e4);

    expect(getNodeByPath(root, ["nonexistent-id"])).toBeNull();
    expect(getNodeByPath(root, [e4.id, "nonexistent-id"])).toBeNull();
  });

  it("does not treat sibling order as significant (looks up by id, not index)", () => {
    const root = createRoot();
    const e4 = applyMove(root, "e4");
    const d4 = applyMove(root, "d4");
    // Push in reverse order to prove lookup is id-based, not index-based.
    root.children.push(d4, e4);

    expect(getNodeByPath(root, [e4.id])).toBe(e4);
    expect(getNodeByPath(root, [d4.id])).toBe(d4);
  });
});
