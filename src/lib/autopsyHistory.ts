import type { LossCause, TrainerSummary } from "./trainerTypes";
import { LOSS_CAUSES } from "./trainerAnalysis";

const AUTOPSY_HISTORY_KEY = "chessical_autopsy_history";

export interface AutopsyHistory {
  updatedAt: number;
  username: string;
  causeCounts: Record<LossCause, number>;
  topCauses: { cause: LossCause; count: number }[];
  losses: number;
  totalGames: number;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emptyCounts(): Record<LossCause, number> {
  const counts = {} as Record<LossCause, number>;
  for (const c of LOSS_CAUSES) counts[c] = 0;
  return counts;
}

export function saveAutopsyHistory(
  username: string,
  summary: TrainerSummary
): AutopsyHistory {
  const history: AutopsyHistory = {
    updatedAt: Date.now(),
    username,
    causeCounts: { ...emptyCounts(), ...summary.causeCounts },
    topCauses: summary.topCauses,
    losses: summary.losses,
    totalGames: summary.totalGames,
  };
  if (hasStorage()) {
    try {
      window.localStorage.setItem(AUTOPSY_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // ignore quota / private mode
    }
  }
  return history;
}

export function getAutopsyHistory(): AutopsyHistory | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(AUTOPSY_HISTORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutopsyHistory;
    if (!parsed || typeof parsed !== "object" || !parsed.causeCounts) return null;
    return {
      ...parsed,
      causeCounts: { ...emptyCounts(), ...parsed.causeCounts },
    };
  } catch {
    return null;
  }
}

export function clearAutopsyHistory(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(AUTOPSY_HISTORY_KEY);
  } catch {
    // ignore
  }
}
