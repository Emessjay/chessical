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
}

export type PracticeSide = "white" | "black";

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
