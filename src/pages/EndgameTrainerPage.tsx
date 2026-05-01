import { useState, useCallback, useRef, useEffect } from "react";
import { Chess } from "chess.js";
import { BoardView } from "../components/BoardView";
import { StockfishClient } from "../lib/stockfishClient";
import { getPositionAfterMovesFromFen, uciToSan } from "../lib/chess";
import type { PracticeSide } from "../types";
import endgamePositions from "../data/endgame-positions.json";

const ENDGAME_DEPTH = 18;

type GameResult = "won" | "lost" | "draw" | null;

interface EndgameEntry {
  fen: string;
  label?: string;
}

const positions = endgamePositions as EndgameEntry[];

function pickRandomFen(): string {
  const idx = Math.floor(Math.random() * positions.length);
  return positions[idx]!.fen;
}

function isUserTurn(initialFen: string, movesLength: number): boolean {
  const userPlaysWhite = initialFen.includes(" w ");
  return userPlaysWhite ? movesLength % 2 === 0 : movesLength % 2 === 1;
}

function isEngineTurn(initialFen: string, movesLength: number): boolean {
  return movesLength > 0 && !isUserTurn(initialFen, movesLength);
}

export function EndgameTrainerPage() {
  const [initialFen, setInitialFen] = useState<string | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [correctMoveSan, setCorrectMoveSan] = useState<string | null>(null);
  const [engineThinking, setEngineThinking] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const stockfishRef = useRef<StockfishClient | null>(null);

  const currentFen =
    initialFen != null
      ? getPositionAfterMovesFromFen(initialFen, moves, moves.length).fen
      : null;
  const practiceSide: PracticeSide =
    initialFen != null && initialFen.includes(" w ")
      ? "white"
      : "black";
  const userTurn = initialFen != null && isUserTurn(initialFen, moves.length);

  // When it's user's turn and we have a position, run Stockfish to get best move for validation
  useEffect(() => {
    if (
      initialFen == null ||
      currentFen == null ||
      !userTurn ||
      gameResult != null
    ) {
      setCorrectMoveSan(null);
      return;
    }
    let cancelled = false;
    setCorrectMoveSan(null);
    setLoadError(null);
    const client = stockfishRef.current ?? (stockfishRef.current = new StockfishClient());
    (async () => {
      try {
        await client.init();
      } catch (e) {
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
        if (san) setCorrectMoveSan(san);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFen, currentFen, userTurn, gameResult]);

  // When it's engine's turn (after user moved), run Stockfish and append engine move
  useEffect(() => {
    if (
      initialFen == null ||
      moves.length === 0 ||
      !isEngineTurn(initialFen, moves.length) ||
      gameResult != null
    )
      return;

    const fenAfterUser = getPositionAfterMovesFromFen(
      initialFen,
      moves,
      moves.length
    ).fen;
    const chessAfterUser = new Chess(fenAfterUser);
    if (chessAfterUser.isCheckmate() || chessAfterUser.isStalemate() || chessAfterUser.isDraw()) {
      if (chessAfterUser.isCheckmate()) setGameResult("won");
      else if (chessAfterUser.isStalemate() || chessAfterUser.isDraw()) setGameResult("draw");
      return;
    }

    let cancelled = false;
    setEngineThinking(true);
    const client = stockfishRef.current ?? (stockfishRef.current = new StockfishClient());
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
      setMoves((prev) => [...prev, san]);

      // Check game over after engine move
      const fenAfterEngine = getPositionAfterMovesFromFen(
        initialFen,
        [...moves, san],
        moves.length + 1
      ).fen;
      const chess = new Chess(fenAfterEngine);
      if (chess.isCheckmate()) setGameResult("won");
      else if (chess.isStalemate() || chess.isDraw()) setGameResult("draw");
    })();
    return () => {
      cancelled = true;
      setEngineThinking(false);
    };
  }, [initialFen, moves, gameResult]);

  const handleValidMove = useCallback((san: string) => {
    setMoves((prev) => [...prev, san]);
    const newLen = moves.length + 1;
    const fenAfterUser = getPositionAfterMovesFromFen(initialFen!, [...moves, san], newLen).fen;
    const chess = new Chess(fenAfterUser);
    if (chess.isCheckmate()) {
      setGameResult("won");
    } else if (chess.isStalemate() || chess.isDraw()) {
      setGameResult("draw");
    }
  }, [initialFen, moves]);

  const handleNewEndgame = useCallback(() => {
    setInitialFen(pickRandomFen());
    setMoves([]);
    setGameResult(null);
    setCorrectMoveSan(null);
    setLoadError(null);
  }, []);

  if (initialFen == null) {
    return (
      <div className="trainer-page endgame-trainer-page">
        <div className="endgame-trainer-main">
          <h1 className="trainer-title">Endgame</h1>
          <p className="trainer-description">
            Practice winning endgames against Stockfish. You play the winning side; if you make a wrong move, the correct move is shown.
          </p>
          <button
            type="button"
            className="trainer-button trainer-button-primary"
            onClick={handleNewEndgame}
          >
            New endgame
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="trainer-page endgame-trainer-page">
      <div className="endgame-trainer-main">
        <h1 className="trainer-title">Endgame</h1>
        <div className="endgame-trainer-actions">
          <button
            type="button"
            className="trainer-button"
            onClick={handleNewEndgame}
          >
            New endgame
          </button>
          {gameResult != null && (
            <p className="endgame-result" role="status">
              {gameResult === "won" && "You won!"}
              {gameResult === "lost" && "You lost."}
              {gameResult === "draw" && "Draw."}
            </p>
          )}
          {engineThinking && (
            <p className="endgame-status" role="status">
              Stockfish is thinking…
            </p>
          )}
          {userTurn && gameResult == null && !engineThinking && (
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
            key={initialFen}
            moves={moves}
            openingName="Endgame"
            mode="practice"
            practiceSide={practiceSide}
            initialFen={initialFen}
            hideStepButtons
            allowedMoves={
              correctMoveSan != null && gameResult == null ? [correctMoveSan] : undefined
            }
            wrongMoveMessage={
              correctMoveSan != null
                ? `Correct move is ${correctMoveSan}.`
                : undefined
            }
            onValidMove={handleValidMove}
          />
        </div>
      </div>
    </div>
  );
}
