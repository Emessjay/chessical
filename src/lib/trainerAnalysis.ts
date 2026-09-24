import { Chess, type Move, type Square, type PieceSymbol } from "chess.js";
import type {
  TrainerGame,
  TrainerAnalysisResult,
  TrainerAnalysisOptions,
  PerGameAnalysis,
  TrainerSummary,
  LossCause,
} from "./trainerTypes";

export const LOSS_CAUSES: LossCause[] = [
  "hang_to_long_range",
  "hang_by_retreat",
  "bad_trade",
  "missed_simple_tactic",
  "endgame_technique",
  "low_time",
  "early_resignation",
  "ambiguous",
];

const EARLY_RESIGN_LOST_CP = -400;
/** Minimum evidence score before we prefer a specific cause over ambiguous. */
const MIN_CONFIDENT_SCORE = 2.5;
/** If top two board causes are this close, treat as ambiguous. */
const CONFLICT_MARGIN = 1.0;

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const LONG_RANGE: ReadonlySet<PieceSymbol> = new Set(["b", "r", "q"]);

type CauseScores = Record<LossCause, number>;

function emptyScores(): CauseScores {
  return {
    hang_to_long_range: 0,
    hang_by_retreat: 0,
    bad_trade: 0,
    missed_simple_tactic: 0,
    endgame_technique: 0,
    low_time: 0,
    early_resignation: 0,
    ambiguous: 0,
  };
}

export function isUserLoss(game: TrainerGame): boolean {
  if (game.result === "1/2-1/2") return false;
  if (game.isUserWhite && game.result === "0-1") return true;
  if (!game.isUserWhite && game.result === "1-0") return true;
  return false;
}

export function checkLowTime(game: TrainerGame): boolean {
  const t = game.termination.toLowerCase();
  return (
    t.includes("time") ||
    t.includes("forfeit") ||
    t.includes("flag") ||
    t.includes("timeout")
  );
}

export function isResignation(game: TrainerGame): boolean {
  return game.termination.toLowerCase().includes("resign");
}

function pieceValue(type: PieceSymbol | undefined): number {
  if (!type) return 0;
  return PIECE_VALUE[type] ?? 0;
}

function nonKingMaterial(chess: Chess): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (p && p.type !== "k") total += PIECE_VALUE[p.type];
    }
  }
  return total;
}

function isEndgamePhase(chess: Chess, plyIndex: number, totalPlies: number): boolean {
  const late = plyIndex >= Math.floor(totalPlies * (2 / 3));
  return late && nonKingMaterial(chess) <= 18;
}

/** Captures available now where the victim has no equal-or-better recapture on that square. */
export function findHangingCaptures(chess: Chess): Move[] {
  const hangs: Move[] = [];
  const captures = chess.moves({ verbose: true }).filter((m) => m.captured);
  for (const cap of captures) {
    const victimValue = pieceValue(cap.captured);
    if (victimValue <= 0) continue;
    chess.move(cap);
    const recaptures = chess
      .moves({ verbose: true })
      .filter((m) => m.captured && m.to === cap.to);
    const bestRecapture = recaptures.reduce(
      (best, m) => Math.max(best, pieceValue(m.captured)),
      0
    );
    chess.undo();
    // Hanging if no recapture, or only a cheaper piece can be taken back (net loss).
    if (recaptures.length === 0 || bestRecapture < victimValue) {
      hangs.push(cap);
    }
  }
  return hangs;
}

/**
 * Net material change for the side that just moved, after a forced exchange on `to`
 * starting with the given capture (already not played). Positive = good for mover.
 */
export function exchangeNetForSideToMove(chess: Chess, capture: Move): number {
  if (!capture.captured) return 0;
  let net = 0;
  let sideSign = 1;
  const sequence: Move[] = [capture];
  const clone = new Chess(chess.fen());

  for (const step of sequence) {
    // Play the capture
    try {
      clone.move(step);
    } catch {
      break;
    }
    net += sideSign * pieceValue(step.captured);
    // Find cheapest recapture on the same square (simple SEE-lite)
    const recaptures = clone
      .moves({ verbose: true })
      .filter((m) => m.captured && m.to === step.to)
      .sort((a, b) => pieceValue(a.piece) - pieceValue(b.piece));
    if (recaptures.length === 0) break;
    sequence.push(recaptures[0]!);
    sideSign *= -1;
    if (sequence.length > 12) break;
  }
  return net;
}

/**
 * True if the piece on `defenderFrom` attacks `target`, including when a friendly
 * piece currently occupies `target` (chess.js move gen skips those squares).
 */
function wasDefendingSquare(
  before: Chess,
  defenderFrom: Square,
  hungSquare: Square,
  defenderColor: "w" | "b"
): boolean {
  const piece = before.get(defenderFrom);
  if (!piece || piece.color !== defenderColor) return false;
  if (defenderFrom === hungSquare) return false;

  const probe = new Chess(before.fen());
  const occupant = probe.get(hungSquare);
  if (occupant && occupant.color === defenderColor) {
    probe.remove(hungSquare);
  }
  const fenParts = probe.fen().split(/\s+/);
  fenParts[1] = defenderColor;
  fenParts[3] = "-"; // clear en passant noise
  let attackBoard: Chess;
  try {
    attackBoard = new Chess(fenParts.join(" "));
  } catch {
    return false;
  }
  return attackBoard
    .moves({ verbose: true, square: defenderFrom })
    .some((m) => m.to === hungSquare);
}

export interface MoveEvidence {
  scores: Partial<CauseScores>;
  detail?: string;
}

/**
 * Classify board-rule evidence for a single user move (already applied on `after`).
 * `before` is the position prior to the user's move; `userMove` is that move.
 */
export function evidenceForUserMove(
  before: Chess,
  after: Chess,
  userMove: Move,
  opts: { inEndgame: boolean }
): MoveEvidence {
  const scores: Partial<CauseScores> = {};
  const details: string[] = [];
  const userColor = userMove.color;

  // --- Bad trade: user initiated a capture with negative exchange ---
  if (userMove.captured) {
    const net = exchangeNetForSideToMove(before, userMove);
    if (net < 0) {
      const weight = Math.min(4, 1.5 + Math.abs(net) * 0.5);
      scores.bad_trade = (scores.bad_trade ?? 0) + weight;
      details.push(`Lost material in trade on ${userMove.to} (net ${net})`);
    }
  }

  // --- Hangs left for the opponent after our move ---
  const hangs = findHangingCaptures(after);
  for (const hang of hangs) {
    const victimValue = pieceValue(hang.captured);
    if (victimValue < 1) continue;
    const weight = Math.min(4, 1 + victimValue * 0.45);
    const attackerIsLongRange = LONG_RANGE.has(hang.piece);

    // Opponent captures on hang.to — that is where our piece sits now.
    const movedOntoHungSquare = userMove.to === hang.to;
    const retreatedDefender =
      !movedOntoHungSquare &&
      wasDefendingSquare(
        before,
        userMove.from as Square,
        hang.to as Square,
        userColor
      );

    if (retreatedDefender) {
      scores.hang_by_retreat = (scores.hang_by_retreat ?? 0) + weight;
      details.push(`Left ${hang.captured} hanging by moving away from ${hang.to}`);
    } else if (movedOntoHungSquare && userMove.captured) {
      // Captured onto a square and left the capturing piece en prise — already
      // scored via bad_trade when the exchange net is negative; avoid a second
      // competing hang label for the same mistake.
      if ((scores.bad_trade ?? 0) <= 0) {
        scores.bad_trade = (scores.bad_trade ?? 0) + weight;
        details.push(`Captured on ${hang.to} and left the piece hanging`);
      }
    } else if (attackerIsLongRange) {
      scores.hang_to_long_range = (scores.hang_to_long_range ?? 0) + weight;
      details.push(
        movedOntoHungSquare
          ? `Moved onto ${hang.to} hanging to ${hang.piece}`
          : `Left ${hang.captured} hanging to ${hang.piece} on ${hang.to}`
      );
    } else if (movedOntoHungSquare) {
      scores.hang_to_long_range = (scores.hang_to_long_range ?? 0) + weight * 0.35;
      scores.bad_trade = (scores.bad_trade ?? 0) + weight * 0.35;
      details.push(`Moved ${hang.captured} onto attacked square ${hang.to}`);
    } else {
      // Generic hang without clear subclass — modest board-vision signal
      scores.hang_to_long_range = (scores.hang_to_long_range ?? 0) + weight * 0.5;
      details.push(`Left ${hang.captured} hanging on ${hang.to}`);
    }

    if (opts.inEndgame) {
      scores.endgame_technique = (scores.endgame_technique ?? 0) + weight * 0.6;
    }
  }

  // --- Opponent gains a simple double-attack / fork after our move ---
  const tactic = detectNewSimpleTactic(before, after, userColor);
  if (tactic) {
    scores.missed_simple_tactic = (scores.missed_simple_tactic ?? 0) + tactic.weight;
    details.push(tactic.detail);
    if (opts.inEndgame) {
      scores.endgame_technique = (scores.endgame_technique ?? 0) + 0.5;
    }
  }

  return {
    scores,
    detail: details[0],
  };
}

function detectNewSimpleTactic(
  before: Chess,
  after: Chess,
  userColor: "w" | "b"
): { weight: number; detail: string } | null {
  const forksBefore = countSimpleForks(before, userColor);
  const forksAfter = countSimpleForks(after, userColor);
  if (forksAfter.count <= forksBefore.count) return null;
  return {
    weight: Math.min(4, 2 + forksAfter.bestVictimSum * 0.15),
    detail: forksAfter.detail ?? "Allowed a simple fork / double attack",
  };
}

/**
 * Count knight/queen forks (or king+piece double attacks) against `victimColor`.
 * Side to move is the attacker.
 */
function countSimpleForks(
  chess: Chess,
  victimColor: "w" | "b"
): { count: number; bestVictimSum: number; detail?: string } {
  const attackerColor = victimColor === "w" ? "b" : "w";
  if (chess.turn() !== attackerColor) {
    return { count: 0, bestVictimSum: 0 };
  }

  let count = 0;
  let bestVictimSum = 0;
  let detail: string | undefined;

  for (const m of chess.moves({ verbose: true })) {
    if (m.piece !== "n" && m.piece !== "q" && m.piece !== "k") continue;
    chess.move(m);
    const attackedValues: number[] = [];
    const attackedSans: string[] = [];
    // Probe attacks from the landing square by seeing captures available for this piece
    // Re-generate moves from the moved piece's square
    const attacks = chess.moves({ verbose: true, square: m.to as Square });
    for (const a of attacks) {
      if (!a.captured) continue;
      const v = pieceValue(a.captured);
      if (v >= 3) {
        attackedValues.push(v);
        attackedSans.push(a.captured);
      }
    }
    // Also count check + hanging piece as a "fork-like" double threat
    const givesCheck = chess.inCheck();
    chess.undo();

    const uniqueHigh = attackedValues.length;
    const isFork =
      uniqueHigh >= 2 || (givesCheck && uniqueHigh >= 1 && pieceValue(m.captured) === 0);

    if (isFork) {
      count++;
      const sum = attackedValues.reduce((a, b) => a + b, 0) + (givesCheck ? 2 : 0);
      if (sum > bestVictimSum) {
        bestVictimSum = sum;
        detail = `${m.piece === "n" ? "Knight" : m.piece === "q" ? "Queen" : "King"} fork involving ${attackedSans.join(",") || "check"}`;
      }
    }
  }

  return { count, bestVictimSum, detail };
}

export interface ClassificationPick {
  primary: LossCause;
  secondary: LossCause[];
  confidence: number;
  detail?: string;
}

/**
 * Pick a primary cause from accumulated scores. Prefers ambiguous when weak/conflicted.
 * Timeout (`low_time`) and engine-backed early resignation are applied by the caller
 * as hard facts when appropriate.
 */
export function pickPrimaryCause(
  scores: CauseScores,
  opts: {
    forcedLowTime?: boolean;
    earlyResignCandidate?: boolean;
    detailByCause?: Partial<Record<LossCause, string>>;
  } = {}
): ClassificationPick {
  const detailByCause = opts.detailByCause ?? {};

  if (opts.forcedLowTime) {
    const secondary = boardCausesAbove(scores, 1.5).filter((c) => c !== "low_time");
    return {
      primary: "low_time",
      secondary,
      confidence: 0.95,
      detail: detailByCause.low_time ?? "Lost on time",
    };
  }

  const boardKeys: LossCause[] = [
    "hang_by_retreat",
    "hang_to_long_range",
    "bad_trade",
    "missed_simple_tactic",
    "endgame_technique",
  ];

  const ranked = boardKeys
    .map((cause) => ({ cause, score: scores[cause] }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];

  if (
    top &&
    top.score >= MIN_CONFIDENT_SCORE &&
    (!second || top.score - second.score >= CONFLICT_MARGIN)
  ) {
    const secondary = ranked
      .slice(1)
      .filter((x) => x.score >= 1.5)
      .map((x) => x.cause);
    if (opts.earlyResignCandidate) secondary.push("early_resignation");
    const confidence = Math.min(0.92, 0.55 + top.score * 0.08);
    return {
      primary: top.cause,
      secondary,
      confidence,
      detail: detailByCause[top.cause],
    };
  }

  // Conflict or weak board signal
  if (opts.earlyResignCandidate && (!top || top.score < MIN_CONFIDENT_SCORE)) {
    return {
      primary: "early_resignation",
      secondary: ranked.filter((x) => x.score >= 1).map((x) => x.cause),
      confidence: 0.75,
      detail: detailByCause.early_resignation ?? "Resigned in playable position",
    };
  }

  const secondary = ranked.filter((x) => x.score >= 1).map((x) => x.cause);
  return {
    primary: "ambiguous",
    secondary,
    confidence: top ? Math.min(0.5, top.score * 0.12) : 0.2,
    detail:
      top && second && top.score - second.score < CONFLICT_MARGIN
        ? "Multiple plausible causes"
        : detailByCause.ambiguous ?? "Unclear loss cause",
  };
}

function boardCausesAbove(scores: CauseScores, min: number): LossCause[] {
  return (
    [
      "hang_by_retreat",
      "hang_to_long_range",
      "bad_trade",
      "missed_simple_tactic",
      "endgame_technique",
    ] as LossCause[]
  ).filter((c) => scores[c] >= min);
}

async function analyzeOneGame(
  game: TrainerGame,
  options: TrainerAnalysisOptions
): Promise<PerGameAnalysis> {
  if (!isUserLoss(game)) {
    return {
      game,
      isUserLoss: false,
      primaryCause: null,
      secondaryCauses: [],
      confidence: null,
    };
  }

  let chess: Chess;
  try {
    chess = new Chess();
    chess.loadPgn(game.pgn, { strict: false });
  } catch {
    return {
      game,
      isUserLoss: true,
      primaryCause: "ambiguous",
      secondaryCauses: [],
      detail: "Could not parse game",
      confidence: 0.1,
    };
  }

  const history = chess.history({ verbose: true });
  const scores = emptyScores();
  const detailByCause: Partial<Record<LossCause, string>> = {};
  const forcedLowTime = checkLowTime(game);
  if (forcedLowTime) {
    scores.low_time = 10;
    detailByCause.low_time = "Lost on time";
  }

  const before = new Chess();
  // Replay from start; `chess` from PGN may be at final position — reset a walker.
  for (let i = 0; i < history.length; i++) {
    const ply = history[i]!;
    const isUserMove =
      (ply.color === "w" && game.isUserWhite) ||
      (ply.color === "b" && !game.isUserWhite);

    if (isUserMove) {
      const after = new Chess(before.fen());
      let played: Move;
      try {
        played = after.move(ply);
      } catch {
        break;
      }
      const inEndgame = isEndgamePhase(after, i, history.length);
      // Weight later mistakes more (training relevance)
      const phaseWeight = 0.7 + (i / Math.max(1, history.length - 1)) * 0.6;
      const evidence = evidenceForUserMove(before, after, played, { inEndgame });
      for (const [cause, value] of Object.entries(evidence.scores) as [
        LossCause,
        number,
      ][]) {
        if (!value) continue;
        scores[cause] += value * phaseWeight;
        if (evidence.detail && !detailByCause[cause]) {
          detailByCause[cause] = evidence.detail;
        }
      }
      before.move(played);
    } else {
      try {
        before.move(ply);
      } catch {
        break;
      }
    }
  }

  let earlyResignCandidate = false;
  if (isResignation(game) && options.runEngineEval && !forcedLowTime) {
    const lostThreshold =
      options.earlyResignationLostThreshold ?? EARLY_RESIGN_LOST_CP;
    try {
      const cpWhite = await options.runEngineEval(before.fen(), 12);
      const cpForUser = game.isUserWhite ? cpWhite : -cpWhite;
      if (cpForUser >= lostThreshold) {
        earlyResignCandidate = true;
        scores.early_resignation = 3;
        detailByCause.early_resignation = "Resigned in playable position";
      }
    } catch {
      // Engine failed; never force early resignation
    }
  }

  const pick = pickPrimaryCause(scores, {
    forcedLowTime,
    earlyResignCandidate,
    detailByCause,
  });

  return {
    game,
    isUserLoss: true,
    primaryCause: pick.primary,
    secondaryCauses: pick.secondary.filter((c) => c !== pick.primary),
    detail: pick.detail,
    confidence: pick.confidence,
  };
}

function buildSummary(results: PerGameAnalysis[]): TrainerSummary {
  const totalGames = results.length;
  const losses = results.filter((r) => r.isUserLoss).length;
  const causeCounts = emptyScores();
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
 * Analyzes games and classifies loss causes with board-rule heuristics
 * (plus optional local Stockfish for early-resignation checks only).
 * Prefers `ambiguous` when evidence is weak or conflicting.
 */
export async function analyzeGamesForLossCauses(
  games: TrainerGame[],
  options: TrainerAnalysisOptions = {}
): Promise<TrainerAnalysisResult> {
  const results = await Promise.all(games.map((g) => analyzeOneGame(g, options)));
  return { games: results, summary: buildSummary(results) };
}

export function lossCauseLabel(cause: LossCause): string {
  const labels: Record<LossCause, string> = {
    hang_to_long_range: "Hang to long-range piece",
    hang_by_retreat: "Hang by moving away",
    bad_trade: "Bad trade / unequal exchange",
    missed_simple_tactic: "Missed simple tactic",
    endgame_technique: "Endgame technique",
    low_time: "Low time",
    early_resignation: "Early resignation",
    ambiguous: "Unclear / mixed",
  };
  return labels[cause] ?? cause;
}

/** Exported for unit tests — empty score map. */
export function createEmptyCauseScores(): CauseScores {
  return emptyScores();
}
