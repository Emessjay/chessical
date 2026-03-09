import { useState, useMemo } from "react";
import openingsData from "../data/openings.json";
import type { Opening } from "../types";
import { OpeningsMenu } from "./OpeningsMenu";
import { LineSelector } from "./LineSelector";
import {
  BoardView,
  type ViewMode,
  type PracticeSide,
} from "./BoardView";

const openings = openingsData as Opening[];

function getMovesAndName(opening: Opening, selectedLineId: string | null): { moves: string[]; name: string } {
  if (opening.lines?.length) {
    const line = opening.lines.find((l) => l.id === selectedLineId) ?? opening.lines[0];
    return { moves: line.moves, name: `${opening.name}: ${line.name}` };
  }
  return { moves: opening.moves ?? [], name: opening.name };
}

export function LibraryLayout() {
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("view");
  const [practiceSide, setPracticeSide] = useState<PracticeSide>("white");
  const [showMoveList, setShowMoveList] = useState(false);

  const handleSelectOpening = (opening: Opening) => {
    setSelectedOpening(opening);
    setSelectedLineId(opening.lines?.length ? opening.lines[0].id : null);
  };

  const { moves: currentMoves, name: displayName } = useMemo(
    () => (selectedOpening ? getMovesAndName(selectedOpening, selectedLineId) : { moves: [], name: "" }),
    [selectedOpening, selectedLineId]
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <OpeningsMenu
          openings={openings}
          selectedId={selectedOpening?.id ?? null}
          onSelect={handleSelectOpening}
        />
        {selectedOpening && (
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
        )}
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
            />
          </>
        ) : (
          <div className="placeholder">
            <p>Select an opening from the menu to view and step through its moves.</p>
          </div>
        )}
      </main>
    </div>
  );
}
