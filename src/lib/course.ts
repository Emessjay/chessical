import type { Opening, CourseUnit, PracticeSide } from "../types";

/** Minimum half-moves for a line to be shown in the Learn stage. One-move (1 half-move) lines are skipped. */
export const MIN_MOVES_FOR_LEARN = 2;

/**
 * Builds all course units for one opening (each line × white and black).
 * Order is not yet chunked; use getOrderedCourseUnits for the final sequence.
 */
export function getCourseUnitsForOpening(opening: Opening): CourseUnit[] {
  const units: CourseUnit[] = [];
  const colors: PracticeSide[] = ["white", "black"];

  if (opening.lines?.length) {
    for (const line of opening.lines) {
      const displayName = `${opening.name}: ${line.name}`;
      for (const color of colors) {
        units.push({
          openingId: opening.id,
          lineId: line.id,
          color,
          moves: line.moves,
          displayName,
          eco: line.eco ?? opening.eco,
        });
      }
    }
  } else {
    const moves = opening.moves ?? [];
    const displayName = opening.name;
    for (const color of colors) {
      units.push({
        openingId: opening.id,
        lineId: opening.id,
        color,
        moves,
        displayName,
        eco: opening.eco,
      });
    }
  }

  return units;
}

/**
 * Returns a stable id for a course unit (openingId:lineId:color).
 */
export function getCourseUnitId(unit: CourseUnit): string {
  return `${unit.openingId}:${unit.lineId}:${unit.color}`;
}

export interface GetOrderedCourseUnitsOpts {
  /** When set, only include lines with at least this many half-moves (for Learn tab). */
  minMoves?: number;
}

/**
 * Returns course units in the order they should be learned: chunks of 2–3 lines,
 * within each chunk (L1 white, L2 white, [L3 white], L1 black, L2 black, [L3 black]).
 */
export function getOrderedCourseUnits(
  opening: Opening,
  chunkSize: number = 2,
  opts?: GetOrderedCourseUnitsOpts
): CourseUnit[] {
  const minMoves = opts?.minMoves;
  const rawLines =
    opening.lines ?? [
      {
        id: opening.id,
        name: opening.name,
        moves: opening.moves ?? [],
      },
    ];
  let lines =
    minMoves != null
      ? rawLines.filter((line) => line.moves.length >= minMoves)
      : rawLines;
  // If minMoves filtered out everything, use lines with at least 2 half-moves (skip only true one-move stubs)
  if (lines.length === 0 && rawLines.length > 0) {
    lines = rawLines.filter((line) => line.moves.length >= 2);
  }
  if (lines.length === 0) return [];

  const all = getCourseUnitsForOpening(opening);
  if (all.length <= 2) {
    if (minMoves != null) {
      const filtered = all.filter((u) => u.moves.length >= minMoves);
      return filtered; // do not fall back to one-move lines
    }
    return all;
  }

  // Group by line: we have pairs (white, black) per line. Reorder so that
  // we get chunks of `chunkSize` lines, and within each chunk we interleave
  // as (L1 white, L2 white, ..., L1 black, L2 black, ...).
  const ordered: CourseUnit[] = [];

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    for (const line of chunk) {
      const whiteUnit = all.find(
        (u) => u.lineId === line.id && u.color === "white"
      );
      if (whiteUnit) ordered.push(whiteUnit);
    }
    for (const line of chunk) {
      const blackUnit = all.find(
        (u) => u.lineId === line.id && u.color === "black"
      );
      if (blackUnit) ordered.push(blackUnit);
    }
  }

  return ordered;
}
