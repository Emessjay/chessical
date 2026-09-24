import { describe, expect, it } from "vitest";
import {
  selectDrillFromCauseCounts,
  pickDrillTypeForSession,
  pickPuzzle,
  CAUSE_TO_DRILL,
  type TrainingPuzzle,
} from "./trainingSuite";
import type { LossCause } from "./trainerTypes";

const samplePuzzles: TrainingPuzzle[] = [
  {
    id: "a",
    drill: "board_vision",
    fen: "8/8/8/8/8/8/8/4K2k w - - 0 1",
    solutions: ["Kf2"],
    prompt: "a",
  },
  {
    id: "b",
    drill: "board_vision",
    fen: "8/8/8/8/8/8/8/4K2k w - - 0 1",
    solutions: ["Kf1"],
    prompt: "b",
  },
  {
    id: "c",
    drill: "attackers_vs_defenders",
    fen: "8/8/8/8/8/8/8/4K2k w - - 0 1",
    solutions: ["Ke2"],
    prompt: "c",
  },
];

describe("CAUSE_TO_DRILL", () => {
  it("maps hangs to board vision and trades to attackers_vs_defenders", () => {
    expect(CAUSE_TO_DRILL.hang_to_long_range).toBe("board_vision");
    expect(CAUSE_TO_DRILL.hang_by_retreat).toBe("board_vision");
    expect(CAUSE_TO_DRILL.bad_trade).toBe("attackers_vs_defenders");
    expect(CAUSE_TO_DRILL.missed_simple_tactic).toBe("simple_tactics");
    expect(CAUSE_TO_DRILL.endgame_technique).toBe("endgame_basics");
    expect(CAUSE_TO_DRILL.ambiguous).toBe("mixed");
  });
});

describe("selectDrillFromCauseCounts", () => {
  it("defaults to mixed with no history", () => {
    const sel = selectDrillFromCauseCounts(null);
    expect(sel.drill).toBe("mixed");
    expect(sel.sourceCause).toBeNull();
  });

  it("picks the most frequent specialized cause", () => {
    const counts: Partial<Record<LossCause, number>> = {
      hang_to_long_range: 5,
      bad_trade: 2,
      ambiguous: 3,
    };
    const sel = selectDrillFromCauseCounts(counts);
    expect(sel.drill).toBe("board_vision");
    expect(sel.sourceCause).toBe("hang_to_long_range");
  });

  it("falls back to mixed for ambiguous-only history", () => {
    const sel = selectDrillFromCauseCounts({ ambiguous: 4, low_time: 2 });
    expect(sel.drill).toBe("mixed");
    expect(sel.sourceCause).toBe("ambiguous");
  });

  it("ignores low_time and early_resignation for specialization", () => {
    const sel = selectDrillFromCauseCounts({
      low_time: 10,
      early_resignation: 8,
      bad_trade: 1,
    });
    expect(sel.drill).toBe("attackers_vs_defenders");
    expect(sel.sourceCause).toBe("bad_trade");
  });
});

describe("pickDrillTypeForSession", () => {
  it("returns the specialized drill unchanged", () => {
    expect(
      pickDrillTypeForSession({
        drill: "simple_tactics",
        sourceCause: "missed_simple_tactic",
        reason: "test",
      })
    ).toBe("simple_tactics");
  });

  it("samples from the balanced mix for mixed selection", () => {
    let i = 0;
    const seq = [0.05, 0.35, 0.65, 0.9];
    const rng = () => seq[i++] ?? 0;
    const drills = [0, 1, 2, 3].map(() =>
      pickDrillTypeForSession(
        { drill: "mixed", sourceCause: null, reason: "t" },
        rng
      )
    );
    expect(new Set(drills).size).toBeGreaterThan(1);
  });
});

describe("pickPuzzle", () => {
  it("returns a puzzle for the requested drill", () => {
    const p = pickPuzzle(samplePuzzles, "board_vision", [], () => 0);
    expect(p?.drill).toBe("board_vision");
    expect(p?.id).toBe("a");
  });

  it("avoids recent ids when alternatives exist", () => {
    const p = pickPuzzle(samplePuzzles, "board_vision", ["a"], () => 0);
    expect(p?.id).toBe("b");
  });

  it("returns null when the drill pool is empty", () => {
    expect(pickPuzzle(samplePuzzles, "endgame_basics")).toBeNull();
  });
});
