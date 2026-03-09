import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
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

type OpeningsTab = "library" | "learn" | "practice";

interface LibraryItem extends Opening {
  parentId?: string;
}

function sortByEcoThenName<A extends { eco?: string; name: string }>(a: A, b: A): number {
  const ecoA = a.eco ?? "\uFFFF";
  const ecoB = b.eco ?? "\uFFFF";
  const cmp = ecoA.localeCompare(ecoB);
  return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
}

function buildLibraryItems(source: Opening[]): LibraryItem[] {
  const items: LibraryItem[] = [];

  for (const opening of source) {
    if (opening.lines?.length) {
      for (const line of opening.lines) {
        items.push({
          id: `${opening.id}:${line.id}`,
          name: `${opening.name}: ${line.name}`,
          eco: line.eco ?? opening.eco,
          moves: line.moves,
        });
      }
    } else {
      items.push({
        id: opening.id,
        name: opening.name,
        eco: opening.eco,
        moves: opening.moves ?? [],
      });
    }
  }

  return items;
}

const libraryItems: LibraryItem[] = buildLibraryItems(openings);
const libraryItemsById = new Map(libraryItems.map((o) => [o.id, o]));

function getMovesAndName(opening: Opening, selectedLineId: string | null): {
  moves: string[];
  name: string;
} {
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

function getActiveTabFromPathname(pathname: string): OpeningsTab {
  if (pathname.endsWith("/learn")) return "learn";
  if (pathname.endsWith("/practice")) return "practice";
  return "library";
}

export function LibraryLayout() {
  const { pathname } = useLocation();
  const activeTab = getActiveTabFromPathname(pathname);

  // Shared search across tabs that use the openings menu
  const [searchQuery, setSearchQuery] = useState("");

  // Library tab state
  const [librarySelectedOpening, setLibrarySelectedOpening] = useState<LibraryItem | null>(null);
  const [recentOpeningIds, setRecentOpeningIds] = useState<string[]>(loadRecentOpeningIds);
  const [mode, setMode] = useState<ViewMode>("view");
  const [libraryPracticeSide, setLibraryPracticeSide] = useState<PracticeSide>("white");
  const [showMoveList, setShowMoveList] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const libraryMoves = useMemo(
    () => (librarySelectedOpening ? librarySelectedOpening.moves ?? [] : []),
    [librarySelectedOpening]
  );
  const libraryDisplayName = librarySelectedOpening?.name ?? "";

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [librarySelectedOpening?.id]);

  useEffect(() => {
    if (currentIndex >= libraryMoves.length) setIsPlaying(false);
  }, [currentIndex, libraryMoves.length]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_OPENINGS_KEY, JSON.stringify(recentOpeningIds));
    } catch {
      /* ignore */
    }
  }, [recentOpeningIds]);

  const recentOpenings = useMemo(() => {
    return recentOpeningIds
      .map((id) => libraryItemsById.get(id))
      .filter((o): o is LibraryItem => o != null)
      .slice(0, RECENT_OPENINGS_DISPLAY);
  }, [recentOpeningIds]);

  const visibleLibraryOpenings = useMemo(() => {
    const sorted = [...libraryItems].sort(sortByEcoThenName);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (o) =>
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.eco ?? "").toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const maxIndex = libraryMoves.length;
  const onPrevious = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
    setIsPlaying(false);
  }, []);
  const onNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(maxIndex, i + 1));
  }, [maxIndex]);
  const onPlayPause = useCallback(() => setIsPlaying((p) => !p), []);
  const showPlayButton = mode === "view";
  const moveListFormatted = formatMoveList(libraryMoves);

  // Learn tab state
  const [learnSelectedOpening, setLearnSelectedOpening] = useState<Opening | null>(null);
  const [learnSelectedLineId, setLearnSelectedLineId] = useState<string | null>(null);
  const learnPracticeSide: PracticeSide = "white";

  const { moves: learnMoves, name: learnDisplayName } = useMemo(
    () =>
      learnSelectedOpening
        ? getMovesAndName(learnSelectedOpening, learnSelectedLineId)
        : { moves: [], name: "" },
    [learnSelectedOpening, learnSelectedLineId]
  );

  const learnVisibleOpenings = useMemo(() => {
    const sorted = [...openings].sort((a, b) =>
      sortByEcoThenName(
        { eco: a.eco, name: a.name },
        { eco: b.eco, name: b.name }
      )
    );
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (o) =>
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.eco ?? "").toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Practice tab state
  const [practiceOpening, setPracticeOpening] = useState<LibraryItem | null>(null);
  const [practiceSide, setPracticeSide] = useState<PracticeSide>("white");

  const startRandomPracticeGame = useCallback(() => {
    if (libraryItems.length === 0) return;
    const randomIndex = Math.floor(Math.random() * libraryItems.length);
    const randomOpening = libraryItems[randomIndex];
    const randomSide: PracticeSide = Math.random() < 0.5 ? "white" : "black";
    setPracticeOpening(randomOpening);
    setPracticeSide(randomSide);
  }, []);

  useEffect(() => {
    if (activeTab === "practice" && practiceOpening == null && libraryItems.length > 0) {
      startRandomPracticeGame();
    }
  }, [activeTab, practiceOpening, startRandomPracticeGame]);

  // Menu behaviour changes per tab
  const handleSelectFromMenu = useCallback(
    (opening: Opening) => {
      if (activeTab === "library") {
        const libItem = libraryItemsById.get(opening.id) ?? (opening as LibraryItem);
        setLibrarySelectedOpening(libItem);
        setRecentOpeningIds((prev) => {
          const next = [libItem.id, ...prev.filter((id) => id !== libItem.id)].slice(
            0,
            RECENT_OPENINGS_MAX
          );
          return next;
        });
        return;
      }

      if (activeTab === "learn") {
        setLearnSelectedOpening(opening);
        setLearnSelectedLineId(opening.lines?.length ? opening.lines[0].id : null);
      }
    },
    [activeTab]
  );

  const menuOpenings = activeTab === "library" ? visibleLibraryOpenings : learnVisibleOpenings;
  const menuSelectedId =
    activeTab === "library"
      ? librarySelectedOpening?.id ?? null
      : learnSelectedOpening?.id ?? null;
  const menuRecentOpenings = activeTab === "library" ? recentOpenings : [];

  return (
    <div className="app">
      <aside className="sidebar">
        {activeTab === "practice" ? (
          <div className="practice-sidebar">
            <h2 className="menu-title">Practice</h2>
            <p className="practice-description">
              Play a full opening with a random side. If you make a wrong move, you&apos;ll be
              prompted to try the correct move.
            </p>
            <button type="button" onClick={startRandomPracticeGame}>
              New game
            </button>
            {practiceOpening && (
              <div className="practice-opening-meta">
                <div className="practice-opening-name">{practiceOpening.name}</div>
                {practiceOpening.eco && (
                  <div className="practice-opening-eco">ECO {practiceOpening.eco}</div>
                )}
                <div className="practice-opening-side">
                  You are playing as{" "}
                  <strong>{practiceSide === "white" ? "White" : "Black"}</strong>.
                </div>
              </div>
            )}
          </div>
        ) : (
          <OpeningsMenu
            openings={menuOpenings}
            recentOpenings={menuRecentOpenings}
            selectedId={menuSelectedId}
            onSelect={handleSelectFromMenu}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        )}
      </aside>
      <main className="main">
        {activeTab === "library" && (
          <>
            {librarySelectedOpening ? (
              <BoardView
                moves={libraryMoves}
                openingName={libraryDisplayName}
                mode={mode}
                practiceSide={libraryPracticeSide}
                showMoveList={false}
                controlled={{
                  currentIndex,
                  onIndexChange: setCurrentIndex,
                  isPlaying,
                  onPlayPause,
                }}
              />
            ) : (
              <div className="placeholder">
                <p>
                  Select an opening or line from the menu to view and step through its moves.
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === "learn" && (
          <>
            {learnSelectedOpening ? (
              <>
                {learnSelectedOpening.lines?.length && learnSelectedLineId && (
                  <LineSelector
                    lines={learnSelectedOpening.lines}
                    selectedLineId={learnSelectedLineId}
                    onSelect={setLearnSelectedLineId}
                  />
                )}
                <BoardView
                  moves={learnMoves}
                  openingName={learnDisplayName}
                  mode="practice"
                  practiceSide={learnPracticeSide}
                  showMoveList
                />
              </>
            ) : (
              <div className="placeholder">
                <p>
                  Select an opening from the menu to learn and practice its mainline branches.
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === "practice" && (
          <>
            {practiceOpening ? (
              <BoardView
                moves={practiceOpening.moves ?? []}
                openingName={practiceOpening.name}
                mode="practice"
                practiceSide={practiceSide}
              />
            ) : (
              <div className="placeholder">
                <p>Click &ldquo;New game&rdquo; to start practicing a random opening.</p>
              </div>
            )}
          </>
        )}
      </main>

      {activeTab === "library" && librarySelectedOpening && (
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
                className={
                  mode === "practice" && libraryPracticeSide === "white" ? "active" : ""
                }
                onClick={() => {
                  setMode("practice");
                  setLibraryPracticeSide("white");
                }}
              >
                Play as White
              </button>
              <button
                type="button"
                className={
                  mode === "practice" && libraryPracticeSide === "black" ? "active" : ""
                }
                onClick={() => {
                  setMode("practice");
                  setLibraryPracticeSide("black");
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

      {activeTab === "learn" && learnSelectedOpening && (
        <aside className="right-sidebar">
          <div className="mode-controls">
            <span className="mode-label">Learn</span>
            <p className="learn-description">
              Play through the recommended moves for this opening. If you make an inaccurate move,
              you&apos;ll see what the mainline continuation should be.
            </p>
          </div>
        </aside>
      )}

      {activeTab === "practice" && practiceOpening && (
        <aside className="right-sidebar">
          <div className="mode-controls">
            <span className="mode-label">Practice</span>
            <p className="learn-description">
              This is a full game-style practice. Follow the moves of the chosen opening from your
              side; incorrect moves will be flagged so you can correct them.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
