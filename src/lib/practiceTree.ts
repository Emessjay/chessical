import { Chess } from "chess.js";
import type { CourseUnit, PracticeSide } from "../types";

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
 * For each studied unit, replay its moves; whenever the resulting position
 * matches `fen`, the next move in the line (if it exists and is for `sideToMove`)
 * is allowed. Returns the set of all such next moves (SAN).
 */
export function getAllowedMovesAtPosition(
  fen: string,
  units: CourseUnit[],
  sideToMove: "w" | "b"
): string[] {
  const targetFen = normalizeFen(fen);
  const allowed = new Set<string>();

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
  units: CourseUnit[],
  _practiceSide: PracticeSide
): string | null {
  const side = sideToMoveFromFen(fen);
  const allowed = getAllowedMovesAtPosition(fen, units, side);
  if (allowed.length === 0) return null;
  return allowed[Math.floor(Math.random() * allowed.length)];
}
