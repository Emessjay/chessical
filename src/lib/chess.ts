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

/**
 * Returns the from/to squares of the move at moves[index] (the next move to play).
 * Used to draw a hint arrow. Returns null if index is out of range or the move cannot be applied.
 */
export function getMoveSquares(
  moves: string[],
  index: number
): LastMove | null {
  if (index < 0 || index >= moves.length) return null;
  const chess = new Chess();
  for (let i = 0; i < index; i++) {
    try {
      const result = chess.move(moves[i], { strict: true });
      if (!result) return null;
    } catch {
      return null;
    }
  }
  try {
    const result = chess.move(moves[index], { strict: true });
    return result ? { from: result.from, to: result.to } : null;
  } catch {
    return null;
  }
}

/**
 * Returns the FEN string for the position after applying moves[0..upToIndex] from initialFen.
 * If moves.length === 0 && upToIndex === 0, returns initialFen.
 */
export function getPositionAfterMovesFromFen(
  initialFen: string,
  moves: string[],
  upToIndex: number
): PositionResult {
  if (moves.length === 0 || upToIndex <= 0) return { fen: initialFen };
  let chess: Chess;
  try {
    chess = new Chess(initialFen);
  } catch {
    return { fen: initialFen, error: "Invalid initial FEN." };
  }
  const end = Math.min(upToIndex, moves.length);
  for (let i = 0; i < end; i++) {
    try {
      const result = chess.move(moves[i], { strict: true });
      if (!result) {
        return {
          fen: chess.fen(),
          error: `Invalid move "${moves[i]}" at move ${i + 1}.`,
        };
      }
    } catch {
      return {
        fen: chess.fen(),
        error: `Invalid move "${moves[i]}" at move ${i + 1}.`,
      };
    }
  }
  return { fen: chess.fen() };
}

/**
 * Returns the from/to squares of the last move when playing moves from initialFen.
 * currentIndex is the number of moves already applied (so last move is at index currentIndex - 1).
 */
export function getLastMoveFromFen(
  initialFen: string,
  moves: string[],
  currentIndex: number
): LastMove | null {
  if (currentIndex <= 0 || moves.length === 0) return null;
  let chess: Chess;
  try {
    chess = new Chess(initialFen);
  } catch {
    return null;
  }
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

/**
 * Returns the from/to squares of moves[index] when applied from initialFen.
 */
export function getMoveSquaresFromFen(
  initialFen: string,
  moves: string[],
  index: number
): LastMove | null {
  if (index < 0 || index >= moves.length) return null;
  let chess: Chess;
  try {
    chess = new Chess(initialFen);
  } catch {
    return null;
  }
  for (let i = 0; i < index; i++) {
    try {
      const result = chess.move(moves[i], { strict: true });
      if (!result) return null;
    } catch {
      return null;
    }
  }
  try {
    const result = chess.move(moves[index], { strict: true });
    return result ? { from: result.from, to: result.to } : null;
  } catch {
    return null;
  }
}

/**
 * Converts a UCI move (e.g. "e2e4", "e7e8q") to SAN in the given position.
 * Returns null if the move is illegal. Uses queen for promotion if not specified in UCI.
 */
export function uciToSan(fen: string, uci: string): string | null {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length >= 5 ? (uci[4] as "q" | "r" | "b" | "n") : "q";
  try {
    const chess = new Chess(fen);
    const result = chess.move({
      from,
      to,
      promotion: ["q", "r", "b", "n"].includes(promotion) ? promotion : "q",
    });
    return result ? result.san : null;
  } catch {
    return null;
  }
}
