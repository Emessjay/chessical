import { Chess } from "chess.js";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface LastMove {
  from: string;
  to: string;
}

export interface PositionResult {
  fen: string;
  error?: string;
}

/**
 * Returns the FEN string for the position after applying moves[0..upToIndex].
 * upToIndex 0 = starting position; upToIndex 1 = after first move; etc.
 * On invalid SAN in data, returns the last valid FEN and an error message.
 */
export function getPositionAfterMoves(
  moves: string[],
  upToIndex: number
): PositionResult {
  if (moves.length === 0 || upToIndex < 0) return { fen: STARTING_FEN };
  const chess = new Chess();
  const end = Math.min(upToIndex, moves.length);
  for (let i = 0; i < end; i++) {
    try {
      const result = chess.move(moves[i], { strict: true });
      if (!result) {
        return {
          fen: chess.fen(),
          error: `Invalid move "${moves[i]}" at move ${i + 1} in this opening.`,
        };
      }
    } catch {
      return {
        fen: chess.fen(),
        error: `Invalid move "${moves[i]}" at move ${i + 1} in this opening.`,
      };
    }
  }
  return { fen: chess.fen() };
}

/**
 * Attempts to play a move from sourceSquare to targetSquare in the given position.
 * Uses queen promotion for pawn moves to the back rank.
 * Returns the SAN string if the move is legal, otherwise null.
 */
export function tryMoveFromSquares(
  fen: string,
  sourceSquare: string,
  targetSquare: string
): string | null {
  const chess = new Chess(fen);
  try {
    const result = chess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    return result ? result.san : null;
  } catch {
    return null;
  }
}

/**
 * Returns the from/to squares of the move at moves[index - 1], for highlighting.
 * Returns null if index <= 0 or the move cannot be applied.
 */
export function getLastMove(
  moves: string[],
  currentIndex: number
): LastMove | null {
  if (currentIndex <= 0 || moves.length === 0) return null;
  const chess = new Chess();
  const moveIndex = Math.min(currentIndex, moves.length) - 1;
  for (let i = 0; i <= moveIndex; i++) {
    try {
      const result = chess.move(moves[i], { strict: true });
      if (!result) return null;
      if (i === moveIndex) return { from: result.from, to: result.to };
    } catch {
      return null;
    }
  }
  return null;
}
