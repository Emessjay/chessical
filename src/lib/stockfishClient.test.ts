import { describe, expect, it } from "vitest";
import { parseBestMove, parseUciInfo } from "./stockfishClient";

describe("parseUciInfo", () => {
  it("returns null for non-info lines", () => {
    expect(parseUciInfo("bestmove e2e4")).toBeNull();
    expect(parseUciInfo("uciok")).toBeNull();
  });

  it("parses depth, multipv, cp score, and pv", () => {
    const info = parseUciInfo(
      "info depth 14 seldepth 18 multipv 1 score cp 34 nodes 12345 nps 1000000 time 12 pv e2e4 e7e5 g1f3"
    );
    expect(info).toMatchObject({
      depth: 14,
      seldepth: 18,
      multipv: 1,
      score: { type: "cp", value: 34 },
      nodes: 12345,
      nps: 1000000,
      timeMs: 12,
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("parses mate scores", () => {
    const info = parseUciInfo("info depth 8 multipv 2 score mate -3 pv e7e5");
    expect(info?.score).toEqual({ type: "mate", value: -3 });
    expect(info?.multipv).toBe(2);
  });
});

describe("parseBestMove", () => {
  it("parses bestmove with optional ponder", () => {
    expect(parseBestMove("bestmove e2e4")).toEqual({
      bestmove: "e2e4",
      ponder: undefined,
    });
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({
      bestmove: "e2e4",
      ponder: "e7e5",
    });
  });

  it("returns null for malformed lines", () => {
    expect(parseBestMove("info depth 1")).toBeNull();
    expect(parseBestMove("bestmove")).toBeNull();
  });
});
