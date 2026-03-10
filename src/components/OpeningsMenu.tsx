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
  const hasSearch = searchQuery.trim() !== "";
  const showRecent = !hasSearch && recentOpenings.length > 0;
  const listWhenNoSearch = showRecent ? recentOpenings : openings;
  const sectionTitleWhenNoSearch = showRecent ? "Recent" : "Openings";
  const showListWhenNoSearch = !hasSearch && listWhenNoSearch.length > 0;

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
        {showListWhenNoSearch && (
          <section className="menu-section" aria-label={sectionTitleWhenNoSearch}>
            <h3 className="menu-section-title">{sectionTitleWhenNoSearch}</h3>
            <ul className="menu-list">
              {listWhenNoSearch.map((opening) => (
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
        {hasSearch && (
          <section className="menu-section" aria-label="Search results">
            <h3 className="menu-section-title">Results</h3>
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
        )}
      </div>
    </nav>
  );
}
