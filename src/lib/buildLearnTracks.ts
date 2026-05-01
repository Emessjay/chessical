import type { LearnTrack, OpeningLine, OpeningEntry, PracticeSide } from "../types";

/**
 * Order entries by their position in the named-theory tree as a proxy for
 * master-game prominence. Lines with rich named sub-theory (e.g. Staunton
 * Gambit Accepted, with Chigorin and Nimzowitsch variations underneath) are
 * mainstream by definition; orphan lines with no continuations (e.g.
 * Omega-Isis Gambit) are obscure.
 *
 * We sort globally by (curator boost desc, subtree size desc, depth asc,
 * length asc, name) — this surfaces the most-developed parent lines first
 * across the whole tree, so the first N lines cover breadth (different White
 * setups) before depth (sub-variations of one setup).
 */
function orderByDeepTheory(
  entries: OpeningEntry[],
  lineProm: Record<string, number>
): OpeningEntry[] {
  if (entries.length === 0) return [];

  const isPrefix = (p: string[], full: string[]): boolean => {
    if (p.length > full.length) return false;
    for (let i = 0; i < p.length; i++) {
      if (p[i] !== full[i]) return false;
    }
    return true;
  };

  const byLength = [...entries].sort((a, b) => a.moves.length - b.moves.length);

  type Node = {
    entry: OpeningEntry;
    children: Node[];
    subtreeSize: number;
    depth: number;
    /** Sum of explicit lineProminence overrides in this subtree (curator boost). */
    promBoost: number;
  };
  const nodes = new Map<string, Node>();
  const roots: Node[] = [];

  for (const entry of byLength) {
    const node: Node = {
      entry,
      children: [],
      subtreeSize: 1,
      depth: 1,
      promBoost: lineProm[entry.id] ?? 0,
    };
    nodes.set(entry.id, node);

    let parent: Node | null = null;
    let bestLen = -1;
    for (const other of byLength) {
      if (other === entry) break;
      if (other.moves.length >= entry.moves.length) continue;
      if (other.moves.length <= bestLen) continue;
      if (isPrefix(other.moves, entry.moves)) {
        parent = nodes.get(other.id) ?? null;
        bestLen = other.moves.length;
      }
    }
    if (parent) {
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }

  // Post-order: aggregate subtree size and curator boosts up the tree.
  const finalize = (node: Node) => {
    for (const c of node.children) {
      finalize(c);
      node.subtreeSize += c.subtreeSize;
      node.promBoost += c.promBoost;
    }
  };
  for (const r of roots) finalize(r);

  const all = [...nodes.values()];
  all.sort((a, b) => {
    if (b.promBoost !== a.promBoost) return b.promBoost - a.promBoost;
    if (b.subtreeSize !== a.subtreeSize) return b.subtreeSize - a.subtreeSize;
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.entry.moves.length !== b.entry.moves.length) {
      return a.entry.moves.length - b.entry.moves.length;
    }
    return a.entry.name.localeCompare(b.entry.name);
  });

  return all.map((n) => n.entry);
}

export interface LearnTrackConfig {
  id: string;
  name: string;
  side: PracticeSide;
  namePrefixes: string[];
  maxLines?: number;
  /** Prominence as approximate percentage of the time this opening is played (0–100). Used for ordering. */
  prominence?: number;
  /**
   * Optional per-line prominence override (by OpeningEntry id).
   * Higher numbers are shown earlier within the track.
   */
  lineProminence?: Record<string, number>;
  /** Opponent's first response moves in priority order (most common first). Used to order same-length lines. */
  preferredResponses?: string[];
  /** ECO code for the family (e.g. B07 for Pirc). If omitted, taken from the longest line. */
  eco?: string;
}

/**
 * Build the list of Learn tracks: one LearnTrack per curated (family, side),
 * with lines = openings from the full list that match the track (ordered general → specific).
 */
export function buildLearnTracks(
  allEntries: OpeningEntry[],
  tracks: LearnTrackConfig[]
): LearnTrack[] {
  const result: LearnTrack[] = [];
  const byProminence = [...tracks].sort(
    (a, b) => (b.prominence ?? 0) - (a.prominence ?? 0)
  );

  for (const track of byProminence) {
    const matches = allEntries.filter((entry) => {
      const lower = entry.name.toLowerCase();
      return track.namePrefixes.some((p) => lower.startsWith(p.toLowerCase()));
    });

    if (matches.length === 0) continue;

    // Drop lines whose last ply is the opponent's: they ask the student to
    // walk through opponent moves and stop without committing a reply, which
    // is strictly less useful than the same line extended by one player move.
    // moves[i] is white's move when i is even; the side that just moved after
    // N plies is white iff N is odd.
    const playerLastPlyParity = track.side === "white" ? 1 : 0;
    const playerEnding = matches.filter(
      (entry) => entry.moves.length % 2 === playerLastPlyParity
    );
    if (playerEnding.length === 0) continue;

    const lineNameOf = (entry: OpeningEntry): string => {
      let lineName = entry.name;
      const prefix = track.name + ": ";
      if (lineName.startsWith(prefix)) lineName = lineName.slice(prefix.length);
      return lineName;
    };

    // Lichess often lists the same display name at multiple ply depths (e.g.
    // "Najdorf Variation" at 10p, 11p, 14p — all snapshots of the same line).
    // The shorter snapshots are crucial parents in the prefix tree (the 10p
    // Najdorf is the natural parent of all 11p Najdorf-X sub-variations), so
    // we keep them while building the tree. After ordering, we collapse each
    // display name to its longest-move version but inherit the maximum
    // subtree weight across all same-named snapshots so the concept ranks at
    // the level of its most-developed parent.
    const lineProm = track.lineProminence ?? {};
    const ordered = orderByDeepTheory(playerEnding, lineProm);
    const longestPerName = new Map<string, OpeningEntry>();
    for (const entry of playerEnding) {
      const name = lineNameOf(entry);
      const existing = longestPerName.get(name);
      if (!existing || entry.moves.length > existing.moves.length) {
        longestPerName.set(name, entry);
      }
    }
    const uniqueByName: OpeningEntry[] = [];
    const emittedNames = new Set<string>();
    for (const entry of ordered) {
      const name = lineNameOf(entry);
      if (emittedNames.has(name)) continue;
      const longest = longestPerName.get(name);
      if (!longest) continue;
      uniqueByName.push(longest);
      emittedNames.add(name);
    }

    const limited = uniqueByName.slice(0, track.maxLines ?? uniqueByName.length);
    const lines: OpeningLine[] = limited.map((entry) => {
      let lineName = entry.name;
      const prefix = track.name + ": ";
      if (lineName.startsWith(prefix)) lineName = lineName.slice(prefix.length);
      return {
        id: entry.id,
        name: lineName,
        eco: entry.eco,
        moves: entry.moves,
      };
    });

    // Use track eco override, or ECO from the longest line (most specific), not the first/shortest
    const lineForEco = [...lines].sort((a, b) => b.moves.length - a.moves.length)[0];
    const trackEco = track.eco ?? lineForEco?.eco ?? lines[0]?.eco;

    result.push({
      id: track.id,
      name: track.name,
      side: track.side,
      eco: trackEco,
      lines,
      prominence: track.prominence ?? 0,
    });
  }

  return result;
}
