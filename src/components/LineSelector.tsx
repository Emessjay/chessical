import type { OpeningLine } from "../types";

interface LineSelectorProps {
  lines: OpeningLine[];
  selectedLineId: string;
  onSelect: (lineId: string) => void;
}

export function LineSelector({
  lines,
  selectedLineId,
  onSelect,
}: LineSelectorProps) {
  return (
    <div className="line-selector" role="tablist" aria-label="Opening line">
      {lines.map((line) => (
        <button
          key={line.id}
          type="button"
          role="tab"
          aria-selected={selectedLineId === line.id}
          className={`line-tab ${selectedLineId === line.id ? "active" : ""}`}
          onClick={() => onSelect(line.id)}
        >
          <span className="line-tab-name">{line.name}</span>
          {line.eco && <span className="line-tab-eco">{line.eco}</span>}
        </button>
      ))}
    </div>
  );
}
