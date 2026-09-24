/**
 * Training-oriented loss causes from a deterministic board/engine algorithm.
 * Prefer `ambiguous` when confidence is low or signals conflict.
 */
export type LossCause =
  | "hang_to_long_range"
  | "hang_by_retreat"
  | "bad_trade"
  | "missed_simple_tactic"
  | "endgame_technique"
  | "low_time"
  | "early_resignation"
  | "ambiguous";

/** Drill kinds served by the Training suite (mapped from LossCause). */
export type DrillType =
  | "board_vision"
  | "attackers_vs_defenders"
  | "simple_tactics"
  | "endgame_basics"
  | "mixed";

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
  /** Human-readable detail, e.g. "Left rook hanging to bishop" */
  detail?: string;
  /** 0..1 classifier confidence for primaryCause (null when not a loss). */
  confidence?: number | null;
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
  /** Centipawn threshold: if eval for resigning side is below this, position is "lost" (not early resign). */
  earlyResignationLostThreshold?: number;
}
