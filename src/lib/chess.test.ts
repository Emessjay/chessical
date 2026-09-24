import { describe, expect, it } from "vitest";
import {
  getLastMove,
  getMoveSquares,
  getPositionAfterMoves,
  getPositionAfterMovesFromFen,
  tryMoveFromSquares,
  uciToSan,
} from "./chess";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("getPositionAfterMoves", () => {
  it("returns starting position for empty moves or negative index", () => {
    expect(getPositionAfterMoves([], 0).fen).toBe(STARTING_FEN);
    expect(getPositionAfterMoves(["e4"], -1).fen).toBe(STARTING_FEN);
  });

  it("applies moves up to the given index", () => {
    // upToIndex 1 = after first move only
    const afterOne = getPositionAfterMoves(["e4", "e5", "Nf3"], 1);
    expect(afterOne.error).toBeUndefined();
    expect(afterOne.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    );

    const afterTwo = getPositionAfterMoves(["e4", "e5", "Nf3"], 2);
    expect(afterTwo.error).toBeUndefined();
    expect(afterTwo.fen).toBe(
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
    );
  });

  it("returns last valid FEN and error on invalid SAN", () => {
    const result = getPositionAfterMoves(["e4", "Ke5"], 2);
    expect(result.error).toMatch(/Invalid move "Ke5"/);
    expect(result.fen).toContain("4P3");
  });
});

describe("tryMoveFromSquares", () => {
  it("returns SAN for a legal move", () => {
    expect(tryMoveFromSquares(STARTING_FEN, "e2", "e4")).toBe("e4");
  });

  it("returns null for an illegal move", () => {
    expect(tryMoveFromSquares(STARTING_FEN, "e2", "e5")).toBeNull();
  });
});

describe("getLastMove / getMoveSquares", () => {
  const moves = ["e4", "c5", "Nf3"];

  it("getLastMove returns from/to of the ply just played", () => {
    expect(getLastMove(moves, 0)).toBeNull();
    expect(getLastMove(moves, 1)).toEqual({ from: "e2", to: "e4" });
    expect(getLastMove(moves, 2)).toEqual({ from: "c7", to: "c5" });
  });

  it("getMoveSquares returns from/to of the next move to play", () => {
    expect(getMoveSquares(moves, 0)).toEqual({ from: "e2", to: "e4" });
    expect(getMoveSquares(moves, 2)).toEqual({ from: "g1", to: "f3" });
    expect(getMoveSquares(moves, 3)).toBeNull();
  });
});

describe("FEN-based helpers", () => {
  const afterE4 =
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

  it("getPositionAfterMovesFromFen starts from the given FEN", () => {
    const result = getPositionAfterMovesFromFen(afterE4, ["e5"], 1);
    expect(result.error).toBeUndefined();
    expect(result.fen).toContain("4p3/4P3");
  });

  it("returns initial FEN when upToIndex is 0", () => {
    expect(getPositionAfterMovesFromFen(afterE4, ["e5"], 0).fen).toBe(afterE4);
  });
});

describe("uciToSan", () => {
  it("converts UCI to SAN", () => {
    expect(uciToSan(STARTING_FEN, "e2e4")).toBe("e4");
    expect(uciToSan(STARTING_FEN, "g1f3")).toBe("Nf3");
  });

  it("returns null for short/illegal UCI", () => {
    expect(uciToSan(STARTING_FEN, "e2")).toBeNull();
    expect(uciToSan(STARTING_FEN, "e2e5")).toBeNull();
  });
});
