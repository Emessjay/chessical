import type { LearnTrack, OpeningLine, OpeningEntry, PracticeSide } from "../types";

function isPrefix(prefix: string[], full: string[]): boolean {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

/** Longest common move prefix across entries (family stem). */
function longestCommonPrefix(entries: OpeningEntry[]): string[] {
  if (entries.length === 0) return [];
  let prefix = entries[0].moves.slice();
  for (const entry of entries.slice(1)) {
    let i = 0;
    while (
      i < prefix.length &&
      i < entry.moves.length &&
      prefix[i] === entry.moves[i]
    ) {
      i++;
    }
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) break;
  }
  return prefix;
}

/**
 * Corridor traffic: how many family openings pass through this entry's
 * position (entry.moves is a prefix of theirs). Offline proxy for play count.
 */
function corridorTraffic(entries: OpeningEntry[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const entry of entries) {
    let count = 0;
    for (const other of entries) {
      if (isPrefix(entry.moves, other.moves)) count += 1;
    }
    scores.set(entry.id, count);
  }
  return scores;
}

function hasPositiveProminence(lineProm: Record<string, number>): boolean {
  return Object.values(lineProm).some((v) => typeof v === "number" && v > 0);
}

type RankedLine = {
  entry: OpeningEntry;
  /** Popularity used for ordering (explorer games or corridor traffic). */
  score: number;
};

/**
 * Order and select lines so common, complete systems come first and rarer
 * sidelines later.
 *
 * Rules:
 * 1. Popularity — `lineProminence` (Lichess explorer game counts when present)
 *    or offline corridor traffic through the named position.
 * 2. Completeness — collapse same display name to the longest move list;
 *    prefer lines at least ~a full setup deep over family stubs.
 * 3. Breadth then depth — first pass takes the most popular complete line
 *    per early branch (diversity key); second pass fills remaining slots
 *    with the next most popular lines (sidelines / deeper variations).
 * 4. `preferredResponses` boosts lines whose first reply after the stem
 *    matches the curator's popular-reply order (e.g. English).
 */
function selectLinesForTrack(
  familyEntries: OpeningEntry[],
  playerEnding: OpeningEntry[],
  track: LearnTrackConfig
): OpeningEntry[] {
  if (playerEnding.length === 0) return [];

  const lineNameOf = (entry: OpeningEntry): string => {
    let lineName = entry.name;
    const prefix = track.name + ": ";
    if (lineName.startsWith(prefix)) lineName = lineName.slice(prefix.length);
    return lineName;
  };

  const stem = longestCommonPrefix(familyEntries);
  const lineProm = track.lineProminence ?? {};
  const hasStoredProm = hasPositiveProminence(lineProm);
  const useExplorer = track.lineProminenceSource === "explorer";
  const traffic = hasStoredProm ? null : corridorTraffic(familyEntries);

  const rawScore = (entry: OpeningEntry): number => {
    let score = hasStoredProm
      ? (lineProm[entry.id] ?? 0)
      : (traffic?.get(entry.id) ?? 0);
    // Corridor traffic counts named theory, which inflates gambit trees.
    // Demote unless scores are real explorer play counts.
    if (!useExplorer && /gambit/i.test(entry.name)) score *= 0.4;
    if (
      track.preferredResponses &&
      track.preferredResponses.length > 0 &&
      entry.moves.length > stem.length
    ) {
      const reply = entry.moves[stem.length];
      const idx = track.preferredResponses.indexOf(reply);
      if (idx >= 0) {
        score *= 1 + (track.preferredResponses.length - idx) * 0.15;
      }
    }
    return score;
  };

  // Collapse display names → a complete-but-not-obscure teaching line,
  // with popularity = max across all depths of that name.
  const byName = new Map<string, RankedLine>();
  const grouped = new Map<string, OpeningEntry[]>();
  for (const entry of playerEnding) {
    const name = lineNameOf(entry);
    const list = grouped.get(name) ?? [];
    list.push(entry);
    grouped.set(name, list);
  }
  const minComplete = Math.max(6, stem.length + 2);
  const TEACHING_MAX_PLY = 16;
  for (const [name, group] of grouped) {
    const scored = group.map((entry) => ({ entry, score: rawScore(entry) }));
    const maxScore = Math.max(...scored.map((s) => s.score), 0);
    const isTitle = name === track.name || name === "";

    // Family-title: teach a real setup when one exists, keep max corridor score.
    if (isTitle) {
      const setup = scored
        .filter(
          (s) =>
            s.entry.moves.length >= minComplete &&
            s.entry.moves.length <= TEACHING_MAX_PLY
        )
        .sort(
          (a, b) =>
            b.score - a.score || b.entry.moves.length - a.entry.moves.length
        );
      if (setup[0]) {
        byName.set(name, { entry: setup[0].entry, score: maxScore });
        continue;
      }
    }

    const strong = scored.filter((s) => s.score >= maxScore * 0.5);
    let pool = strong.filter((s) => s.entry.moves.length <= TEACHING_MAX_PLY);
    if (pool.length === 0) pool = strong;
    pool.sort(
      (a, b) =>
        b.entry.moves.length - a.entry.moves.length || b.score - a.score
    );
    const best = pool[0] ?? scored[0];
    if (!best) continue;
    byName.set(name, {
      entry: best.entry,
      score: maxScore,
    });
  }

  const items = [...byName.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.entry.moves.length !== a.entry.moves.length) {
      return b.entry.moves.length - a.entry.moves.length;
    }
    return lineNameOf(a.entry).localeCompare(lineNameOf(b.entry));
  });

  const maxLines = track.maxLines ?? items.length;

  const isFamilyStub = (entry: OpeningEntry): boolean => {
    const name = lineNameOf(entry);
    if (name === track.name || name === "") return true;
    // Bare stem / near-stem with no variation label.
    if (entry.moves.length <= stem.length + 2 && !name.includes(",")) {
      return true;
    }
    return false;
  };

  const completeItems = items.filter(
    (item) =>
      item.entry.moves.length >= minComplete && !isFamilyStub(item.entry)
  );
  const rankingPool =
    completeItems.length >= Math.min(3, maxLines) ? completeItems : items;

  // Pick diversity key depth that best separates the top complete candidates
  // (e.g. Najdorf a6 vs Dragon g6 at 10 ply, not only Open at 8).
  const keySample = rankingPool.slice(0, Math.max(maxLines * 2, 12));
  let keyLen = 8;
  let bestDistinct = 0;
  for (let len = 6; len <= 12; len += 2) {
    const keys = new Set(
      keySample.map((item) =>
        item.entry.moves.slice(0, Math.min(len, item.entry.moves.length)).join(" ")
      )
    );
    if (keys.size >= bestDistinct) {
      bestDistinct = keys.size;
      keyLen = len;
    }
  }

  const selected: OpeningEntry[] = [];
  const usedNames = new Set<string>();
  const usedKeys = new Set<string>();

  const tryAdd = (item: RankedLine, pass: "diversity" | "fill"): boolean => {
    const name = lineNameOf(item.entry);
    if (usedNames.has(name)) return false;
    const key = item.entry.moves
      .slice(0, Math.min(keyLen, item.entry.moves.length))
      .join(" ");
    if (pass === "diversity" && usedKeys.has(key)) return false;
    usedNames.add(name);
    usedKeys.add(key);
    selected.push(item.entry);
    return true;
  };

  const intro = items.find((item) => isFamilyStub(item.entry));
  const systemsBudget = intro ? Math.max(1, maxLines - 1) : maxLines;

  // Pass 1 — common complete systems across distinct early branches.
  // Deeper diversity keys (chosen above) separate main systems such as
  // Najdorf vs Dragon without dropping parent Classical/Modern stems.
  for (const item of rankingPool) {
    if (selected.length >= systemsBudget) break;
    if (isFamilyStub(item.entry)) continue;
    tryAdd(item, "diversity");
  }

  // Pass 2 — rarer sidelines / extra variations by popularity.
  for (const item of items) {
    if (selected.length >= systemsBudget) break;
    if (isFamilyStub(item.entry)) continue;
    tryAdd(item, "fill");
  }

  // Prepend intro stub when present so learners see the opening identity first.
  if (intro && selected.length <= maxLines) {
    const introName = lineNameOf(intro.entry);
    if (!usedNames.has(introName)) {
      selected.unshift(intro.entry);
      usedNames.add(introName);
    }
  }

  // If still short (tiny families), fill with anything left including stubs.
  for (const item of items) {
    if (selected.length >= maxLines) break;
    tryAdd(item, "fill");
  }

  return selected.slice(0, maxLines);
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
   * Per-line popularity (by OpeningEntry id). Prefer Lichess explorer game
   * counts when available; otherwise build time falls back to corridor traffic.
   * Higher numbers are taught earlier within the track.
   */
  lineProminence?: Record<string, number>;
  /**
   * How `lineProminence` was produced. `"explorer"` disables gambit demotion
   * (counts are real game totals). `"corridor"` or omitted applies demotion.
   */
  lineProminenceSource?: "explorer" | "corridor";
  /** Opponent's first response moves in priority order (most common first). */
  preferredResponses?: string[];
  /** ECO code for the family (e.g. B07 for Pirc). If omitted, taken from the longest line. */
  eco?: string;
}

/**
 * Build the list of Learn tracks: one LearnTrack per curated (family, side),
 * with lines ordered common complete systems first, rarer sidelines later.
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
      (entry) =>
        entry.moves.length >= 2 &&
        entry.moves.length % 2 === playerLastPlyParity
    );
    if (playerEnding.length === 0) continue;

    const limited = selectLinesForTrack(matches, playerEnding, track);
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

    // Use track eco override, or ECO from the longest line (most specific).
    const lineForEco = [...lines].sort(
      (a, b) => b.moves.length - a.moves.length
    )[0];
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
