import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import openingsData from "../data/openings.json";
import type { Opening, LearnUnitProgress, PracticeSide } from "../types";
import { OpeningsMenu } from "./OpeningsMenu";
import { MoveControls } from "./MoveControls";
import { BoardView, formatMoveList, type ViewMode } from "./BoardView";
import {
  getOrderedCourseUnits,
  getCourseUnitId,
} from "../lib/course";
import {
  loadProgressByUnitId,
  saveProgressByUnitId,
  getAllClearedUnitIds,
} from "../lib/learnProgress";
import { getPositionAfterMoves } from "../lib/chess";
import {
  getAllowedMovesAtPosition,
  getOpeningIdsForPracticeFilter,
  isTerminalPosition,
  pickComputerMove,
} from "../lib/practiceTree";

const PRACTICE_OPPONENT_MOVE_DELAY_MS = 700;

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

  // Learn tab: course flow
  const [learnSelectedOpening, setLearnSelectedOpening] = useState<Opening | null>(null);
  const [learnProgressVersion, setLearnProgressVersion] = useState(0);
  const [learnUnitProgress, setLearnUnitProgress] = useState<LearnUnitProgress | null>(null);
  /** True when user finished arrow stage and should click "Play from Memory" to start no-arrows. */
  const [learnPendingNoArrows, setLearnPendingNoArrows] = useState(false);
  /** Unit id we just cleared; show success panel with Next Line / Complete Opening until dismissed. */
  const [learnJustClearedUnitId, setLearnJustClearedUnitId] = useState<string | null>(null);
  const learnActionBarRef = useRef<HTMLDivElement>(null);

  const learnOrderedUnits = useMemo(
    () => (learnSelectedOpening ? getOrderedCourseUnits(learnSelectedOpening) : []),
    [learnSelectedOpening]
  );

  const learnNextUnit = useMemo(() => {
    const cleared = getAllClearedUnitIds();
    return learnOrderedUnits.find((u) => !cleared.includes(getCourseUnitId(u))) ?? null;
  }, [learnOrderedUnits, learnProgressVersion]);

  /** When just cleared, keep showing the cleared unit's board; otherwise show next unit to work on. */
  const learnCurrentUnit =
    learnJustClearedUnitId != null
      ? learnOrderedUnits.find((u) => getCourseUnitId(u) === learnJustClearedUnitId) ?? learnNextUnit
      : learnNextUnit;
  const learnCurrentUnitId = learnCurrentUnit ? getCourseUnitId(learnCurrentUnit) : null;

  useEffect(() => {
    if (!learnCurrentUnitId) {
      setLearnUnitProgress(null);
      setLearnPendingNoArrows(false);
      return;
    }
    setLearnUnitProgress(loadProgressByUnitId(learnCurrentUnitId));
    setLearnPendingNoArrows(false);
  }, [learnCurrentUnitId]);

  const learnShowHintArrow = learnUnitProgress?.stage === "arrows";
  const learnMoves = learnCurrentUnit?.moves ?? [];
  const learnDisplayName = learnCurrentUnit
    ? `${learnCurrentUnit.displayName} (${learnCurrentUnit.color})`
    : "";

  const handleLearnWrongMove = useCallback(() => {
    if (!learnCurrentUnitId || learnUnitProgress?.stage !== "no-arrows") return;
    const nextWrong = (learnUnitProgress.wrongCount ?? 0) + 1;
    if (nextWrong >= 2) {
      saveProgressByUnitId(learnCurrentUnitId, {
        stage: "arrows",
        wrongCount: 0,
        cleared: false,
      });
      setLearnUnitProgress({ stage: "arrows", wrongCount: 0, cleared: false });
      setLearnProgressVersion((v) => v + 1);
    } else {
      const next: LearnUnitProgress = {
        ...learnUnitProgress,
        wrongCount: nextWrong,
      };
      saveProgressByUnitId(learnCurrentUnitId, next);
      setLearnUnitProgress(next);
    }
  }, [learnCurrentUnitId, learnUnitProgress]);

  const handleLearnCorrectMove = useCallback(() => {
    if (!learnCurrentUnitId || learnUnitProgress?.stage !== "no-arrows") return;
    if ((learnUnitProgress.wrongCount ?? 0) === 0) return;
    const next: LearnUnitProgress = {
      ...learnUnitProgress,
      wrongCount: 0,
    };
    saveProgressByUnitId(learnCurrentUnitId, next);
    setLearnUnitProgress(next);
  }, [learnCurrentUnitId, learnUnitProgress]);

  const handleLearnLineCleared = useCallback(() => {
    if (!learnCurrentUnitId || !learnUnitProgress) return;
    if (learnUnitProgress.stage === "arrows") {
      setLearnPendingNoArrows(true);
    } else {
      saveProgressByUnitId(learnCurrentUnitId, {
        ...learnUnitProgress,
        cleared: true,
      });
      setLearnUnitProgress({ ...learnUnitProgress, cleared: true });
      setLearnProgressVersion((v) => v + 1);
      setLearnJustClearedUnitId(learnCurrentUnitId);
    }
  }, [learnCurrentUnitId, learnUnitProgress]);

  const handlePlayFromMemory = useCallback(() => {
    if (!learnCurrentUnitId || !learnUnitProgress || learnUnitProgress.stage !== "arrows") return;
    const next: LearnUnitProgress = {
      stage: "no-arrows",
      wrongCount: 0,
      cleared: false,
    };
    saveProgressByUnitId(learnCurrentUnitId, next);
    setLearnUnitProgress(next);
    setLearnProgressVersion((v) => v + 1);
    setLearnPendingNoArrows(false);
  }, [learnCurrentUnitId, learnUnitProgress]);

  const learnClearedUnitInfo = useMemo(() => {
    if (!learnJustClearedUnitId || learnOrderedUnits.length === 0) return null;
    const idx = learnOrderedUnits.findIndex((u) => getCourseUnitId(u) === learnJustClearedUnitId);
    if (idx < 0) return null;
    const unit = learnOrderedUnits[idx];
    const isLastLine = idx === learnOrderedUnits.length - 1;
    return {
      displayName: unit.displayName,
      isLastLine,
    };
  }, [learnJustClearedUnitId, learnOrderedUnits]);

  /** When user just cleared a line, scroll the Next Line button into view. */
  useEffect(() => {
    if (learnJustClearedUnitId && learnActionBarRef.current) {
      learnActionBarRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [learnJustClearedUnitId]);

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

  // Practice tab: organic practice — game moves (null = session not started)
  const [practiceGameMoves, setPracticeGameMoves] = useState<string[] | null>(null);
  const [practiceOpeningFilter, setPracticeOpeningFilter] = useState<string | null>(null);
  const [practiceColorFilter, setPracticeColorFilter] = useState<PracticeSide | null>(null);
  const [practiceLineJustCompleted, setPracticeLineJustCompleted] = useState(false);
  const practicePendingComputerMoveRef = useRef(false);

  const practicePool = useMemo(() => {
    const cleared = new Set(getAllClearedUnitIds());
    return openings.flatMap((o) => getOrderedCourseUnits(o)).filter((u) =>
      cleared.has(getCourseUnitId(u))
    );
  }, [learnProgressVersion]);

  const practiceAllowedOpeningIds = useMemo(() => {
    if (practiceOpeningFilter == null) return null;
    return getOpeningIdsForPracticeFilter(practiceOpeningFilter, openings);
  }, [practiceOpeningFilter]);

  const practiceFilteredPool = useMemo(() => {
    return practicePool.filter((u) => {
      if (practiceOpeningFilter != null && practiceAllowedOpeningIds != null) {
        if (!practiceAllowedOpeningIds.has(u.openingId)) return false;
      }
      if (practiceColorFilter != null && u.color !== practiceColorFilter) return false;
      return true;
    });
  }, [practicePool, practiceOpeningFilter, practiceAllowedOpeningIds, practiceColorFilter]);

  const practiceOpeningsWithCleared = useMemo(() => {
    const ids = new Set(practicePool.map((u) => u.openingId));
    return openings.filter((o) => ids.has(o.id));
  }, [practicePool]);

  const practiceSide: PracticeSide = practiceColorFilter ?? "white";

  const startPractice = useCallback(() => {
    if (practiceFilteredPool.length === 0) return;
    setPracticeGameMoves([]);
  }, [practiceFilteredPool]);

  // When user is Black and game is at start, play first computer move (e.g. e4)
  useEffect(() => {
    if (
      practiceGameMoves?.length === 0 &&
      practiceSide === "black" &&
      practiceFilteredPool.length > 0
    ) {
      const startFen = getPositionAfterMoves([], 0).fen;
      const computerMove = pickComputerMove(startFen, practiceFilteredPool, practiceSide);
      if (computerMove != null) {
        setPracticeGameMoves([computerMove]);
      }
    }
  }, [practiceGameMoves?.length, practiceSide, practiceFilteredPool]);

  const practiceFen = useMemo(() => {
    const moves = practiceGameMoves ?? [];
    return getPositionAfterMoves(moves, moves.length).fen;
  }, [practiceGameMoves]);

  const practiceSideToMove = useMemo(
    () => (practiceFen.includes(" w ") ? "w" : "b"),
    [practiceFen]
  );

  const practiceAllowedMoves = useMemo(() => {
    if (practiceGameMoves === null || practiceFilteredPool.length === 0) return [];
    return getAllowedMovesAtPosition(
      practiceFen,
      practiceFilteredPool,
      practiceSideToMove
    );
  }, [practiceGameMoves, practiceFilteredPool, practiceFen, practiceSideToMove]);

  const handlePracticeValidMove = useCallback(
    (san: string) => {
      setPracticeLineJustCompleted(false);
      setPracticeGameMoves((prev) => {
        if (prev === null) return null;
        const next = [...prev, san];
        const fenAfterUser = getPositionAfterMoves(next, next.length).fen;
        if (isTerminalPosition(fenAfterUser, practiceFilteredPool)) {
          setPracticeLineJustCompleted(true);
          return next;
        }
        practicePendingComputerMoveRef.current = true;
        return next;
      });
    },
    [practiceFilteredPool, practiceSide]
  );

  // After user moves, play computer move following a delay so piece animation runs
  useEffect(() => {
    if (practiceGameMoves === null || practiceFilteredPool.length === 0) return;
    if (practiceGameMoves.length === 0) return;
    const isComputerTurn =
      (practiceSide === "white" && practiceGameMoves.length % 2 === 1) ||
      (practiceSide === "black" && practiceGameMoves.length % 2 === 0);
    if (!isComputerTurn || !practicePendingComputerMoveRef.current) return;
    practicePendingComputerMoveRef.current = false;
    const id = setTimeout(() => {
      const fen = getPositionAfterMoves(
        practiceGameMoves,
        practiceGameMoves.length
      ).fen;
      const computerMove = pickComputerMove(
        fen,
        practiceFilteredPool,
        practiceSide
      );
      if (computerMove == null) return;
      setPracticeGameMoves((prev) => {
        if (prev === null) return null;
        const next = [...prev, computerMove];
        const fenAfter = getPositionAfterMoves(next, next.length).fen;
        if (isTerminalPosition(fenAfter, practiceFilteredPool)) {
          setPracticeLineJustCompleted(true);
          return next;
        }
        return next;
      });
    }, PRACTICE_OPPONENT_MOVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [
    practiceGameMoves,
    practiceSide,
    practiceFilteredPool,
  ]);

  const handlePracticeBoardClick = useCallback(() => {
    if (practiceLineJustCompleted) {
      setPracticeLineJustCompleted(false);
      setPracticeGameMoves([]);
    }
  }, [practiceLineJustCompleted]);

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
              Practice cleared lines. Filter by opening and color, then start a game. The
              computer will play moves that keep the game in your studied lines; you may
              branch into any line you&apos;ve cleared.               When a line is completed, click the board to reset.
            </p>
            {practicePool.length === 0 ? (
              <p className="practice-empty">
                No lines cleared yet. Complete lines in the Learn tab to unlock practice.
              </p>
            ) : (
              <>
                <div className="practice-filters">
                  <label>
                    <span>Opening</span>
                    <select
                      value={practiceOpeningFilter ?? ""}
                      onChange={(e) =>
                        setPracticeOpeningFilter(e.target.value || null)
                      }
                    >
                      <option value="">All</option>
                      {practiceOpeningsWithCleared.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Color</span>
                    <select
                      value={practiceColorFilter ?? ""}
                      onChange={(e) =>
                        setPracticeColorFilter(
                          (e.target.value || null) as PracticeSide | null
                        )
                      }
                    >
                      <option value="">All</option>
                      <option value="white">White</option>
                      <option value="black">Black</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={startPractice}
                  disabled={practiceFilteredPool.length === 0}
                >
                  Start practice
                </button>
                {practiceGameMoves !== null && (
                  <button
                    type="button"
                    className="practice-new-game"
                    onClick={() => {
                      setPracticeLineJustCompleted(false);
                      setPracticeGameMoves([]);
                    }}
                  >
                    New game
                  </button>
                )}
                <ul className="practice-unit-list" aria-label="Cleared lines">
                  {practiceFilteredPool.map((u) => (
                    <li key={getCourseUnitId(u)}>{u.displayName} ({u.color})</li>
                  ))}
                </ul>
                {practiceGameMoves !== null && (
                  <div className="practice-opening-meta">
                    <div className="practice-opening-side">
                      You are playing as{" "}
                      <strong>
                        {practiceSide === "white" ? "White" : "Black"}
                      </strong>
                      .
                    </div>
                  </div>
                )}
              </>
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
            {learnSelectedOpening && learnCurrentUnit ? (
              <div className="learn-main-wrap">
                <BoardView
                  key={`${learnCurrentUnitId}-${learnUnitProgress?.stage ?? "arrows"}`}
                  moves={learnMoves}
                  openingName={learnDisplayName}
                  mode="practice"
                  practiceSide={learnCurrentUnit.color}
                  showMoveList={learnUnitProgress?.stage !== "no-arrows"}
                  showHintArrow={learnShowHintArrow}
                  hideStepButtons={learnUnitProgress?.stage === "no-arrows"}
                  onWrongMove={handleLearnWrongMove}
                  onCorrectMove={handleLearnCorrectMove}
                  onLineCleared={handleLearnLineCleared}
                />
                {(learnUnitProgress?.stage === "arrows" ||
                  learnJustClearedUnitId ||
                  learnPendingNoArrows) && (
                  <div className="learn-action-bar" ref={learnActionBarRef}>
                    {learnUnitProgress?.stage === "arrows" ? (
                      <button
                        type="button"
                        className="learn-action-button learn-action-button-primary"
                        onClick={handlePlayFromMemory}
                      >
                        Play from Memory
                      </button>
                    ) : learnJustClearedUnitId ? (
                      <button
                        type="button"
                        className="learn-action-button learn-action-button-primary"
                        onClick={() => setLearnJustClearedUnitId(null)}
                      >
                        {learnClearedUnitInfo?.isLastLine ? "Complete Opening" : "Next Line"}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : learnSelectedOpening && learnOrderedUnits.length > 0 ? (
              <div className="placeholder">
                <p>
                  All lines for this opening are cleared. Great job! Pick another opening or
                  practice cleared lines in the Practice tab.
                </p>
              </div>
            ) : learnSelectedOpening ? (
              <div className="placeholder">
                <p>
                  Select an opening from the menu to start the course. You&apos;ll work through
                  each line as White and Black in order.
                </p>
              </div>
            ) : (
              <div className="placeholder">
                <p>
                  Select an opening from the menu to learn and practice its lines as a course.
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === "practice" && (
          <>
            {practiceGameMoves !== null && practiceFilteredPool.length > 0 ? (
              <div className="practice-main-wrap">
                {practiceLineJustCompleted && (
                  <p className="practice-line-complete" role="status">
                    Line complete! Click the board to start the next game.
                  </p>
                )}
                <BoardView
                  key="organic-practice"
                  moves={practiceGameMoves}
                  openingName="Practice"
                  mode="practice"
                  practiceSide={practiceSide}
                  hideStepButtons
                  allowedMoves={practiceAllowedMoves}
                  onValidMove={handlePracticeValidMove}
                  onBoardClick={
                    practiceLineJustCompleted ? handlePracticeBoardClick : undefined
                  }
                />
              </div>
            ) : (
              <div className="placeholder">
                <p>
                  {practiceFilteredPool.length === 0
                    ? "No practice boards match your filters. Clear lines in Learn or change filters."
                    : "Click Start practice to begin. Filter by opening and color above."}
                </p>
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
              Stage 1: play with the hint arrow. Stage 2: play without. Two wrong moves in stage 2
              send you back to stage 1. Complete stage 2 to clear the line and unlock it for Practice.
            </p>
            {learnUnitProgress?.stage === "arrows" && (
              <button
                type="button"
                className="learn-action-button"
                onClick={handlePlayFromMemory}
              >
                Play from Memory
              </button>
            )}
            {/* Next Line / Complete Opening appears below the chessboard in the main area when a line is cleared */}
          </div>
        </aside>
      )}

      {activeTab === "practice" && practiceGameMoves !== null && (
        <aside className="right-sidebar">
          <div className="mode-controls">
            <span className="mode-label">Practice</span>
            <p className="learn-description">
              Play moves that stay within your studied lines; the computer will respond in
              kind. Wrong moves will be blocked.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
