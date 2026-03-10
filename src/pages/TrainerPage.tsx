import { useState, useEffect, useCallback, useRef } from "react";
import { getChessComUsername, setChessComUsername } from "../lib/userSettings";
import { fetchLatestGames, ChessComError } from "../lib/chessComClient";
import {
  analyzeGamesForLossCauses,
  lossCauseLabel,
} from "../lib/trainerAnalysis";
import { StockfishClient } from "../lib/stockfishClient";
import type { TrainerGame } from "../lib/trainerTypes";
import type { PerGameAnalysis, TrainerAnalysisResult } from "../lib/trainerTypes";

type Status = "idle" | "fetchingGames" | "analyzing" | "done" | "error";

function formatTimeControl(raw: string): string {
  if (!raw) return "—";
  const parts = raw.split("+");
  const base = Number.parseInt(parts[0] ?? "", 10);
  const inc = Number.parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(base)) return raw;
  const minutes = Math.round(base / 60);
  const incSeconds = Number.isNaN(inc) ? 0 : inc;
  return `${minutes}+${incSeconds}`;
}

export function TrainerPage() {
  const [usernameInput, setUsernameInput] = useState("");
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [result, setResult] = useState<TrainerAnalysisResult | null>(null);
  const stockfishRef = useRef<StockfishClient | null>(null);

  const runPipeline = useCallback(async (username: string) => {
    setStatus("fetchingGames");
    setErrorMessage(null);
    try {
      const games: TrainerGame[] = await fetchLatestGames(username, 20);
      if (games.length === 0) {
        setStatus("done");
        setResult({
          games: [],
          summary: {
            totalGames: 0,
            losses: 0,
            causeCounts: {
              blundered_tactics: 0,
              poor_endgame: 0,
              low_time: 0,
              early_resignation: 0,
              hanging_pieces: 0,
              other: 0,
            },
            topCauses: [],
          },
        });
        setLastUpdated(new Date());
        return;
      }
      setStatus("analyzing");
      const client = stockfishRef.current ?? (stockfishRef.current = new StockfishClient());
      let runEngineEval: ((fen: string, depth?: number) => Promise<number>) | undefined;
      try {
        await client.init();
        runEngineEval = (fen: string, depth?: number) => client.getPositionEval(fen, depth ?? 12);
      } catch {
        runEngineEval = undefined;
      }
      const analysisResult = await analyzeGamesForLossCauses(games, { runEngineEval });
      setResult(analysisResult);
      setStatus("done");
      setLastUpdated(new Date());
    } catch (e) {
      setStatus("error");
      if (e instanceof ChessComError) {
        setErrorMessage(e.message);
      } else {
        setErrorMessage("Something went wrong. Try again.");
      }
      setResult(null);
    }
  }, []);

  useEffect(() => {
    const username = getChessComUsername();
    if (username) {
      setSavedUsername(username);
      runPipeline(username);
    }
  }, [runPipeline]);

  const handleSaveUsername = () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) return;
    setChessComUsername(trimmed);
    setSavedUsername(trimmed);
    setUsernameInput("");
    runPipeline(trimmed);
  };

  const handleRefresh = () => {
    const username = getChessComUsername();
    if (!username) {
      setErrorMessage("Save a username first.");
      setStatus("error");
      return;
    }
    runPipeline(username);
  };

  return (
    <div className="trainer-page">
      <div className="trainer-card">
        <h1 className="trainer-title">Trainer</h1>

        <section className="trainer-section">
          <h2 className="trainer-section-title">Chess.com username</h2>
          <p className="trainer-description">
            Enter your chess.com username. It is stored locally on this device.
          </p>
          <div className="trainer-username-row">
            <input
              type="text"
              className="trainer-input"
              placeholder="Username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveUsername()}
              aria-label="Chess.com username"
            />
            <button
              type="button"
              className="trainer-button trainer-button-primary"
              onClick={handleSaveUsername}
              disabled={!usernameInput.trim()}
            >
              Save
            </button>
          </div>
          {savedUsername && (
            <p className="trainer-saved">
              Saved username: <strong>{savedUsername}</strong>
            </p>
          )}
        </section>

        <section className="trainer-section">
          <div className="trainer-actions">
            <button
              type="button"
              className="trainer-button"
              onClick={handleRefresh}
              disabled={
                !savedUsername ||
                status === "fetchingGames" ||
                status === "analyzing"
              }
            >
              Refresh games
            </button>
            {lastUpdated && (
              <span className="trainer-meta">
                Last updated: {lastUpdated.toLocaleString()}
              </span>
            )}
          </div>
          <div className="trainer-status" role="status">
            {status === "fetchingGames" && "Fetching latest games…"}
            {status === "analyzing" && "Analyzing games…"}
            {status === "error" && errorMessage && (
              <p className="trainer-error">{errorMessage}</p>
            )}
          </div>
        </section>

        {result && status === "done" && (
          <>
            <section className="trainer-section">
              <h2 className="trainer-section-title">Loss causes (last 20 games)</h2>
              {result.summary.topCauses.length === 0 ? (
                <p className="trainer-description">
                  No losses in the analyzed games, or no games analyzed.
                </p>
              ) : (
                <ul className="trainer-summary-list">
                  {result.summary.topCauses.map(({ cause, count }) => (
                    <li key={cause} className="trainer-summary-item">
                      <span className="trainer-cause-label">
                        {lossCauseLabel(cause)}
                      </span>
                      <span className="trainer-cause-count">{count} games</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="trainer-meta">
                {result.summary.losses} loss
                {result.summary.losses !== 1 ? "es" : ""} out of{" "}
                {result.summary.totalGames} games
              </p>
            </section>

            <section className="trainer-section">
              <h2 className="trainer-section-title">Games</h2>
              <div className="trainer-games-wrap">
                <table className="trainer-games-table">
                  <thead>
                    <tr>
                      <th>Opponent</th>
                      <th>Color</th>
                      <th>Time</th>
                      <th>Date</th>
                      <th>Loss cause</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.games
                      .filter((row) => row.isUserLoss)
                      .map((row: PerGameAnalysis, idx: number) => (
                        <GameRow key={idx} row={row} username={savedUsername ?? ""} />
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function GameRow({
  row,
  username,
}: {
  row: PerGameAnalysis;
  username: string;
}) {
  const { game, isUserLoss, primaryCause, detail } = row;
  const opponent =
    game.white.toLowerCase() === username.toLowerCase()
      ? game.black
      : game.white;
  const color = game.isUserWhite ? "White" : "Black";
  const date = game.endTime
    ? new Date(game.endTime * 1000).toLocaleDateString()
    : "—";
  return (
    <tr>
      <td>{opponent}</td>
      <td>{color}</td>
      <td>{formatTimeControl(game.timeControl)}</td>
      <td>{date}</td>
      <td>
        {isUserLoss && primaryCause ? (
          <span title={detail ?? undefined} className="trainer-cause-badge">
            {lossCauseLabel(primaryCause)}
          </span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
