import { describe, expect, it, vi } from "vitest";
import type { TrainerGame } from "./trainerTypes";
import {
  analyzeGamesForLossCauses,
  lossCauseLabel,
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
    expect(lossCauseLabel("hanging_pieces")).toBe("Hanging piece");
    expect(lossCauseLabel("low_time")).toBe("Low time");
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

  it("defaults unexplained resignations to blundered_tactics without engine", async () => {
    const resign = baseGame({
      termination: "White resigned",
      result: "0-1",
      isUserWhite: true,
      // Short quiet game — no hanging-piece detection expected
      pgn: `[Result "0-1"]\n[Termination "White resigned"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1`,
    });

    const { games } = await analyzeGamesForLossCauses([resign]);
    expect(games[0].isUserLoss).toBe(true);
    expect(games[0].primaryCause).toBe("blundered_tactics");
  });

  it("labels early_resignation when engine says position is playable", async () => {
    const resign = baseGame({
      termination: "White resigned",
      result: "0-1",
      isUserWhite: true,
      pgn: `[Result "0-1"]\n[Termination "White resigned"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1`,
    });

    const runEngineEval = vi.fn(async () => 50); // roughly equal for White
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
    expect(games[0].primaryCause).toBe("blundered_tactics");
  });

  it("detects hanging pieces when user leaves material en prise", async () => {
    // After 3.Qxf7+, black can take the queen with no recapture. Extra quiet
    // moves keep the hang outside the last-third "endgame" window.
    const hang = baseGame({
      termination: "White resigned",
      result: "0-1",
      isUserWhite: true,
      pgn: `[Result "0-1"]
[Termination "White resigned"]

1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7 4. Nf3 Nf6 5. Nc3 d6 6. d3 Be7 7. Be2 Rf8 8. O-O Kg8 0-1`,
    });

    const { games } = await analyzeGamesForLossCauses([hang]);
    expect(games[0].primaryCause).toBe("hanging_pieces");
    expect(games[0].detail).toMatch(/hanging/i);
  });
});
