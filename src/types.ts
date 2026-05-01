/** Single opening entry (flat), used for the full library list. */
export interface OpeningEntry {
  id: string;
  name: string;
  eco?: string;
  moves: string[];
}

export interface OpeningLine {
  id: string;
  name: string;
  eco?: string;
  moves: string[];
}

export interface Opening {
  id: string;
  name: string;
  eco?: string;
  moves?: string[];
  lines?: OpeningLine[];
  /** Prominence as percentage of the time the opening is played (0–100). Used for ordering. */
  prominence?: number;
}

export type PracticeSide = "white" | "black";

/** A side-specific Learn track: one repertoire piece (family + side). */
export interface LearnTrack extends Opening {
  side: PracticeSide;
}

export interface CourseUnit {
  openingId: string;
  lineId: string;
  color: PracticeSide;
  moves: string[];
  displayName: string;
  eco?: string;
}

export interface LearnUnitProgress {
  stage: "arrows" | "no-arrows";
  wrongCount: number;
  cleared: boolean;
}
