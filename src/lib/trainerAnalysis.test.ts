import { describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import type { TrainerGame } from "./trainerTypes";
import {
  analyzeGamesForLossCauses,
  lossCauseLabel,
  findHangingCaptures,
  exchangeNetForSideToMove,
  evidenceForUserMove,
  pickPrimaryCause,
  createEmptyCauseScores,
} from "./trainerAnalysis";

function baseGame(overrides: Partial<TrainerGame> = {}): TrainerGame {
  return {
    pgn: `[Event "Test"]
[Result "0-1"]
[Termination "White resigned"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 0-1`,
    white: "me",
    black: "opp",
    result: "0-1",
    timeControl: "600",
    endTime: 1,
    termination: "White resigned",
    isUserWhite: true,
    ...overrides,
  };
}

describe("lossCauseLabel", () => {
  it("maps known causes to display labels", () => {
    expect(lossCauseLabel("hang_to_long_range")).toBe("Hang to long-range piece");
    expect(lossCauseLabel("bad_trade")).toBe("Bad trade / unequal exchange");
    expect(lossCauseLabel("ambiguous")).toBe("Unclear / mixed");
    expect(lossCauseLabel("low_time")).toBe("Low time");
  });
});

describe("findHangingCaptures", () => {
  it("detects an unprotected queen", () => {
    const chess = new Chess(
      "rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3"
    );
    const hangs = findHangingCaptures(chess);
    expect(hangs.some((m) => m.san === "Nxh4")).toBe(true);
  });
});

describe("exchangeNetForSideToMove", () => {
  it("scores a queen-for-pawn grab as a bad trade", () => {
    const before = new Chess(
      "r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3"
    );
    const capture = before.moves({ verbose: true }).find((m) => m.san === "Qxf7+");
    expect(capture).toBeTruthy();
    const net = exchangeNetForSideToMove(before, capture!);
    expect(net).toBeLessThan(0);
  });
});

describe("evidenceForUserMove", () => {
  it("detects long-range hanging captures on the board", () => {
    const whiteToTake = new Chess("4k3/8/8/3n4/4B3/8/8/4K3 w - - 0 1");
    expect(
      findHangingCaptures(whiteToTake).some((m) => m.san === "Bxd5")
    ).toBe(true);
  });

  it("scores hang_by_retreat when a defender vacates", () => {
    // White rook on d1 defends Nd4; Ra1 leaves the knight hanging to ...Qxd4
    const before = new Chess("3qkb1r/8/8/8/3N4/8/8/3RK3 w k - 0 1");
    const after = new Chess(before.fen());
    const played = after.move({ from: "d1", to: "a1" });
    expect(played).toBeTruthy();
    const evidence = evidenceForUserMove(before, after, played!, {
      inEndgame: false,
    });
    expect(evidence.scores.hang_by_retreat ?? 0).toBeGreaterThan(0);
  });

  it("does not label a capturing queen as hang_by_retreat", () => {
    const before = new Chess(
      "r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3"
    );
    const after = new Chess(before.fen());
    const played = after.move("Qxf7+")!;
    const evidence = evidenceForUserMove(before, after, played, {
      inEndgame: false,
    });
    expect(evidence.scores.bad_trade ?? 0).toBeGreaterThan(0);
    expect(evidence.scores.hang_by_retreat ?? 0).toBe(0);
  });
});

describe("pickPrimaryCause", () => {
  it("returns ambiguous when board scores are weak", () => {
    const scores = createEmptyCauseScores();
    scores.bad_trade = 1;
    scores.hang_to_long_range = 0.5;
    const pick = pickPrimaryCause(scores);
    expect(pick.primary).toBe("ambiguous");
  });

  it("returns ambiguous when top causes conflict", () => {
    const scores = createEmptyCauseScores();
    scores.bad_trade = 3;
    scores.hang_to_long_range = 2.8;
    const pick = pickPrimaryCause(scores);
    expect(pick.primary).toBe("ambiguous");
  });

  it("picks a clear winner with margin", () => {
    const scores = createEmptyCauseScores();
    scores.hang_to_long_range = 4;
    scores.bad_trade = 1;
    const pick = pickPrimaryCause(scores, {
      detailByCause: { hang_to_long_range: "Left rook hanging to bishop" },
    });
    expect(pick.primary).toBe("hang_to_long_range");
    expect(pick.detail).toMatch(/hanging/i);
  });

  it("forces low_time when timeout is known", () => {
    const scores = createEmptyCauseScores();
    scores.hang_to_long_range = 5;
    const pick = pickPrimaryCause(scores, { forcedLowTime: true });
    expect(pick.primary).toBe("low_time");
  });
});

describe("analyzeGamesForLossCauses", () => {
  it("ignores draws and wins for the user", async () => {
    const draw = baseGame({
      result: "1/2-1/2",
      termination: "Game drawn by agreement",
      pgn: `[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2`,
    });
    const win = baseGame({
      result: "1-0",
      termination: "Black resigned",
      pgn: `[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Qxf7# 1-0`,
      isUserWhite: true,
    });

    const { summary, games } = await analyzeGamesForLossCauses([draw, win]);
    expect(summary.totalGames).toBe(2);
    expect(summary.losses).toBe(0);
    expect(games.every((g) => g.primaryCause === null)).toBe(true);
  });

  it("classifies timeout losses as low_time", async () => {
    const timedOut = baseGame({
      termination: "White lost on time",
      result: "0-1",
      isUserWhite: true,
      pgn: `[Result "0-1"]\n[Termination "White lost on time"]\n\n1. e4 e5 2. Nf3 0-1`,
    });

    const { games, summary } = await analyzeGamesForLossCauses([timedOut]);
    expect(games[0].primaryCause).toBe("low_time");
    expect(summary.causeCounts.low_time).toBe(1);
  });

  it("defaults unexplained resignations to ambiguous without engine", async () => {
    const resign = baseGame({
      termination: "White resigned",
      result: "0-1",
      isUserWhite: true,
      pgn: `[Result "0-1"]\n[Termination "White resigned"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1`,
    });

    const { games } = await analyzeGamesForLossCauses([resign]);
    expect(games[0].isUserLoss).toBe(true);
    expect(games[0].primaryCause).toBe("ambiguous");
  });

  it("labels early_resignation when engine says position is playable", async () => {
    const resign = baseGame({
      termination: "White resigned",
      result: "0-1",
      isUserWhite: true,
      pgn: `[Result "0-1"]\n[Termination "White resigned"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1`,
    });

    const runEngineEval = vi.fn(async () => 50);
    const { games } = await analyzeGamesForLossCauses([resign], {
      runEngineEval,
    });
    expect(runEngineEval).toHaveBeenCalled();
    expect(games[0].primaryCause).toBe("early_resignation");
  });

  it("does not label early_resignation when already lost on eval", async () => {
    const resign = baseGame({
      termination: "White resigned",
      result: "0-1",
      isUserWhite: true,
      pgn: `[Result "0-1"]\n[Termination "White resigned"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1`,
    });

    const { games } = await analyzeGamesForLossCauses([resign], {
      runEngineEval: async () => -900,
    });
    expect(games[0].primaryCause).toBe("ambiguous");
  });

  it("detects a bad queen trade when user snatches on f7", async () => {
    const hang = baseGame({
      termination: "White resigned",
      result: "0-1",
      isUserWhite: true,
      pgn: `[Result "0-1"]
[Termination "White resigned"]

1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7 4. Nf3 Nf6 5. Nc3 d6 6. d3 Be7 7. Be2 Rf8 8. O-O Kg8 0-1`,
    });

    const { games } = await analyzeGamesForLossCauses([hang]);
    expect(games[0].isUserLoss).toBe(true);
    expect(games[0].primaryCause).toBe("bad_trade");
    expect(games[0].detail).toMatch(/trade|material/i);
  });
});
