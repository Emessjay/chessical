import type { LearnUnitProgress } from "../types";
import { getCourseUnitId } from "./course";
import type { CourseUnit } from "../types";

/** Bumped when opening/line IDs change (e.g. Lichess import) so old progress is not mixed with new. */
const STORAGE_PREFIX = "chessical_learn_v2_";

function storageKey(unit: CourseUnit): string {
  return STORAGE_PREFIX + getCourseUnitId(unit);
}

const DEFAULT_PROGRESS: LearnUnitProgress = {
  stage: "arrows",
  wrongCount: 0,
  cleared: false,
};

export function loadProgress(unit: CourseUnit): LearnUnitProgress {
  try {
    const raw = localStorage.getItem(storageKey(unit));
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as LearnUnitProgress;
    if (
      typeof parsed.stage !== "string" ||
      typeof parsed.wrongCount !== "number" ||
      typeof parsed.cleared !== "boolean"
    ) {
      return { ...DEFAULT_PROGRESS };
    }
    return {
      stage: parsed.stage === "no-arrows" ? "no-arrows" : "arrows",
      wrongCount: Math.max(0, parsed.wrongCount),
      cleared: !!parsed.cleared,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(unit: CourseUnit, progress: LearnUnitProgress): void {
  try {
    localStorage.setItem(storageKey(unit), JSON.stringify(progress));
  } catch {
    /* ignore */
  }
}

export function loadProgressByUnitId(unitId: string): LearnUnitProgress {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + unitId);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as LearnUnitProgress;
    return {
      stage: parsed.stage === "no-arrows" ? "no-arrows" : "arrows",
      wrongCount: Math.max(0, parsed.wrongCount ?? 0),
      cleared: !!parsed.cleared,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgressByUnitId(
  unitId: string,
  progress: LearnUnitProgress
): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + unitId, JSON.stringify(progress));
  } catch {
    /* ignore */
  }
}

/**
 * Returns all unit ids that have been cleared (for building the practice pool).
 */
export function getAllClearedUnitIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const unitId = key.slice(STORAGE_PREFIX.length);
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as LearnUnitProgress;
            if (parsed.cleared) ids.push(unitId);
          } catch {
            /* skip */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return ids;
}

/**
 * Resets all cleared lines to uncleared (keeps stage and wrongCount).
 * Returns the number of units that were reset.
 */
export function resetAllClearedLines(): number {
  let count = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as LearnUnitProgress;
        if (parsed.cleared) {
          const updated: LearnUnitProgress = {
            ...parsed,
            cleared: false,
          };
          localStorage.setItem(key, JSON.stringify(updated));
          count++;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
  return count;
}
