import { useEffect, useMemo, useRef, useState } from "react";
import { BoardView } from "../components/BoardView";
import { MoveControls } from "../components/MoveControls";
import { getPositionAfterMoves } from "../lib/chess";
import { parseGameInput } from "../lib/gameInput";
import { generateGameReport, type ReportPly, uciPvToSan } from "../lib/gameReport";
import { StockfishClient, type StockfishInfo, type StockfishPvLine } from "../lib/stockfishClient";

function formatScore(info: StockfishInfo | null): string {
  if (!info?.score) return "—";
  if (info.score.type === "mate") return `Mate ${info.score.value}`;
  const pawns = info.score.value / 100;
  const signed = pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
  return signed;
}

function plyLabel(ply: ReportPly): string {
  return `${ply.moveNumber}. ${ply.san}${ply.annotation ? ` ${ply.annotation}` : ""}`;
}

function annotationClass(annotation: ReportPly["annotation"]): string {
  switch (annotation) {
    case "??":
      return "annotation-blunder";
    case "?":
      return "annotation-mistake";
    case "?!":
      return "annotation-dubious";
    case "!?":
      return "annotation-interesting";
    case "!":
      return "annotation-good";
    case "!!":
      return "annotation-brilliant";
    default:
      return "";
  }
}

/** Build display rows when we have no report: move number, white SAN, black SAN */
function plainMoveRows(moves: string[]): Array<{ moveNumber: number; white?: string; black?: string }> {
  const rows: Array<{ moveNumber: number; white?: string; black?: string }> = [];
  for (let i = 0; i < moves.length; i++) {
    const moveNumber = Math.floor(i / 2) + 1;
    if (!rows[moveNumber - 1]) rows[moveNumber - 1] = { moveNumber };
    if (i % 2 === 0) rows[moveNumber - 1].white = moves[i];
    else rows[moveNumber - 1].black = moves[i];
  }
  return rows;
}

export function AnalysisPage() {
  const [gameText, setGameText] = useState(
    `[Event "Example"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *\n`
  );
  const parsed = useMemo(() => parseGameInput(gameText), [gameText]);
  const [moves, setMoves] = useState<string[]>(() => parsed.movesSan);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [depth, setDepth] = useState(14);

  const [reportDepth, setReportDepth] = useState(14);
  const [showVariations, setShowVariations] = useState(true);
  const [reportStatus, setReportStatus] = useState<string>("No report generated");
  const [report, setReport] = useState<ReportPly[] | null>(null);
  const [reportRunning, setReportRunning] = useState(false);
  const reportAbortRef = useRef<AbortController | null>(null);

  const clientRef = useRef<StockfishClient | null>(null);
  const analysisStopRef = useRef<(() => void) | null>(null);
  const [lastInfo, setLastInfo] = useState<StockfishInfo | null>(null);
  const [_bestMoveUci, setBestMoveUci] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<string>("Idle");
  const [topLines, setTopLines] = useState<StockfishPvLine[] | null>(null);

  const maxIndex = moves.length;
  const safeIndex = Math.min(currentIndex, maxIndex);

  const fen = useMemo(() => {
    return getPositionAfterMoves(moves, safeIndex).fen;
  }, [moves, safeIndex]);

  useEffect(() => {
    if (!analysisEnabled) return;
    if (reportRunning) return; // avoid engine contention
    if (!clientRef.current) clientRef.current = new StockfishClient();

    const client = clientRef.current;
    let cancelled = false;

    const run = async () => {
      analysisStopRef.current?.();
      analysisStopRef.current = null;

      setEngineStatus("Analyzing…");
      setLastInfo(null);
      setBestMoveUci(null);
      setTopLines(null);

      try {
        const analysis = await client.analyzePositionMultiPV(fen, { depth, multiPv: 5 });
        if (cancelled) {
          analysis.stop();
          return;
        }
        analysisStopRef.current = analysis.stop;
        const linesByPv = new Map<number, StockfishInfo>();
        const offInfo = analysis.onInfo((info) => {
          const pvIdx = info.multipv && Number.isFinite(info.multipv) ? info.multipv : 1;
          linesByPv.set(pvIdx, info);
          if (pvIdx === 1) setLastInfo(info);
          const sorted: StockfishPvLine[] = Array.from(linesByPv.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([multipv, i]) => ({
              multipv,
              depth: i.depth,
              seldepth: i.seldepth,
              nodes: i.nodes,
              nps: i.nps,
              timeMs: i.timeMs,
              score: i.score ?? undefined,
              pv: i.pv ?? [],
              raw: i.raw,
            }));
          setTopLines(sorted);
        });
        const { bestMove, lastLines } = await analysis.done;
        offInfo();
        if (cancelled) return;
        setTopLines(lastLines);
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
  }, [fen, depth, analysisEnabled, reportRunning]);

  useEffect(() => {
    return () => {
      analysisStopRef.current?.();
      analysisStopRef.current = null;
      reportAbortRef.current?.abort();
      reportAbortRef.current = null;
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, []);

  const annotatedMoves = useMemo(() => {
    if (!report?.length) return null;
    const rows: Array<{ moveNumber: number; white?: ReportPly; black?: ReportPly }> = [];
    for (const ply of report) {
      const idx = ply.moveNumber - 1;
      if (!rows[idx]) rows[idx] = { moveNumber: ply.moveNumber };
      if (ply.side === "w") rows[idx].white = ply;
      else rows[idx].black = ply;
    }
    return rows.filter(Boolean);
  }, [report]);

  const plainRows = useMemo(() => plainMoveRows(moves), [moves]);

  const topMovesDisplay = useMemo(() => {
    if (!topLines || !topLines.length) return [];
    return topLines
      .filter((l) => l.pv && l.pv.length && l.score)
      .map((l) => {
        let moveSan: string;
        try {
          const sanMoves = uciPvToSan(fen, [l.pv[0]]);
          moveSan = sanMoves[0] ?? l.pv[0];
        } catch {
          moveSan = l.pv[0];
        }
        return {
          multipv: l.multipv,
          moveSan,
          score: l.score ?? null,
        };
      });
  }, [topLines, fen]);

  return (
    <div className="app evaluate-app">
      <aside className="sidebar">
        <h2 className="menu-title">Analysis</h2>
        <p className="evaluate-description">
          Paste a PGN or SAN move list. Step through for live evaluation, or generate a full
          annotated report.
        </p>

        <label className="evaluate-label">
          <span>Game (PGN or SAN)</span>
          <textarea
            className="evaluate-textarea"
            value={gameText}
            onChange={(e) => {
              const nextText = e.target.value;
              setGameText(nextText);
              const nextParsed = parseGameInput(nextText);
              setMoves(nextParsed.movesSan);
              setIsPlaying(false);
              setLastInfo(null);
              setBestMoveUci(null);
              setEngineStatus("Idle");
              setReport(null);
              setReportStatus("No report generated");
              const nextMovesLen = nextParsed.movesSan.length;
              setCurrentIndex((idx) => Math.min(idx, nextMovesLen));
            }}
            rows={12}
            spellCheck={false}
          />
        </label>

        <div className="evaluate-meta">
          <div>
            <strong>{moves.length}</strong> move token{moves.length === 1 ? "" : "s"} ({parsed.kind}
            )
          </div>
          {parsed.metadata && (
            <div className="evaluate-meta-muted">
              {parsed.metadata.White ? `${parsed.metadata.White} vs ${parsed.metadata.Black}` : null}
              {parsed.metadata.Result ? ` • ${parsed.metadata.Result}` : null}
            </div>
          )}
          {parsed.warnings.length > 0 && (
            <div className="evaluate-meta-muted">{parsed.warnings.join(" ")}</div>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="evaluate-main-wrap">
          <BoardView
            moves={moves}
            openingName="Analysis"
            mode="analysis"
            showMoveList={false}
            controlled={{
              currentIndex: safeIndex,
              onIndexChange: setCurrentIndex,
              isPlaying,
              onPlayPause: () => setIsPlaying((p) => !p),
            }}
            onAnalysisMove={(san) => {
              setIsPlaying(false);
              setLastInfo(null);
              setBestMoveUci(null);
              setEngineStatus("Idle");
              setReport(null);
              setReportStatus("No report generated");
              const idx = Math.min(safeIndex, moves.length);
              const nextMoves = [...moves.slice(0, idx), san];
              setMoves(nextMoves);
              setCurrentIndex(nextMoves.length);
            }}
          />
        </div>
      </main>

      <aside className="right-sidebar">
        <div className="analysis-moves-box">
          <div className="analysis-moves-box-title">
            Moves {annotatedMoves ? "(annotated)" : ""} — {safeIndex}/{maxIndex}
          </div>
          {annotatedMoves?.length ? (
            annotatedMoves.map((r) => (
              <div key={r.moveNumber} className="analysis-moves-row">
                <span className="analysis-moves-num">{r.moveNumber}.</span>
                <button
                  type="button"
                  className={`analysis-move-btn ${r.white ? annotationClass(r.white.annotation) : ""}`}
                  onClick={() => r.white && setCurrentIndex(r.white.ply)}
                  disabled={!r.white}
                  title={r.white?.notes?.join("\n")}
                >
                  {r.white ? plyLabel(r.white) : "—"}
                </button>
                <button
                  type="button"
                  className={`analysis-move-btn ${r.black ? annotationClass(r.black.annotation) : ""}`}
                  onClick={() => r.black && setCurrentIndex(r.black.ply)}
                  disabled={!r.black}
                  title={r.black?.notes?.join("\n")}
                >
                  {r.black ? plyLabel(r.black) : "—"}
                </button>
              </div>
            ))
          ) : plainRows.length > 0 ? (
            plainRows.map((r) => (
              <div key={r.moveNumber} className="analysis-moves-row">
                <span className="analysis-moves-num">{r.moveNumber}.</span>
                <button
                  type="button"
                  className="analysis-move-btn"
                  onClick={() => r.white != null && setCurrentIndex((r.moveNumber - 1) * 2 + 1)}
                  disabled={!r.white}
                >
                  {r.white ?? "—"}
                </button>
                <button
                  type="button"
                  className="analysis-move-btn"
                  onClick={() => r.black != null && setCurrentIndex((r.moveNumber - 1) * 2 + 2)}
                  disabled={!r.black}
                >
                  {r.black ?? "—"}
                </button>
              </div>
            ))
          ) : (
            <div className="evaluate-meta-muted" style={{ padding: "0.5rem 0" }}>
              Paste a game above. Generate a report for annotations.
            </div>
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
          <span className="mode-label">Live evaluation</span>

          <label className="evaluate-toggle">
            <input
              type="checkbox"
              checked={analysisEnabled}
              disabled={reportRunning}
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
              disabled={reportRunning}
            />
          </label>

          <div className="evaluate-panel" role="status" aria-live="polite">
            <div className="evaluate-row">
              <span className="evaluate-k">Status</span>
              <span className="evaluate-v">{reportRunning ? "Busy (report)" : engineStatus}</span>
            </div>
            <div className="evaluate-row">
              <span className="evaluate-k">Depth</span>
              <span className="evaluate-v">{lastInfo?.depth ?? "—"}</span>
            </div>
            <div className="evaluate-row">
              <span className="evaluate-k">Evaluation</span>
              <span className="evaluate-v">
                {topMovesDisplay.length
                  ? formatScore({ score: topMovesDisplay[0].score } as StockfishInfo)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="evaluate-top-moves">
            <div className="evaluate-top-moves-title">Top moves</div>
            {topMovesDisplay.length ? (
              <ol className="evaluate-top-moves-list">
                {topMovesDisplay.map((m) => (
                  <li key={m.multipv} className="evaluate-top-moves-item">
                    <span className="evaluate-top-move-san">{m.moveSan}</span>
                    <span className="evaluate-top-move-score">
                      {formatScore({ score: m.score } as StockfishInfo)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="evaluate-meta-muted">Engine moves will appear here.</div>
            )}
          </div>
        </div>

        <div className="mode-controls">
          <span className="mode-label">Game report</span>

          <label className="evaluate-label evaluate-depth">
            <span>Depth</span>
            <input
              type="number"
              min={1}
              max={30}
              value={reportDepth}
              onChange={(e) => setReportDepth(Number(e.target.value) || 1)}
              disabled={reportRunning}
            />
          </label>

          <label className="evaluate-toggle">
            <input
              type="checkbox"
              checked={showVariations}
              onChange={(e) => setShowVariations(e.target.checked)}
              disabled={reportRunning}
            />
            <span>Show variations for mistakes</span>
          </label>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn"
              onClick={async () => {
                if (!moves.length) return;
                if (!clientRef.current) clientRef.current = new StockfishClient();
                reportAbortRef.current?.abort();
                const ac = new AbortController();
                reportAbortRef.current = ac;

                setReportRunning(true);
                setReport([]);
                setReportStatus("Generating report…");
                try {
                  const items = await generateGameReport(clientRef.current, moves, {
                    depth: reportDepth,
                    showVariationsForMistakes: showVariations,
                    signal: ac.signal,
                    onProgress: (done, total, last) => {
                      setReportStatus(`Generating report… (${done}/${total})`);
                      if (last) {
                        setReport((prev) => {
                          const base = prev ?? [];
                          // replace by ply index if already present
                          const next = base.slice();
                          next[last.ply - 1] = last;
                          return next;
                        });
                      }
                    },
                  });
                  setReport(items);
                  setReportStatus(`Report complete (${items.length} plies)`);
                } catch (e) {
                  setReportStatus(
                    e instanceof Error ? `Report error: ${e.message}` : "Report error"
                  );
                } finally {
                  setReportRunning(false);
                }
              }}
              disabled={reportRunning || moves.length === 0}
            >
              Generate report
            </button>

            <button
              className="btn"
              onClick={() => reportAbortRef.current?.abort()}
              disabled={!reportRunning}
            >
              Stop
            </button>
          </div>

          <div className="evaluate-meta-muted" role="status" aria-live="polite">
            {reportStatus}
          </div>
        </div>
      </aside>
    </div>
  );
}

