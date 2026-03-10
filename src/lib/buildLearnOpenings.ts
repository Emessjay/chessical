import type { Opening, OpeningLine, OpeningEntry } from "../types";

export interface LearnFamilyConfig {
  id: string;
  name: string;
  namePrefixes: string[];
  maxLines?: number;
  /** Black's first moves in priority order (most common first). Used to order same-length lines. */
  preferredResponses?: string[];
}

/**
 * Build the list of openings for the Learn tab: one Opening per curated family,
 * with lines = openings from the full list that match the family (ordered general → specific).
 */
export function buildLearnOpenings(
  allEntries: OpeningEntry[],
  families: LearnFamilyConfig[]
): Opening[] {
  const result: Opening[] = [];

  for (const fam of families) {
    const matches = allEntries.filter((entry) => {
      const lower = entry.name.toLowerCase();
      return fam.namePrefixes.some((p) => lower.startsWith(p.toLowerCase()));
    });

    if (matches.length === 0) continue;

    const preferred = fam.preferredResponses ?? [];
    const sorted = [...matches].sort((a, b) => {
      const lenA = a.moves.length;
      const lenB = b.moves.length;
      if (lenA !== lenB) return lenA - lenB;
      // Same length: prefer lines whose first black move appears earlier in preferredResponses
      if (preferred.length > 0 && a.moves.length >= 2 && b.moves.length >= 2) {
        const idxA = preferred.indexOf(a.moves[1]);
        const idxB = preferred.indexOf(b.moves[1]);
        const orderA = idxA === -1 ? preferred.length : idxA;
        const orderB = idxB === -1 ? preferred.length : idxB;
        if (orderA !== orderB) return orderA - orderB;
      }
      if ((a.eco ?? "") !== (b.eco ?? "")) return (a.eco ?? "").localeCompare(b.eco ?? "");
      return a.name.localeCompare(b.name);
    });

    const limited = sorted.slice(0, fam.maxLines ?? sorted.length);
    const lines: OpeningLine[] = limited.map((entry) => {
      let lineName = entry.name;
      const prefix = fam.name + ": ";
      if (lineName.startsWith(prefix)) lineName = lineName.slice(prefix.length);
      return {
        id: entry.id,
        name: lineName,
        eco: entry.eco,
        moves: entry.moves,
      };
    });

    result.push({
      id: fam.id,
      name: fam.name,
      eco: lines[0]?.eco,
      lines,
    });
  }

  return result;
}
