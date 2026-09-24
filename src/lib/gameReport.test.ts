import { describe, expect, it, vi } from "vitest";
import type { StockfishClient, StockfishPvLine } from "./stockfishClient";
import {
  generateGameReport,
  uciPvToSan,
  winProbabilityFromCp,
} from "./gameReport";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function lines(entries: StockfishPvLine[]): StockfishPvLine[] {
  return entries;
}

function mockClient(
  byFen: Record<string, StockfishPvLine[]>
): StockfishClient {
  return {
    analyzePositionMultiPV: vi.fn(async (fen: string) => {
      const lastLines = byFen[fen] ?? byFen["*"] ?? [];
      return {
        onInfo: () => () => {},
        done: Promise.resolve({
          bestMove: lastLines[0]?.pv?.[0]
            ? { bestmove: lastLines[0].pv[0] }
            : null,
          lastInfoByPv: new Map(
            lastLines.map((l) => [l.multipv, { ...l, score: l.score }])
          ),
          lastLines,
        }),
        stop: () => {},
      };
    }),
  } as unknown as StockfishClient;
}

describe("winProbabilityFromCp", () => {
  it("is ~50 at equal, higher for positive cp", () => {
    expect(winProbabilityFromCp(0)).toBeCloseTo(50, 5);
    expect(winProbabilityFromCp(100)).toBeGreaterThan(50);
    expect(winProbabilityFromCp(-100)).toBeLessThan(50);
  });
});

describe("uciPvToSan", () => {
  it("converts a UCI PV into SAN from the starting position", () => {
    expect(uciPvToSan(STARTING_FEN, ["e2e4", "e7e5", "g1f3"])).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("returns an empty list for an empty PV", () => {
    expect(uciPvToSan(STARTING_FEN, [])).toEqual([]);
  });
});

describe("generateGameReport", () => {
  it("annotates a large winLoss blunder as ??", async () => {
    const afterE4 =
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    // Pre: best is e7e5 (~0). Post after a4-like bad move: huge negative for black.
    // We'll play "a5" as black after e4 — not a huge blunder in reality, so we
    // control scores via the mock instead of relying on real eval.
    const client = mockClient({
      [STARTING_FEN]: lines([
        {
          multipv: 1,
          score: { type: "cp", value: 25 },
          pv: ["e2e4"],
        },
        {
          multipv: 2,
          score: { type: "cp", value: 20 },
          pv: ["d2d4"],
        },
      ]),
      [afterE4]: lines([
        {
          multipv: 1,
          score: { type: "cp", value: 0 },
          pv: ["e7e5"],
        },
        {
          multipv: 2,
          score: { type: "cp", value: -10 },
          pv: ["c7c5"],
        },
      ]),
      // After black plays a6 (mild), report sees large winLoss from mock scores
      "*": lines([
        {
          multipv: 1,
          score: { type: "cp", value: 800 },
          pv: ["d2d4"],
        },
      ]),
    });

    // Force post-move score path: for e4 then a6, fen after a6 gets "*" fallback
    // with +800 from white's view → for black player that's -800 → huge winLoss.
    const report = await generateGameReport(client, ["e4", "a6"], {
      depth: 8,
      onlySoundWinGap: 6,
    });

    expect(report).toHaveLength(2);
    expect(report[0].san).toBe("e4");
    expect(report[0].uci).toBe("e2e4");
    expect(report[1].san).toBe("a6");
    expect(report[1].winLoss).toBeGreaterThan(20);
    expect(report[1].annotation).toBe("??");
  });

  it("stops and notes invalid SAN", async () => {
    const client = mockClient({
      [STARTING_FEN]: lines([
        { multipv: 1, score: { type: "cp", value: 20 }, pv: ["e2e4"] },
        { multipv: 2, score: { type: "cp", value: 15 }, pv: ["d2d4"] },
      ]),
    });

    const report = await generateGameReport(client, ["Ke2"], { depth: 6 });
    expect(report).toHaveLength(1);
    expect(report[0].notes[0]).toMatch(/Invalid move/);
    expect(report[0].playedScore).toBeNull();
  });

  it("aborts when signal is already aborted", async () => {
    const client = mockClient({});
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateGameReport(client, ["e4"], { signal: controller.signal })
    ).rejects.toThrow(/cancelled/);
  });
});
