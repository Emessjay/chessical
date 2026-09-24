import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Chess } from "chess.js";
import { BoardView } from "../components/BoardView";
import { StockfishClient } from "../lib/stockfishClient";
import { getPositionAfterMovesFromFen, uciToSan } from "../lib/chess";
import { getAutopsyHistory } from "../lib/autopsyHistory";
import {
  selectDrillFromCauseCounts,
  pickDrillTypeForSession,
  pickPuzzle,
  DRILL_LABELS,
  DRILL_DESCRIPTIONS,
  type TrainingPuzzle,
} from "../lib/trainingSuite";
import { lossCauseLabel } from "../lib/trainerAnalysis";
import type { PracticeSide } from "../types";
import trainingPuzzlesJson from "../data/training-puzzles.json";
import endgamePositions from "../data/endgame-positions.json";

const ENDGAME_DEPTH = 18;
const PUZZLES = trainingPuzzlesJson as TrainingPuzzle[];

type GameResult = "won" | "lost" | "draw" | "solved" | null;

interface EndgameEntry {
  fen: string;
  label?: string;
}

const endgames = endgamePositions as EndgameEntry[];

function endgameAsPuzzle(entry: EndgameEntry, index: number): TrainingPuzzle {
  return {
    id: `eg-${index}`,
    drill: "endgame_basics",
    fen: entry.fen,
    solutions: [], // validated by Stockfish best move
    prompt: "Play the winning side. Only the engine's best move is accepted.",
    label: entry.label ?? "Endgame",
  };
}

function isUserTurn(initialFen: string, movesLength: number): boolean {
  const userPlaysWhite = initialFen.includes(" w ");
  return userPlaysWhite ? movesLength % 2 === 0 : movesLength % 2 === 1;
}

function isEngineTurn(initialFen: string, movesLength: number): boolean {
  return movesLength > 0 && !isUserTurn(initialFen, movesLength);
}

export function TrainingSuitePage() {
  const history = useMemo(() => getAutopsyHistory(), []);
  const selection = useMemo(
    () => selectDrillFromCauseCounts(history?.causeCounts),
    [history]
  );

  const [sessionDrill, setSessionDrill] = useState(() =>
    pickDrillTypeForSession(selection)
  );
  const [puzzle, setPuzzle] = useState<TrainingPuzzle | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [correctMoveSan, setCorrectMoveSan] = useState<string | null>(null);
  const [allowedMoves, setAllowedMoves] = useState<string[] | undefined>();
  const [engineThinking, setEngineThinking] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recentIdsRef = useRef<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const stockfishRef = useRef<StockfishClient | null>(null);

  const isEndgameMode = sessionDrill === "endgame_basics";

  const loadNext = useCallback(() => {
    const drill = pickDrillTypeForSession(selection);
    setSessionDrill(drill);
    setMoves([]);
    setGameResult(null);
    setCorrectMoveSan(null);
    setAllowedMoves(undefined);
    setLoadError(null);
    setFeedback(null);

    if (drill === "endgame_basics") {
      const idx = Math.floor(Math.random() * endgames.length);
      const eg = endgames[idx]!;
      const p = endgameAsPuzzle(eg, idx);
      setPuzzle(p);
      recentIdsRef.current = [...recentIdsRef.current.slice(-8), p.id];
      return;
    }

    const p = pickPuzzle(PUZZLES, drill, recentIdsRef.current);
    if (!p) {
      setPuzzle(null);
      setLoadError("No puzzles available for this drill.");
      return;
    }
    setPuzzle(p);
    setAllowedMoves(p.solutions);
    recentIdsRef.current = [...recentIdsRef.current.slice(-8), p.id];
  }, [selection]);

  // Initial puzzle
  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const initialFen = puzzle?.fen ?? null;
  const currentFen =
    initialFen != null
      ? getPositionAfterMovesFromFen(initialFen, moves, moves.length).fen
      : null;
  const practiceSide: PracticeSide =
    initialFen != null && initialFen.includes(" w ") ? "white" : "black";
  const userTurn =
    initialFen != null && isUserTurn(initialFen, moves.length);

  // Endgame: Stockfish best-move validation on user's turn
  useEffect(() => {
    if (!isEndgameMode || initialFen == null || currentFen == null || !userTurn || gameResult != null) {
      if (!isEndgameMode) return;
      setCorrectMoveSan(null);
      return;
    }
    let cancelled = false;
    setCorrectMoveSan(null);
    setAllowedMoves(undefined);
    const client =
      stockfishRef.current ?? (stockfishRef.current = new StockfishClient());
    (async () => {
      try {
        await client.init();
      } catch {
        if (!cancelled) setLoadError("Failed to start engine.");
        return;
      }
      if (cancelled) return;
      const analysis = await client.analyzePosition(currentFen, {
        depth: ENDGAME_DEPTH,
      });
      const { bestMove } = await analysis.done;
      analysis.stop();
      if (cancelled) return;
      if (bestMove?.bestmove) {
        const san = uciToSan(currentFen, bestMove.bestmove);
        if (san) {
          setCorrectMoveSan(san);
          setAllowedMoves([san]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEndgameMode, initialFen, currentFen, userTurn, gameResult]);

  // Endgame: engine replies
  useEffect(() => {
    if (
      !isEndgameMode ||
      initialFen == null ||
      moves.length === 0 ||
      !isEngineTurn(initialFen, moves.length) ||
      gameResult != null
    ) {
      return;
    }

    const fenAfterUser = getPositionAfterMovesFromFen(
      initialFen,
      moves,
      moves.length
    ).fen;
    const chessAfterUser = new Chess(fenAfterUser);
    if (
      chessAfterUser.isCheckmate() ||
      chessAfterUser.isStalemate() ||
      chessAfterUser.isDraw()
    ) {
      if (chessAfterUser.isCheckmate()) setGameResult("won");
      else setGameResult("draw");
      return;
    }

    let cancelled = false;
    setEngineThinking(true);
    const client =
      stockfishRef.current ?? (stockfishRef.current = new StockfishClient());
    (async () => {
      try {
        await client.init();
      } catch {
        if (!cancelled) setEngineThinking(false);
        return;
      }
      if (cancelled) return;
      const analysis = await client.analyzePosition(fenAfterUser, {
        depth: ENDGAME_DEPTH,
      });
      const { bestMove } = await analysis.done;
      analysis.stop();
      if (cancelled) return;
      setEngineThinking(false);
      if (!bestMove?.bestmove) return;
      const san = uciToSan(fenAfterUser, bestMove.bestmove);
      if (!san) return;
      const nextMoves = [...moves, san];
      setMoves(nextMoves);
      const fenAfterEngine = getPositionAfterMovesFromFen(
        initialFen,
        nextMoves,
        nextMoves.length
      ).fen;
      const chess = new Chess(fenAfterEngine);
      if (chess.isCheckmate()) setGameResult("lost");
      else if (chess.isStalemate() || chess.isDraw()) setGameResult("draw");
    })();
    return () => {
      cancelled = true;
      setEngineThinking(false);
    };
  }, [isEndgameMode, initialFen, moves, gameResult]);

  const handleValidMove = useCallback(
    (san: string) => {
      if (!puzzle || !initialFen) return;

      if (isEndgameMode) {
        const next = [...moves, san];
        setMoves(next);
        const fenAfter = getPositionAfterMovesFromFen(
          initialFen,
          next,
          next.length
        ).fen;
        const chess = new Chess(fenAfter);
        if (chess.isCheckmate()) setGameResult("won");
        else if (chess.isStalemate() || chess.isDraw()) setGameResult("draw");
        return;
      }

      // One-move puzzle drills
      setMoves([san]);
      setGameResult("solved");
      setFeedback("Correct.");
      setAllowedMoves(undefined);
    },
    [puzzle, initialFen, isEndgameMode, moves]
  );

  if (puzzle == null && loadError) {
    return (
      <div className="trainer-page training-suite-page">
        <div className="training-suite-main">
          <h1 className="trainer-title">Training suite</h1>
          <p className="trainer-error" role="alert">
            {loadError}
          </p>
        </div>
      </div>
    );
  }

  if (puzzle == null) {
    return (
      <div className="trainer-page training-suite-page">
        <div className="training-suite-main">
          <h1 className="trainer-title">Training suite</h1>
          <p className="trainer-description">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trainer-page training-suite-page">
      <div className="training-suite-main">
        <h1 className="trainer-title">Training suite</h1>
        <p className="trainer-description training-suite-reason">
          {selection.reason}
          {selection.sourceCause
            ? ` → ${lossCauseLabel(selection.sourceCause)} drills.`
            : ""}
        </p>
        <div className="training-suite-meta">
          <span className="trainer-cause-badge">
            {DRILL_LABELS[sessionDrill]}
          </span>
          {puzzle.label && (
            <span className="trainer-meta">{puzzle.label}</span>
          )}
        </div>
        <p className="trainer-description">{DRILL_DESCRIPTIONS[sessionDrill]}</p>
        <p className="endgame-status" role="status">
          {puzzle.prompt}
        </p>
        <div className="endgame-trainer-actions">
          <button
            type="button"
            className="trainer-button trainer-button-primary"
            onClick={loadNext}
          >
            Next puzzle
          </button>
          {gameResult != null && (
            <p className="endgame-result" role="status">
              {gameResult === "won" && "You won!"}
              {gameResult === "lost" && "You lost."}
              {gameResult === "draw" && "Draw."}
              {gameResult === "solved" && (feedback ?? "Solved!")}
            </p>
          )}
          {engineThinking && (
            <p className="endgame-status" role="status">
              Stockfish is thinking…
            </p>
          )}
          {userTurn && gameResult == null && !engineThinking && isEndgameMode && (
            <p className="endgame-status" role="status">
              Your turn. Find the winning move.
            </p>
          )}
          {loadError && (
            <p className="trainer-error" role="alert">
              {loadError}
            </p>
          )}
        </div>
        <div className="endgame-board-wrap">
          <BoardView
            key={puzzle.id}
            moves={moves}
            openingName={DRILL_LABELS[sessionDrill]}
            mode="practice"
            practiceSide={practiceSide}
            initialFen={puzzle.fen}
            hideStepButtons
            allowedMoves={
              gameResult == null && allowedMoves != null
                ? allowedMoves
                : gameResult == null && correctMoveSan != null
                  ? [correctMoveSan]
                  : undefined
            }
            wrongMoveMessage={
              isEndgameMode && correctMoveSan != null
                ? `Correct move is ${correctMoveSan}.`
                : !isEndgameMode
                  ? "Not the solution — try again."
                  : undefined
            }
            onValidMove={handleValidMove}
          />
        </div>
        {!history && (
          <p className="trainer-meta">
            Tip: run Autopsy first so the suite can bias drills toward your
            frequent loss types.
          </p>
        )}
      </div>
    </div>
  );
}
