import type { Opening } from "../types";

interface OpeningsMenuProps {
  openings: Opening[];
  selectedId: string | null;
  onSelect: (opening: Opening) => void;
}

export function OpeningsMenu({
  openings,
  selectedId,
  onSelect,
}: OpeningsMenuProps) {
  return (
    <nav className="openings-menu" aria-label="Openings">
      <h2 className="menu-title">Openings</h2>
      <ul className="menu-list">
        {openings.map((opening) => (
          <li key={opening.id}>
            <button
              type="button"
              className={`menu-item ${selectedId === opening.id ? "selected" : ""}`}
              onClick={() => onSelect(opening)}
            >
              <span className="menu-item-name">{opening.name}</span>
              {opening.eco && (
                <span className="menu-item-eco">{opening.eco}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
