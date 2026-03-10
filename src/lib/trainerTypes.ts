export type LossCause =
  | "blundered_tactics"
  | "poor_endgame"
  | "low_time"
  | "early_resignation"
  | "hanging_pieces"
  | "other";

export interface TrainerGame {
  pgn: string;
  white: string;
  black: string;
  result: string; // "1-0" | "0-1" | "1/2-1/2"
  timeControl: string;
  endTime: number; // unix timestamp for sorting
  termination: string;
  isUserWhite: boolean;
  /** Optional URL from chess.com */
  url?: string;
}

export interface PerGameAnalysis {
  game: TrainerGame;
  isUserLoss: boolean;
  primaryCause: LossCause | null;
  secondaryCauses: LossCause[];
  /** Human-readable detail, e.g. "Blundered rook on move 27" */
  detail?: string;
}

export interface TrainerSummary {
  totalGames: number;
  losses: number;
  causeCounts: Record<LossCause, number>;
  /** Sorted by frequency descending */
  topCauses: { cause: LossCause; count: number }[];
}

export interface TrainerAnalysisResult {
  games: PerGameAnalysis[];
  summary: TrainerSummary;
}

export interface TrainerAnalysisOptions {
  /**
   * Optional: run engine evaluation (centipawns from White's perspective).
   * Used to decide if a resignation was "early" (position not already lost).
   */
  runEngineEval?: (fen: string, depth?: number) => Promise<number>;
  /** Move count below which we consider resignation for "early" check (only with runEngineEval). */
  earlyResignationMoveThreshold?: number;
  /** Centipawn threshold: if eval for resigning side is below this, position is "lost" (not early resign). */
  earlyResignationLostThreshold?: number;
}
