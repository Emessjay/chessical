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
  /** Optional: run engine evaluation on key moves for stronger blunder/tactic detection */
  runEngineEval?: (fen: string, depth?: number) => Promise<number>;
  /** Move count below which resignation is "early" */
  earlyResignationMoveThreshold?: number;
}
