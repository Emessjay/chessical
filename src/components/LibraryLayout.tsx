import { useState } from "react";
import openingsData from "../data/openings.json";
import type { Opening } from "../types";
import { OpeningsMenu } from "./OpeningsMenu";
import {
  BoardView,
  type ViewMode,
  type PracticeSide,
} from "./BoardView";

const openings = openingsData as Opening[];

export function LibraryLayout() {
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [mode, setMode] = useState<ViewMode>("view");
  const [practiceSide, setPracticeSide] = useState<PracticeSide>("white");

  return (
    <div className="app">
      <aside className="sidebar">
        <OpeningsMenu
          openings={openings}
          selectedId={selectedOpening?.id ?? null}
          onSelect={setSelectedOpening}
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
          </div>
        )}
      </aside>
      <main className="main">
        {selectedOpening ? (
          <BoardView
            moves={selectedOpening.moves}
            openingName={selectedOpening.name}
            mode={mode}
            practiceSide={practiceSide}
          />
        ) : (
          <div className="placeholder">
            <p>Select an opening from the menu to view and step through its moves.</p>
          </div>
        )}
      </main>
    </div>
  );
}
