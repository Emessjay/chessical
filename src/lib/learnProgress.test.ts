import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CourseUnit } from "../types";
import {
  getAllClearedUnitIds,
  loadProgress,
  loadProgressByUnitId,
  resetAllClearedLines,
  saveProgress,
  saveProgressByUnitId,
} from "./learnProgress";

const unit: CourseUnit = {
  openingId: "sicilian",
  lineId: "najdorf",
  color: "black",
  moves: ["e4", "c5"],
  displayName: "Sicilian: Najdorf",
};

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("learnProgress", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("returns default progress when nothing is stored", () => {
    expect(loadProgress(unit)).toEqual({
      stage: "arrows",
      wrongCount: 0,
      cleared: false,
    });
  });

  it("round-trips save/load for a unit", () => {
    const progress = { stage: "no-arrows" as const, wrongCount: 2, cleared: true };
    saveProgress(unit, progress);
    expect(loadProgress(unit)).toEqual(progress);
  });

  it("rejects corrupt stored JSON and falls back to defaults", () => {
    localStorage.setItem("chessical_learn_v3_sicilian:najdorf:black", "{not-json");
    expect(loadProgress(unit)).toEqual({
      stage: "arrows",
      wrongCount: 0,
      cleared: false,
    });
  });

  it("rejects structurally invalid progress", () => {
    localStorage.setItem(
      "chessical_learn_v3_sicilian:najdorf:black",
      JSON.stringify({ stage: 1, wrongCount: "x", cleared: "yes" })
    );
    expect(loadProgress(unit)).toEqual({
      stage: "arrows",
      wrongCount: 0,
      cleared: false,
    });
  });

  it("save/load by unit id and lists cleared ids", () => {
    saveProgressByUnitId("a:b:white", {
      stage: "arrows",
      wrongCount: 0,
      cleared: true,
    });
    saveProgressByUnitId("c:d:black", {
      stage: "no-arrows",
      wrongCount: 1,
      cleared: false,
    });

    expect(loadProgressByUnitId("a:b:white").cleared).toBe(true);
    expect(getAllClearedUnitIds()).toEqual(["a:b:white"]);
  });

  it("resetAllClearedLines clears the cleared flag and returns count", () => {
    saveProgressByUnitId("x:y:white", {
      stage: "no-arrows",
      wrongCount: 3,
      cleared: true,
    });
    saveProgressByUnitId("m:n:black", {
      stage: "arrows",
      wrongCount: 0,
      cleared: true,
    });

    expect(resetAllClearedLines()).toBe(2);
    expect(loadProgressByUnitId("x:y:white")).toEqual({
      stage: "no-arrows",
      wrongCount: 3,
      cleared: false,
    });
    expect(getAllClearedUnitIds()).toEqual([]);
  });
});
