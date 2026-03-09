import type { Opening } from "../types";

interface OpeningsMenuProps {
  openings: Opening[];
  recentOpenings?: Opening[];
  selectedId: string | null;
  onSelect: (opening: Opening) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

function OpeningItem({
  opening,
  isSelected,
  onSelect,
}: {
  opening: Opening;
  isSelected: boolean;
  onSelect: (opening: Opening) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`menu-item ${isSelected ? "selected" : ""}`}
        onClick={() => onSelect(opening)}
      >
        {opening.eco && <span className="menu-item-eco">{opening.eco}</span>}
        <span className="menu-item-name">{opening.name}</span>
      </button>
    </li>
  );
}

export function OpeningsMenu({
  openings,
  recentOpenings = [],
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
}: OpeningsMenuProps) {
  const showRecent = searchQuery.trim() === "" && recentOpenings.length > 0;

  return (
    <nav className="openings-menu" aria-label="Openings">
      <h2 className="menu-title">Openings</h2>
      <input
        type="search"
        className="menu-search-input"
        placeholder="Search by name or ECO..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Search openings by name or ECO"
      />
      <div className="menu-list-wrapper">
        {showRecent && (
          <section className="menu-section" aria-label="Recent">
            <h3 className="menu-section-title">Recent</h3>
            <ul className="menu-list">
              {recentOpenings.map((opening) => (
                <OpeningItem
                  key={opening.id}
                  opening={opening}
                  isSelected={selectedId === opening.id}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </section>
        )}
        <section className="menu-section" aria-label="All openings">
          <h3 className="menu-section-title">
            {searchQuery.trim() ? "Results" : "All openings (ECO order)"}
          </h3>
          <ul className="menu-list">
            {openings.map((opening) => (
              <OpeningItem
                key={opening.id}
                opening={opening}
                isSelected={selectedId === opening.id}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      </div>
    </nav>
  );
}
