import { useState, useEffect, useCallback, useRef } from "react";
import { Chessboard } from "react-chessboard";
import {
  getPositionAfterMoves,
  getLastMove,
  tryMoveFromSquares,
} from "../lib/chess";
import { MoveControls } from "./MoveControls";

const PLAY_INTERVAL_MS = 1500;
const OPPONENT_MOVE_DELAY_MS = 700;

export type ViewMode = "view" | "practice";
export type PracticeSide = "white" | "black";

interface BoardViewProps {
  moves: string[];
  openingName?: string;
  mode?: ViewMode;
  practiceSide?: PracticeSide;
}

function formatMoveList(moves: string[]): string {
  if (moves.length === 0) return "";
  let text = "";
  let moveNumber = 1;
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) {
      text += `${moveNumber}. `;
    }
    text += moves[i] + " ";
    if (i % 2 === 1) moveNumber++;
  }
  return text.trim();
}

function isWhitePiece(pieceType: string): boolean {
  return pieceType.startsWith("w");
}
function isBlackPiece(pieceType: string): boolean {
  return pieceType.startsWith("b");
}

export function BoardView({
  moves,
  openingName,
  mode = "view",
  practiceSide = "white",
}: BoardViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const opponentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayOpponentRef = useRef(false);
  const maxIndex = moves.length;

  const isPractice = mode === "practice";
  const isPlayerTurn =
    isPractice &&
    ((practiceSide === "white" && currentIndex % 2 === 0) ||
      (practiceSide === "black" && currentIndex % 2 === 1));
  const isOpponentTurn =
    isPractice && !isPlayerTurn && currentIndex < maxIndex;

  // Reset to start when opening changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
    setPracticeError(null);
    if (opponentTimeoutRef.current) {
      clearTimeout(opponentTimeoutRef.current);
      opponentTimeoutRef.current = null;
    }
    if (isPractice && practiceSide === "black") {
      autoPlayOpponentRef.current = true;
    }
  }, [moves, isPractice, practiceSide]);

  // View mode: auto-step when playing
  useEffect(() => {
    if (!isPractice || !isPlaying) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= maxIndex) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, maxIndex, isPractice]);

  // Practice mode: auto-play opponent move after delay (only when we arrived at opponent turn by player having just moved)
  useEffect(() => {
    if (!isOpponentTurn || !autoPlayOpponentRef.current) return;
    autoPlayOpponentRef.current = false;
    setPracticeError(null);
    opponentTimeoutRef.current = setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      opponentTimeoutRef.current = null;
    }, OPPONENT_MOVE_DELAY_MS);
    return () => {
      if (opponentTimeoutRef.current) {
        clearTimeout(opponentTimeoutRef.current);
        opponentTimeoutRef.current = null;
      }
    };
  }, [isOpponentTurn]);

  const positionResult = getPositionAfterMoves(moves, currentIndex);
  const fen = positionResult.fen;
  const lastMove = getLastMove(moves, currentIndex);
  const squareStyles =
    lastMove != null
      ? {
          [lastMove.from]: { backgroundColor: "rgba(255, 255, 0, 0.35)" },
          [lastMove.to]: { backgroundColor: "rgba(255, 255, 0, 0.35)" },
        }
      : {};

  const onPrevious = useCallback(() => {
    autoPlayOpponentRef.current = false;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setIsPlaying(false);
  }, []);

  const onNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
  }, [maxIndex]);

  const onPlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!isPractice || !isPlayerTurn || targetSquare === null) return false;
      setPracticeError(null);
      const san = tryMoveFromSquares(fen, sourceSquare, targetSquare);
      if (san === null) {
        setPracticeError("Illegal move.");
        return false;
      }
      const expected = moves[currentIndex];
      if (san !== expected) {
        setPracticeError(`Wrong move. The opening plays ${expected}.`);
        return false;
      }
      autoPlayOpponentRef.current = true;
      setCurrentIndex((prev) => prev + 1);
      return true;
    },
    [isPractice, isPlayerTurn, fen, moves, currentIndex]
  );

  const canDragPiece = useCallback(
    ({ piece }: { piece: { pieceType: string } }) => {
      if (!isPractice || !isPlayerTurn) return false;
      return practiceSide === "white"
        ? isWhitePiece(piece.pieceType)
        : isBlackPiece(piece.pieceType);
    },
    [isPractice, isPlayerTurn, practiceSide]
  );

  const moveListFormatted = formatMoveList(moves);

  const boardOrientation = isPractice && practiceSide === "black" ? "black" : "white";
  const allowDragging = isPractice && isPlayerTurn;
  const showPlayButton = !isPractice;

  if (moves.length === 0) {
    return (
      <div className="board-view empty">
        {openingName && (
          <h2 className="board-view-title">{openingName}</h2>
        )}
        {practiceError && (
          <p className="board-error" role="alert">
            {practiceError}
          </p>
        )}
        <div className="board-wrapper">
          <Chessboard
            options={{
              position: fen,
              allowDragging: false,
              showNotation: true,
              boardOrientation,
            }}
          />
        </div>
        <div className="move-list">
          <span className="move-list-label">Moves: </span>
          <span className="move-list-text">—</span>
        </div>
        <MoveControls
          currentIndex={0}
          maxIndex={0}
          onPrevious={onPrevious}
          onNext={onNext}
          onPlayPause={showPlayButton ? onPlayPause : undefined}
        />
      </div>
    );
  }

  return (
    <div className="board-view">
      {openingName && (
        <h2 className="board-view-title">{openingName}</h2>
      )}
      {positionResult.error && (
        <p className="board-error" role="alert">
          {positionResult.error}
        </p>
      )}
      {practiceError && (
        <p className="board-error" role="alert">
          {practiceError}
        </p>
      )}
      {isPractice && currentIndex >= maxIndex && maxIndex > 0 && (
        <p className="practice-complete" role="status">
          Opening complete.
        </p>
      )}
      <div className="board-wrapper">
        <Chessboard
          options={{
            position: fen,
            allowDragging,
            showNotation: true,
            squareStyles,
            boardOrientation,
            onPieceDrop,
            canDragPiece,
            draggingPieceStyle: { transform: "none" },
          }}
        />
      </div>
      <div className="move-list" aria-live="polite">
        <span className="move-list-label">Moves: </span>
        <span className="move-list-text">{moveListFormatted || "—"}</span>
        {moveListFormatted && (
          <span className="move-list-progress">
            {" "}
            ({currentIndex} / {maxIndex})
          </span>
        )}
      </div>
      <MoveControls
        currentIndex={currentIndex}
        maxIndex={maxIndex}
        onPrevious={onPrevious}
        onNext={onNext}
        isPlaying={isPlaying}
        onPlayPause={showPlayButton ? onPlayPause : undefined}
      />
    </div>
  );
}
