import { Chess } from "chess.js";
import type { CourseUnit, LearnTrack } from "../types";

/**
 * Normalize FEN to a comparable form (piece placement, turn, castling, en passant).
 * Avoids mismatches from move counters or halfmove clock.
 */
function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(" ");
}

/**
 * Returns the side to move from a FEN string: "w" or "b".
 */
function sideToMoveFromFen(fen: string): "w" | "b" {
  const normalized = normalizeFen(fen);
  return normalized.includes(" w ") ? "w" : "b";
}

/**
 * Returns the set of all normalized FENs that appear in any of the given units
 * (at any point when replaying each line). Used to allow transpositions.
 */
function getAllPositionsInUnits(units: CourseUnit[]): Set<string> {
  const positions = new Set<string>();
  for (const unit of units) {
    const chess = new Chess();
    positions.add(normalizeFen(chess.fen()));
    for (let i = 0; i < unit.moves.length; i++) {
      try {
        const result = chess.move(unit.moves[i], { strict: true });
        if (!result) break;
        positions.add(normalizeFen(chess.fen()));
      } catch {
        break;
      }
    }
  }
  return positions;
}

/**
 * For each studied unit, replay its moves; whenever the resulting position
 * matches `fen`, the next move in the line (if it exists and is for `sideToMove`)
 * is allowed. Also allows transpositions: any legal move that reaches a position
 * that appears in any studied line is allowed (e.g. Nf3 from Vienna e4 e5 Nc3 Nf6
 * transposes to Four Knights). Returns the set of all such next moves (SAN).
 */
export function getAllowedMovesAtPosition(
  fen: string,
  units: CourseUnit[],
  sideToMove: "w" | "b"
): string[] {
  const targetFen = normalizeFen(fen);
  const allowed = new Set<string>();

  // 1) Moves that are the next move in a line that reaches this position
  for (const unit of units) {
    const chess = new Chess();
    const moves = unit.moves;

    for (let i = 0; i <= moves.length; i++) {
      const currentFen = normalizeFen(chess.fen());
      if (currentFen === targetFen && i < moves.length) {
        const nextMoveSide: "w" | "b" = i % 2 === 0 ? "w" : "b";
        if (nextMoveSide === sideToMove) {
          allowed.add(moves[i]);
        }
      }
      if (i < moves.length) {
        try {
          const result = chess.move(moves[i], { strict: true });
          if (!result) break;
        } catch {
          break;
        }
      }
    }
  }

  // 2) Transpositions: allow any legal move that reaches a position in some studied line
  const positionsInLines = getAllPositionsInUnits(units);
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [...allowed];
  }
  const legalMoves = chess.moves({ verbose: true });
  for (const m of legalMoves) {
    const copy = new Chess(fen);
    const result = copy.move({
      from: m.from,
      to: m.to,
      promotion: (m.promotion as "q" | "r" | "b" | "n") ?? "q",
    });
    if (result && positionsInLines.has(normalizeFen(copy.fen()))) {
      allowed.add(result.san);
    }
  }

  return [...allowed];
}

/**
 * True when no studied line has any continuation from this position (so we've
 * reached the end of every line that reaches this position, e.g. finished
 * Open Sicilian with no Najdorf studied, or finished a line that has no
 * extensions).
 */
export function isTerminalPosition(fen: string, units: CourseUnit[]): boolean {
  const side = sideToMoveFromFen(fen);
  const allowed = getAllowedMovesAtPosition(fen, units, side);
  return allowed.length === 0;
}

/**
 * Get allowed moves for the side to move in the given position, then pick one
 * at random. Used for the computer's move in organic practice.
 * Returns null if there are no allowed moves.
 */
export function pickComputerMove(
  fen: string,
  units: CourseUnit[]
): string | null {
  const side = sideToMoveFromFen(fen);
  const allowed = getAllowedMovesAtPosition(fen, units, side);
  if (allowed.length === 0) return null;
  return allowed[Math.floor(Math.random() * allowed.length)];
}

/**
 * Returns the set of normalized FENs at the end of each line of a track.
 * Used to detect when we're at "end of opening" and can branch into others.
 */
export function getTerminalFensForTrack(track: LearnTrack): Set<string> {
  const fens = new Set<string>();
  const lines = track.lines ?? [
    { id: track.id, name: track.name, moves: track.moves ?? [] },
  ];
  for (const line of lines) {
    const chess = new Chess();
    for (const move of line.moves) {
      try {
        if (!chess.move(move, { strict: true })) break;
      } catch {
        break;
      }
    }
    fens.add(normalizeFen(chess.fen()));
  }
  return fens;
}

/**
 * True if any line in the track ever reaches any of the given FENs (normalized).
 */
export function trackReachesAnyOf(track: LearnTrack, fens: Set<string>): boolean {
  const lines = track.lines ?? [
    { id: track.id, name: track.name, moves: track.moves ?? [] },
  ];
  for (const line of lines) {
    const chess = new Chess();
    if (fens.has(normalizeFen(chess.fen()))) return true;
    for (const move of line.moves) {
      try {
        if (!chess.move(move, { strict: true })) break;
        if (fens.has(normalizeFen(chess.fen()))) return true;
      } catch {
        break;
      }
    }
  }
  return false;
}

/**
 * When filtering practice by a track, which track IDs should be in the pool.
 * Includes the filter track plus any same-side track that "continues from" it
 * (some line reaches a terminal position of the filter). So e.g. filtering by
 * King's Pawn Game (White) allows branching into Vienna, Four Knights, Italian, etc.
 */
export function getTrackIdsForPracticeFilter(
  filterTrackId: string,
  tracks: LearnTrack[]
): Set<string> {
  const filterTrack = tracks.find((t) => t.id === filterTrackId);
  if (!filterTrack) return new Set([filterTrackId]);

  const terminalFens = getTerminalFensForTrack(filterTrack);
  const allowed = new Set<string>();
  allowed.add(filterTrackId);

  for (const track of tracks) {
    if (track.id === filterTrackId) continue;
    if (track.side !== filterTrack.side) continue;
    if (trackReachesAnyOf(track, terminalFens)) {
      allowed.add(track.id);
    }
  }
  return allowed;
}
