import type { DrillType, LossCause } from "./trainerTypes";

/** Map a specific Autopsy cause to a training drill. Ambiguous → mixed. */
export const CAUSE_TO_DRILL: Record<LossCause, DrillType> = {
  hang_to_long_range: "board_vision",
  hang_by_retreat: "board_vision",
  bad_trade: "attackers_vs_defenders",
  missed_simple_tactic: "simple_tactics",
  endgame_technique: "endgame_basics",
  low_time: "mixed",
  early_resignation: "mixed",
  ambiguous: "mixed",
};

export const DRILL_LABELS: Record<DrillType, string> = {
  board_vision: "Board vision",
  attackers_vs_defenders: "Attackers vs defenders",
  simple_tactics: "Simple tactics",
  endgame_basics: "Endgame basics",
  mixed: "Mixed practice",
};

export const DRILL_DESCRIPTIONS: Record<DrillType, string> = {
  board_vision:
    "Spot hanging pieces — especially long-range captures and unprotected squares after a retreat.",
  attackers_vs_defenders:
    "Count attackers and defenders before you take. Only capture when the exchange works.",
  simple_tactics: "Find forks and double attacks before your opponent does.",
  endgame_basics: "Convert basic king-and-piece endings against the engine.",
  mixed: "A balanced mix — used when Autopsy is unclear or history is thin.",
};

/** Causes that should not specialize the suite (fall back to mixed). */
const NON_SPECIALIZED: ReadonlySet<LossCause> = new Set([
  "ambiguous",
  "low_time",
  "early_resignation",
]);

export interface DrillSelection {
  drill: DrillType;
  /** Cause that drove the selection, or null for default mixed. */
  sourceCause: LossCause | null;
  reason: string;
}

/**
 * Choose a drill from Autopsy cause frequencies.
 * Uses the most frequent *specialized* cause; otherwise mixed.
 */
export function selectDrillFromCauseCounts(
  causeCounts: Partial<Record<LossCause, number>> | null | undefined
): DrillSelection {
  if (!causeCounts) {
    return {
      drill: "mixed",
      sourceCause: null,
      reason: "No Autopsy history yet — starting with mixed practice.",
    };
  }

  const specialized = (
    Object.entries(causeCounts) as [LossCause, number][]
  )
    .filter(
      ([cause, count]) =>
        count > 0 && !NON_SPECIALIZED.has(cause) && cause in CAUSE_TO_DRILL
    )
    .sort((a, b) => b[1] - a[1]);

  const top = specialized[0];
  if (!top) {
    const ambiguousCount = causeCounts.ambiguous ?? 0;
    return {
      drill: "mixed",
      sourceCause: ambiguousCount > 0 ? "ambiguous" : null,
      reason:
        ambiguousCount > 0
          ? "Recent losses were unclear — using a balanced mix."
          : "No specialized loss patterns yet — using a balanced mix.",
    };
  }

  const [cause, count] = top;
  const drill = CAUSE_TO_DRILL[cause];
  return {
    drill,
    sourceCause: cause,
    reason: `Most frequent Autopsy cause: ${cause.replace(/_/g, " ")} (${count}).`,
  };
}

/**
 * Weighted random drill for "mixed" sessions, or identity for a specific drill.
 * Pure: pass `rng` returning [0,1).
 */
export function pickDrillTypeForSession(
  selection: DrillSelection,
  rng: () => number = Math.random
): DrillType {
  if (selection.drill !== "mixed") return selection.drill;

  const mix: { drill: DrillType; weight: number }[] = [
    { drill: "board_vision", weight: 0.3 },
    { drill: "attackers_vs_defenders", weight: 0.3 },
    { drill: "simple_tactics", weight: 0.25 },
    { drill: "endgame_basics", weight: 0.15 },
  ];
  const total = mix.reduce((s, m) => s + m.weight, 0);
  let r = rng() * total;
  for (const item of mix) {
    r -= item.weight;
    if (r <= 0) return item.drill;
  }
  return "board_vision";
}

export interface TrainingPuzzle {
  id: string;
  drill: DrillType;
  fen: string;
  /** Acceptable solution moves in SAN (any one is correct). */
  solutions: string[];
  prompt: string;
  label?: string;
}

/**
 * Pick the next puzzle for a drill, avoiding immediate repeats when possible.
 */
export function pickPuzzle(
  puzzles: TrainingPuzzle[],
  drill: DrillType,
  recentIds: string[] = [],
  rng: () => number = Math.random
): TrainingPuzzle | null {
  const pool = puzzles.filter((p) => p.drill === drill);
  if (pool.length === 0) return null;
  const fresh = pool.filter((p) => !recentIds.includes(p.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx] ?? null;
}
