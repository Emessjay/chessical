import { Chess } from "chess.js";
import type {
  TrainerGame,
  TrainerAnalysisResult,
  TrainerAnalysisOptions,
  PerGameAnalysis,
  TrainerSummary,
  LossCause,
} from "./trainerTypes";

const LOSS_CAUSES: LossCause[] = [
  "early_resignation",
  "low_time",
  "hanging_pieces",
  "blundered_tactics",
  "poor_endgame",
  "other",
];

const EARLY_RESIGN_MOVE_THRESHOLD = 25;

function isUserLoss(game: TrainerGame): boolean {
  if (game.result === "1/2-1/2") return false;
  if (game.isUserWhite && game.result === "0-1") return true;
  if (!game.isUserWhite && game.result === "1-0") return true;
  return false;
}

function checkLowTime(game: TrainerGame): boolean {
  const t = game.termination.toLowerCase();
  return (
    t.includes("time") ||
    t.includes("forfeit") ||
    t.includes("flag") ||
    t.includes("timeout")
  );
}

function checkEarlyResignation(
  game: TrainerGame,
  fullMoveCount: number,
  threshold: number
): boolean {
  if (game.result === "1/2-1/2") return false;
  const term = game.termination.toLowerCase();
  if (!term.includes("resign")) return false;
  return fullMoveCount < threshold;
}

/** Returns true if after the given position (opponent to move), the opponent can capture a piece and we have no recapture. */
function hasHangingPiece(chess: Chess): { hasHang: boolean; detail?: string } {
  const captures = chess.moves({ verbose: true }).filter((m) => m.captured);
  for (const cap of captures) {
    const toSquare = cap.to;
    const capturedPiece = cap.captured;
    if (!capturedPiece) continue;
    chess.move(cap);
    const ourCaptures = chess.moves({ verbose: true }).filter((m) => m.captured && m.to === toSquare);
    chess.undo();
    if (ourCaptures.length === 0) {
      const pieceName = capturedPiece === "p" ? "pawn" : capturedPiece;
      return {
        hasHang: true,
        detail: `Left ${pieceName} hanging`,
      };
    }
  }
  return { hasHang: false };
}

function analyzeOneGame(
  game: TrainerGame,
  options: TrainerAnalysisOptions
): PerGameAnalysis {
  const isLoss = isUserLoss(game);
  const secondary: LossCause[] = [];
  let primary: LossCause | null = null;
  let detail: string | undefined;

  if (!isLoss) {
    return {
      game,
      isUserLoss: false,
      primaryCause: null,
      secondaryCauses: [],
    };
  }

  const earlyThreshold =
    options.earlyResignationMoveThreshold ?? EARLY_RESIGN_MOVE_THRESHOLD;

  let chess: Chess;
  try {
    chess = new Chess();
    chess.loadPgn(game.pgn, { strict: false });
  } catch {
    return {
      game,
      isUserLoss: true,
      primaryCause: "other",
      secondaryCauses: [],
      detail: "Could not parse game",
    };
  }

  const history = chess.history({ verbose: false });
  const fullMoveCount = Math.ceil(history.length / 2);

  if (checkLowTime(game)) {
    secondary.push("low_time");
    if (!primary) {
      primary = "low_time";
      detail = "Lost on time";
    }
  }

  if (checkEarlyResignation(game, fullMoveCount, earlyThreshold)) {
    secondary.push("early_resignation");
    if (!primary) {
      primary = "early_resignation";
      detail = `Resigned early (move ${fullMoveCount})`;
    }
  }

  chess.reset();
  let hangInEndgame = false;
  let lastHangDetail: string | undefined;
  const endgameStartIndex = Math.floor(history.length * (2 / 3));

  for (let i = 0; i < history.length; i++) {
    const isUserMove =
      (i % 2 === 0 && game.isUserWhite) || (i % 2 === 1 && !game.isUserWhite);
    try {
      const move = chess.move(history[i], { strict: true });
      if (!move) break;
      if (isUserMove) {
        const { hasHang, detail: hangDetail } = hasHangingPiece(chess);
        if (hasHang) {
          lastHangDetail = hangDetail;
          if (i >= endgameStartIndex) hangInEndgame = true;
          if (!secondary.includes("hanging_pieces")) {
            secondary.push("hanging_pieces");
          }
          if (!secondary.includes("blundered_tactics")) {
            secondary.push("blundered_tactics");
          }
        }
      }
    } catch {
      break;
    }
  }

  if (secondary.includes("hanging_pieces") && !primary) {
    primary = hangInEndgame ? "poor_endgame" : "hanging_pieces";
    detail = lastHangDetail ?? "Hanging piece";
    if (hangInEndgame) {
      secondary.push("poor_endgame");
    }
  } else if (secondary.includes("blundered_tactics") && !primary) {
    primary = "blundered_tactics";
    detail = lastHangDetail ?? "Tactical mistake";
  }

  if (hangInEndgame && !secondary.includes("poor_endgame")) {
    secondary.push("poor_endgame");
  }
  if (!primary && secondary.includes("poor_endgame")) {
    primary = "poor_endgame";
    detail = "Mistakes in endgame";
  }

  if (!primary) {
    primary = "other";
    detail = "Loss (cause not classified)";
  }

  return {
    game,
    isUserLoss: true,
    primaryCause: primary,
    secondaryCauses: secondary.filter((c) => c !== primary),
    detail,
  };
}

function buildSummary(results: PerGameAnalysis[]): TrainerSummary {
  const totalGames = results.length;
  const losses = results.filter((r) => r.isUserLoss).length;
  const causeCounts: Record<LossCause, number> = {
    blundered_tactics: 0,
    poor_endgame: 0,
    low_time: 0,
    early_resignation: 0,
    hanging_pieces: 0,
    other: 0,
  };
  for (const r of results) {
    if (r.primaryCause) {
      causeCounts[r.primaryCause]++;
    }
  }
  const topCauses = LOSS_CAUSES.filter((c) => causeCounts[c] > 0)
    .map((cause) => ({ cause, count: causeCounts[cause] }))
    .sort((a, b) => b.count - a.count);

  return {
    totalGames,
    losses,
    causeCounts,
    topCauses,
  };
}

/**
 * Analyzes games and classifies loss causes using lightweight heuristics.
 * Optional runEngineEval can be provided later for deeper analysis.
 */
export function analyzeGamesForLossCauses(
  games: TrainerGame[],
  options: TrainerAnalysisOptions = {}
): TrainerAnalysisResult {
  const results: PerGameAnalysis[] = games.map((g) => analyzeOneGame(g, options));
  const summary = buildSummary(results);
  return { games: results, summary };
}

export function lossCauseLabel(cause: LossCause): string {
  const labels: Record<LossCause, string> = {
    blundered_tactics: "Blundered tactics",
    poor_endgame: "Poor endgame",
    low_time: "Low time",
    early_resignation: "Early resignation",
    hanging_pieces: "Hanging pieces",
    other: "Other",
  };
  return labels[cause] ?? cause;
}
