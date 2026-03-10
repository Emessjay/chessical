import { useEffect, useMemo, useRef, useState } from "react";
import { BoardView } from "../components/BoardView";
import { MoveControls } from "../components/MoveControls";
import { formatMoveList } from "../components/boardViewShared";
import { getPositionAfterMoves } from "../lib/chess";
import { StockfishClient, type StockfishInfo } from "../lib/stockfishClient";

function parseSanMoves(raw: string): string[] {
  const cleaned = raw
    .replace(/\{[^}]*\}/g, " ") // strip {...} comments
    .replace(/\([^)]*\)/g, " ") // strip (...) variations (simple)
    .replace(/\d+\.(\.\.)?/g, " ") // strip move numbers like "1." / "1..."
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];
  return cleaned
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => !["1-0", "0-1", "1/2-1/2", "*"].includes(t));
}

function formatScore(info: StockfishInfo | null): string {
  if (!info?.score) return "—";
  if (info.score.type === "mate") return `Mate ${info.score.value}`;
  const pawns = info.score.value / 100;
  const signed = pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
  return signed;
}

export function EvaluatePage() {
  const [movesText, setMovesText] = useState(
    "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"
  );
  const moves = useMemo(() => parseSanMoves(movesText), [movesText]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [depth, setDepth] = useState(14);

  const clientRef = useRef<StockfishClient | null>(null);
  const analysisStopRef = useRef<(() => void) | null>(null);
  const [lastInfo, setLastInfo] = useState<StockfishInfo | null>(null);
  const [bestMoveUci, setBestMoveUci] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<string>("Idle");

  const maxIndex = moves.length;
  const safeIndex = Math.min(currentIndex, maxIndex);

  const fen = useMemo(() => {
    return getPositionAfterMoves(moves, safeIndex).fen;
  }, [moves, safeIndex]);

  useEffect(() => {
    if (!analysisEnabled) return;
    if (!clientRef.current) clientRef.current = new StockfishClient();

    const client = clientRef.current;
    let cancelled = false;

    const run = async () => {
      analysisStopRef.current?.();
      analysisStopRef.current = null;

      setEngineStatus("Analyzing…");
      setLastInfo(null);
      setBestMoveUci(null);

      try {
        const analysis = await client.analyzePosition(fen, { depth });
        if (cancelled) {
          analysis.stop();
          return;
        }
        analysisStopRef.current = analysis.stop;
        const offInfo = analysis.onInfo((info) => {
          setLastInfo(info);
        });
        const { bestMove } = await analysis.done;
        offInfo();
        if (cancelled) return;
        setBestMoveUci(bestMove?.bestmove ?? null);
        setEngineStatus("Idle");
      } catch (e) {
        if (cancelled) return;
        setEngineStatus(
          e instanceof Error ? `Engine error: ${e.message}` : "Engine error"
        );
      }
    };

    run();
    return () => {
      cancelled = true;
      analysisStopRef.current?.();
      analysisStopRef.current = null;
    };
  }, [fen, depth, analysisEnabled]);

  useEffect(() => {
    return () => {
      analysisStopRef.current?.();
      analysisStopRef.current = null;
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, []);

  const moveListFormatted = useMemo(() => formatMoveList(moves), [moves]);

  return (
    <div className="app evaluate-app">
      <aside className="sidebar">
        <h2 className="menu-title">Evaluate</h2>
        <p className="evaluate-description">
          Paste SAN moves (spaces/newlines are fine). Step through the game and Stockfish will
          evaluate the current position.
        </p>
        <label className="evaluate-label">
          <span>Moves</span>
          <textarea
            className="evaluate-textarea"
            value={movesText}
            onChange={(e) => {
              const nextText = e.target.value;
              setMovesText(nextText);
              setIsPlaying(false);
              setLastInfo(null);
              setBestMoveUci(null);
              setEngineStatus("Idle");
              const nextMovesLen = parseSanMoves(nextText).length;
              setCurrentIndex((idx) => Math.min(idx, nextMovesLen));
            }}
            rows={10}
            spellCheck={false}
          />
        </label>
        <div className="evaluate-meta">
          <div>
            <strong>{moves.length}</strong> move token{moves.length === 1 ? "" : "s"}
          </div>
          <div className="evaluate-meta-muted">FEN updates as you step.</div>
        </div>
      </aside>

      <main className="main">
        <div className="evaluate-main-wrap">
          <BoardView
            moves={moves}
            openingName="Evaluation"
            mode="view"
            showMoveList={false}
            controlled={{
              currentIndex: safeIndex,
              onIndexChange: setCurrentIndex,
              isPlaying,
              onPlayPause: () => setIsPlaying((p) => !p),
            }}
          />
        </div>
      </main>

      <aside className="right-sidebar">
        <div className="move-list" aria-live="polite">
          <span className="move-list-label">Moves: </span>
          <span className="move-list-text">{moveListFormatted || "—"}</span>
          {moveListFormatted && (
            <span className="move-list-progress">
              {" "}
                  ({safeIndex} / {maxIndex})
            </span>
          )}
        </div>

        <MoveControls
          currentIndex={safeIndex}
          maxIndex={maxIndex}
          onPrevious={() => {
            setCurrentIndex((i) => Math.max(0, Math.min(i, maxIndex) - 1));
            setIsPlaying(false);
          }}
          onNext={() => setCurrentIndex((i) => Math.min(maxIndex, Math.min(i, maxIndex) + 1))}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying((p) => !p)}
        />

        <div className="mode-controls">
          <span className="mode-label">Evaluation</span>

          <label className="evaluate-toggle">
            <input
              type="checkbox"
              checked={analysisEnabled}
              onChange={(e) => setAnalysisEnabled(e.target.checked)}
            />
            <span>Analyze current position</span>
          </label>

          <label className="evaluate-label evaluate-depth">
            <span>Depth</span>
            <input
              type="number"
              min={1}
              max={30}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value) || 1)}
            />
          </label>

          <div className="evaluate-panel" role="status" aria-live="polite">
            <div className="evaluate-row">
              <span className="evaluate-k">Status</span>
              <span className="evaluate-v">{engineStatus}</span>
            </div>
            <div className="evaluate-row">
              <span className="evaluate-k">Depth</span>
              <span className="evaluate-v">{lastInfo?.depth ?? "—"}</span>
            </div>
            <div className="evaluate-row">
              <span className="evaluate-k">Score</span>
              <span className="evaluate-v">{formatScore(lastInfo)}</span>
            </div>
            <div className="evaluate-row">
              <span className="evaluate-k">Best</span>
              <span className="evaluate-v">{bestMoveUci ?? "—"}</span>
            </div>
            <div className="evaluate-row evaluate-row-pv">
              <span className="evaluate-k">PV</span>
              <span className="evaluate-v">
                {lastInfo?.pv?.length ? lastInfo.pv.join(" ") : "—"}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

