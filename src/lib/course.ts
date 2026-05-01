import type { LearnTrack, CourseUnit } from "../types";

/** Minimum half-moves for a line to be shown in the Learn stage. One-move (1 half-move) lines are skipped. */
export const MIN_MOVES_FOR_LEARN = 2;

/**
 * Builds course units for a track: one unit per line, all on the track's side.
 */
export function getCourseUnitsForTrack(track: LearnTrack): CourseUnit[] {
  const units: CourseUnit[] = [];
  const color = track.side;

  if (track.lines?.length) {
    for (const line of track.lines) {
      const displayName = `${track.name}: ${line.name}`;
      units.push({
        openingId: track.id,
        lineId: line.id,
        color,
        moves: line.moves,
        displayName,
        eco: line.eco ?? track.eco,
      });
    }
  } else {
    const moves = track.moves ?? [];
    units.push({
      openingId: track.id,
      lineId: track.id,
      color,
      moves,
      displayName: track.name,
      eco: track.eco,
    });
  }

  return units;
}

/**
 * Returns a stable id for a course unit (trackId:lineId:color).
 */
export function getCourseUnitId(unit: CourseUnit): string {
  return `${unit.openingId}:${unit.lineId}:${unit.color}`;
}

export interface GetOrderedCourseUnitsOpts {
  /** When set, only include lines with at least this many half-moves (for Learn tab). */
  minMoves?: number;
}

/**
 * Returns course units in the order they should be learned: lines in the order
 * `buildLearnTracks` already sorted them (general → specific by prominence).
 */
export function getOrderedCourseUnits(
  track: LearnTrack,
  opts?: GetOrderedCourseUnitsOpts
): CourseUnit[] {
  const minMoves = opts?.minMoves;
  const all = getCourseUnitsForTrack(track);
  if (minMoves == null) return all;

  const filtered = all.filter((u) => u.moves.length >= minMoves);
  // If the threshold filtered out everything, fall back to the bare 2-ply minimum.
  if (filtered.length === 0) {
    return all.filter((u) => u.moves.length >= 2);
  }
  return filtered;
}
