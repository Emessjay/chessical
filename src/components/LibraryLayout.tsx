import { useState, useMemo, useEffect, useCallback } from "react";
import openingsData from "../data/openings.json";
import type { Opening } from "../types";
import { OpeningsMenu } from "./OpeningsMenu";
import { LineSelector } from "./LineSelector";
import { MoveControls } from "./MoveControls";
import {
  BoardView,
  formatMoveList,
  type ViewMode,
  type PracticeSide,
} from "./BoardView";

const RECENT_OPENINGS_KEY = "chessical_recent_openings";
const RECENT_OPENINGS_MAX = 10;
const RECENT_OPENINGS_DISPLAY = 3;

const openings = openingsData as Opening[];

function getMovesAndName(opening: Opening, selectedLineId: string | null): { moves: string[]; name: string } {
  if (opening.lines?.length) {
    const line = opening.lines.find((l) => l.id === selectedLineId) ?? opening.lines[0];
    return { moves: line.moves, name: `${opening.name}: ${line.name}` };
  }
  return { moves: opening.moves ?? [], name: opening.name };
}

function loadRecentOpeningIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_OPENINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_OPENINGS_MAX) : [];
  } catch {
    return [];
  }
}

export function LibraryLayout() {
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [recentOpeningIds, setRecentOpeningIds] = useState<string[]>(loadRecentOpeningIds);
  const [mode, setMode] = useState<ViewMode>("view");
  const [practiceSide, setPracticeSide] = useState<PracticeSide>("white");
  const [showMoveList, setShowMoveList] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const { moves: currentMoves, name: displayName } = useMemo(
    () => (selectedOpening ? getMovesAndName(selectedOpening, selectedLineId) : { moves: [], name: "" }),
    [selectedOpening, selectedLineId]
  );

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [selectedOpening?.id, selectedLineId]);

  useEffect(() => {
    if (currentIndex >= currentMoves.length) setIsPlaying(false);
  }, [currentIndex, currentMoves.length]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_OPENINGS_KEY, JSON.stringify(recentOpeningIds));
    } catch {
      /* ignore */
    }
  }, [recentOpeningIds]);

  const handleSelectOpening = (opening: Opening) => {
    setSelectedOpening(opening);
    setSelectedLineId(opening.lines?.length ? opening.lines[0].id : null);
    setRecentOpeningIds((prev) => {
      const next = [opening.id, ...prev.filter((id) => id !== opening.id)].slice(0, RECENT_OPENINGS_MAX);
      return next;
    });
  };

  const recentOpenings = useMemo(() => {
    const byId = new Map(openings.map((o) => [o.id, o]));
    return recentOpeningIds
      .map((id) => byId.get(id))
      .filter((o): o is Opening => o != null)
      .slice(0, RECENT_OPENINGS_DISPLAY);
  }, [recentOpeningIds]);

  const [searchQuery, setSearchQuery] = useState("");

  const visibleOpenings = useMemo(() => {
    const sorted = [...openings].sort((a, b) => {
      const ecoA = a.eco ?? "\uFFFF";
      const ecoB = b.eco ?? "\uFFFF";
      const cmp = ecoA.localeCompare(ecoB);
      return cmp !== 0 ? cmp : (a.name ?? "").localeCompare(b.name ?? "");
    });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (o) =>
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.eco ?? "").toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const maxIndex = currentMoves.length;
  const onPrevious = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
    setIsPlaying(false);
  }, []);
  const onNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(maxIndex, i + 1));
  }, [maxIndex]);
  const onPlayPause = useCallback(() => setIsPlaying((p) => !p), []);
  const showPlayButton = mode === "view";
  const moveListFormatted = formatMoveList(currentMoves);

  return (
    <div className="app">
      <aside className="sidebar">
        <OpeningsMenu
          openings={visibleOpenings}
          recentOpenings={recentOpenings}
          selectedId={selectedOpening?.id ?? null}
          onSelect={handleSelectOpening}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </aside>
      <main className="main">
        {selectedOpening ? (
          <>
            {selectedOpening.lines?.length && selectedLineId && (
              <LineSelector
                lines={selectedOpening.lines}
                selectedLineId={selectedLineId}
                onSelect={setSelectedLineId}
              />
            )}
            <BoardView
              moves={currentMoves}
              openingName={displayName}
              mode={mode}
              practiceSide={practiceSide}
              showMoveList={showMoveList}
              controlled={{
                currentIndex,
                onIndexChange: setCurrentIndex,
                isPlaying,
                onPlayPause,
              }}
            />
          </>
        ) : (
          <div className="placeholder">
            <p>Select an opening from the menu to view and step through its moves.</p>
          </div>
        )}
      </main>
      {selectedOpening && (
        <aside className="right-sidebar">
          {showMoveList && (
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
          <MoveControls
            currentIndex={currentIndex}
            maxIndex={maxIndex}
            onPrevious={onPrevious}
            onNext={onNext}
            isPlaying={isPlaying}
            onPlayPause={showPlayButton ? onPlayPause : undefined}
          />
          <div className="mode-controls">
            <span className="mode-label">Mode</span>
            <div className="mode-buttons" role="group" aria-label="View or practice">
              <button
                type="button"
                className={mode === "view" ? "active" : ""}
                onClick={() => setMode("view")}
              >
                View
              </button>
              <button
                type="button"
                className={mode === "practice" && practiceSide === "white" ? "active" : ""}
                onClick={() => {
                  setMode("practice");
                  setPracticeSide("white");
                }}
              >
                Play as White
              </button>
              <button
                type="button"
                className={mode === "practice" && practiceSide === "black" ? "active" : ""}
                onClick={() => {
                  setMode("practice");
                  setPracticeSide("black");
                }}
              >
                Play as Black
              </button>
            </div>
            <label className="show-move-list">
              <input
                type="checkbox"
                checked={showMoveList}
                onChange={(e) => setShowMoveList(e.target.checked)}
              />
              <span>Show move sequence</span>
            </label>
          </div>
        </aside>
      )}
    </div>
  );
}
