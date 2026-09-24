import { describe, expect, it, vi } from "vitest";
import type { CourseUnit, LearnTrack } from "../types";
import {
  getAllowedMovesAtPosition,
  getTerminalFensForTrack,
  getTrackIdsForPracticeFilter,
  isTerminalPosition,
  pickComputerMove,
  trackReachesAnyOf,
} from "./practiceTree";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const italianMain: CourseUnit = {
  openingId: "italian",
  lineId: "main",
  color: "white",
  moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  displayName: "Italian: Main",
};

const italianGiuoco: CourseUnit = {
  openingId: "italian",
  lineId: "giuoco",
  color: "white",
  moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
  displayName: "Italian: Giuoco",
};

describe("getAllowedMovesAtPosition", () => {
  it("allows the next move from a studied line at the starting position", () => {
    const allowed = getAllowedMovesAtPosition(STARTING_FEN, [italianMain], "w");
    expect(allowed).toContain("e4");
  });

  it("allows branch continuations and transposition targets", () => {
    // After 1.e4 e5 2.Nf3 Nc6 — white's next studied move is Bc4
    const afterNc6 =
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    const allowed = getAllowedMovesAtPosition(
      afterNc6,
      [italianMain, italianGiuoco],
      "w"
    );
    expect(allowed).toContain("Bc4");
  });

  it("allows studied continuations and treats shorter lines as terminal", () => {
    // After Italian main line through Bc4 — black to move; Giuoco continues with Bc5
    const afterBc4 =
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    expect(
      getAllowedMovesAtPosition(afterBc4, [italianGiuoco], "b")
    ).toContain("Bc5");
    expect(isTerminalPosition(afterBc4, [italianMain])).toBe(true);
    expect(isTerminalPosition(afterBc4, [italianGiuoco])).toBe(false);
  });
});

describe("isTerminalPosition / pickComputerMove", () => {
  it("marks end-of-line positions as terminal", () => {
    // Position after all of italianMain moves
    const endFen =
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    expect(isTerminalPosition(endFen, [italianMain])).toBe(true);
  });

  it("pickComputerMove returns an allowed move or null", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickComputerMove(STARTING_FEN, [italianMain])).toBe("e4");
    spy.mockRestore();

    const endFen =
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    expect(pickComputerMove(endFen, [italianMain])).toBeNull();
  });
});

describe("track filter helpers", () => {
  const kingsPawn: LearnTrack = {
    id: "kings-pawn",
    name: "King's Pawn",
    side: "white",
    lines: [{ id: "kp", name: "KP", moves: ["e4"] }],
  };

  const italian: LearnTrack = {
    id: "italian",
    name: "Italian",
    side: "white",
    lines: [
      {
        id: "main",
        name: "Main",
        moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
      },
    ],
  };

  const sicilianBlack: LearnTrack = {
    id: "sicilian",
    name: "Sicilian",
    side: "black",
    lines: [{ id: "open", name: "Open", moves: ["e4", "c5"] }],
  };

  it("getTerminalFensForTrack captures end-of-line FENs", () => {
    const fens = getTerminalFensForTrack(kingsPawn);
    expect(fens.size).toBe(1);
    expect([...fens][0]).toContain("4P3");
  });

  it("trackReachesAnyOf detects lines that hit a FEN set", () => {
    const terminals = getTerminalFensForTrack(kingsPawn);
    expect(trackReachesAnyOf(italian, terminals)).toBe(true);
    expect(trackReachesAnyOf(sicilianBlack, terminals)).toBe(true); // both start with e4
  });

  it("getTrackIdsForPracticeFilter includes same-side continuations only", () => {
    const ids = getTrackIdsForPracticeFilter("kings-pawn", [
      kingsPawn,
      italian,
      sicilianBlack,
    ]);
    expect(ids.has("kings-pawn")).toBe(true);
    expect(ids.has("italian")).toBe(true);
    expect(ids.has("sicilian")).toBe(false);
  });
});
