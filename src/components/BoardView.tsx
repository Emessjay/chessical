import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import {
  getPositionAfterMoves,
  getLastMove,
  tryMoveFromSquares,
  getMoveSquares,
} from "../lib/chess";
import { MoveControls } from "./MoveControls";
import type { PracticeSide } from "../types";
import { formatMoveList, type ViewMode } from "./boardViewShared";

const PLAY_INTERVAL_MS = 1500;
const OPPONENT_MOVE_DELAY_MS = 700;

/** When set, parent renders move list and MoveControls (e.g. in a sidebar). */
interface BoardViewControlledProps {
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
}

interface BoardViewProps {
  moves: string[];
  openingName?: string;
  mode?: ViewMode;
  practiceSide?: PracticeSide;
  showMoveList?: boolean;
  /** When provided, board is controlled and move list/controls are not rendered here. */
  controlled?: BoardViewControlledProps;
  /** In practice mode: show hint arrow for the next move. */
  showHintArrow?: boolean;
  /** In practice mode: called when the user plays a wrong move (e.g. for no-arrows stage wrong count). */
  onWrongMove?: () => void;
  /** In practice mode: called when the user completes the line (reaches end of moves). */
  onLineCleared?: () => void;
  /** In practice mode: called when the user plays a correct move (e.g. to reset no-arrows wrong count). */
  onCorrectMove?: () => void;
  /** When true, hide Previous/Next in move controls (e.g. when playing from memory). */
  hideStepButtons?: boolean;
  /** Organic practice: allowed moves at current position; when set, validate against this set instead of moves[currentIndex]. */
  allowedMoves?: string[];
  /** Organic practice: when set, on correct move call this instead of advancing index; parent appends move and opponent reply. */
  onValidMove?: (san: string) => void;
  /** Called when the user clicks any square (e.g. to reset after line complete in practice). */
  onBoardClick?: () => void;
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
  showMoveList = false,
  controlled,
  showHintArrow = false,
  onWrongMove,
  onLineCleared,
  onCorrectMove,
  hideStepButtons = false,
  allowedMoves,
  onValidMove,
  onBoardClick,
}: BoardViewProps) {
  const [internalIndex, setInternalIndex] = useState(0);
  const [internalPlaying, setInternalPlaying] = useState(false);
  const isOrganicPractice = onValidMove != null;
  const currentIndex = isOrganicPractice ? moves.length : (controlled?.currentIndex ?? internalIndex);
  const setCurrentIndexRaw = controlled?.onIndexChange ?? setInternalIndex;
  const isPlaying = controlled?.isPlaying ?? internalPlaying;
  const stopPlaying = useCallback(() => {
    if (controlled) {
      if (controlled.isPlaying) controlled.onPlayPause();
      return;
    }
    setInternalPlaying(false);
  }, [controlled]);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const renderControlsHere = !controlled;
  const opponentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayOpponentRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  const setCurrentIndex = useCallback(
    (valueOrUpdater: number | ((prev: number) => number)) => {
      if (typeof valueOrUpdater === "function") {
        const next = valueOrUpdater(currentIndexRef.current);
        setCurrentIndexRaw(next);
      } else {
        setCurrentIndexRaw(valueOrUpdater);
      }
    },
    [setCurrentIndexRaw]
  );
  const maxIndex = moves.length;

  const isPractice = mode === "practice";
  const isPlayerTurn =
    isPractice &&
    ((practiceSide === "white" && currentIndex % 2 === 0) ||
      (practiceSide === "black" && currentIndex % 2 === 1));
  const isOpponentTurn =
    isPractice && !isPlayerTurn && currentIndex < maxIndex && !isOrganicPractice;

  // Reset to start when opening changes
  useEffect(() => {
    setCurrentIndex(0);
    stopPlaying();
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
          queueMicrotask(stopPlaying);
          return prev;
        }
        return prev + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, isPractice, maxIndex, setCurrentIndex, stopPlaying]);

  // Practice mode: auto-play opponent move after delay (only when we arrived at opponent turn by player having just moved)
  useEffect(() => {
    if (!isOpponentTurn || !autoPlayOpponentRef.current) return;
    autoPlayOpponentRef.current = false;
    setPracticeError(null);
    opponentTimeoutRef.current = setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= moves.length) {
          queueMicrotask(() => onLineCleared?.());
        }
        return next;
      });
      opponentTimeoutRef.current = null;
    }, OPPONENT_MOVE_DELAY_MS);
    return () => {
      if (opponentTimeoutRef.current) {
        clearTimeout(opponentTimeoutRef.current);
        opponentTimeoutRef.current = null;
      }
    };
  }, [isOpponentTurn, moves.length, onLineCleared]);

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
    stopPlaying();
  }, [setCurrentIndex, stopPlaying]);

  const onNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
  }, [maxIndex]);

  const onPlayPause = useCallback(() => {
    if (controlled) {
      controlled.onPlayPause();
    } else {
      setInternalPlaying((prev) => !prev);
    }
  }, [controlled]);

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!isPractice || !isPlayerTurn) return false;
      if (targetSquare === null) return false;

      // If the piece is dropped back on its original square, treat it as a
      // cancelled drag so the board can restore the piece visuals.
      if (targetSquare === sourceSquare) {
        setPracticeError(null);
        return true;
      }

      setPracticeError(null);
      const san = tryMoveFromSquares(fen, sourceSquare, targetSquare);
      if (san === null) {
        setPracticeError("Illegal move.");
        return false;
      }

      if (isOrganicPractice && allowedMoves != null && onValidMove != null) {
        if (!allowedMoves.includes(san)) {
          setPracticeError("Not in your studied lines.");
          onWrongMove?.();
          return false;
        }
        onCorrectMove?.();
        onValidMove(san);
        return true;
      }

      const expected = moves[currentIndex];
      if (san !== expected) {
        setPracticeError(`Wrong move. The opening plays ${expected}.`);
        onWrongMove?.();
        return false;
      }
      onCorrectMove?.();
      autoPlayOpponentRef.current = true;
      const nextIndex = currentIndex + 1;
      setCurrentIndex((prev) => prev + 1);
      if (nextIndex >= moves.length) {
        onLineCleared?.();
      }
      return true;
    },
    [
      isPractice,
      isPlayerTurn,
      fen,
      moves,
      currentIndex,
      onWrongMove,
      onLineCleared,
      onCorrectMove,
      isOrganicPractice,
      allowedMoves,
      onValidMove,
    ]
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

  const hintArrows = useMemo(() => {
    if (!showHintArrow || !isPlayerTurn || currentIndex >= maxIndex)
      return undefined;
    const sq = getMoveSquares(moves, currentIndex);
    if (!sq) return undefined;
    return [
      {
        startSquare: sq.from,
        endSquare: sq.to,
        color: "rgba(167, 139, 250, 0.72)",
      },
    ];
  }, [showHintArrow, isPlayerTurn, currentIndex, maxIndex, moves]);

  const boardOrientation = isPractice && practiceSide === "black" ? "black" : "white";
  const allowDragging = isPractice && isPlayerTurn;
  const showPlayButton = !isPractice;

  if (moves.length === 0) {
    const emptyAllowDragging = isPractice && isPlayerTurn;
    return (
      <div className="board-view empty">
        {openingName && (
          <h2 className="board-view-title">{openingName}</h2>
        )}
        <div className="board-wrapper">
          <Chessboard
            options={{
              position: fen,
              allowDragging: emptyAllowDragging,
              showNotation: true,
              boardOrientation,
              ...(onBoardClick && { onSquareClick: onBoardClick }),
              ...(emptyAllowDragging && {
                onPieceDrop,
                canDragPiece,
                draggingPieceStyle: { transform: "scale(1)" },
                dropSquareStyle: { boxShadow: "none" },
              }),
            }}
          />
        </div>
        {practiceError && (
          <p className="board-error" role="alert">
            {practiceError}
          </p>
        )}
        {renderControlsHere && (
          <>
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
              hideStepButtons={hideStepButtons}
            />
          </>
        )}
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
      {isPractice && !isOrganicPractice && currentIndex >= maxIndex && maxIndex > 0 && (
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
            ...(onBoardClick && { onSquareClick: onBoardClick }),
            onPieceDrop,
            canDragPiece,
            draggingPieceStyle: { transform: "scale(1)" },
            dropSquareStyle: { boxShadow: "none" },
            ...(hintArrows != null && { arrows: hintArrows }),
          }}
        />
      </div>
      {practiceError && (
        <p className="board-error" role="alert">
          {practiceError}
        </p>
      )}
      {renderControlsHere && showMoveList && (
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
      )}
      {renderControlsHere && (
        <MoveControls
          currentIndex={currentIndex}
          maxIndex={maxIndex}
          onPrevious={onPrevious}
          onNext={onNext}
          isPlaying={isPlaying}
          onPlayPause={showPlayButton ? onPlayPause : undefined}
          hideStepButtons={hideStepButtons}
        />
      )}
    </div>
  );
}
