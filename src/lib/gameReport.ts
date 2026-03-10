import { Chess, type Move } from "chess.js";
import type { StockfishClient, StockfishPvLine, StockfishScore } from "./stockfishClient";

export type MoveAnnotation = "!!" | "!" | "!?" | "?!" | "?" | "??" | null;

export interface ReportPly {
  ply: number; // 1-based half-move index
  moveNumber: number; // 1-based fullmove number
  side: "w" | "b"; // side that played this ply
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;

  bestMoveUci: string | null;
  bestLineUci: string[];
  bestLineSan: string[];

  bestScore: StockfishScore | null; // normalized to side that played
  playedScore: StockfishScore | null; // normalized to side that played

  winBest: number | null; // 0..100 for side that played
  winPlayed: number | null; // 0..100 for side that played
  winLoss: number | null; // (winBest - winPlayed), clamped >= 0

  onlySoundMove: boolean;
  sacrifice: boolean;
  annotation: MoveAnnotation;
  notes: string[];
}

export interface GenerateReportOpts {
  depth: number;
  showVariationsForMistakes: boolean;
  onlySoundWinGap: number; // win% points
  signal?: AbortSignal;
  onProgress?: (completedPlies: number, totalPlies: number, last?: ReportPly) => void;
}

const DEFAULTS: GenerateReportOpts = {
  depth: 14,
  showVariationsForMistakes: true,
  onlySoundWinGap: 6,
};

function sideToMoveFromFen(fen: string): "w" | "b" {
  const parts = fen.split(/\s+/);
  const stm = parts[1];
  return stm === "b" ? "b" : "w";
}

function negateScore(score: StockfishScore): StockfishScore {
  return { ...score, value: -score.value } as StockfishScore;
}

function normalizeScoreForPlayer(
  score: StockfishScore,
  fenSideToMove: "w" | "b",
  player: "w" | "b"
): StockfishScore {
  return fenSideToMove === player ? score : negateScore(score);
}

// En Croissant / Lichess win% conversion for centipawns.
export function winProbabilityFromCp(cp: number): number {
  const x = -0.00368208 * cp;
  const logistic = 2 / (1 + Math.exp(x)) - 1;
  return 50 + 50 * logistic;
}

function winProbabilityFromScore(score: StockfishScore): number {
  if (score.type === "cp") return winProbabilityFromCp(score.value);
  // Mate scores don't map cleanly; clamp near 0/100 based on sign.
  return score.value > 0 ? 99.5 : 0.5;
}

function uciFromMove(m: Move): string {
  const promo = m.promotion ? String(m.promotion) : "";
  return `${m.from}${m.to}${promo}`;
}

function pieceValue(t: string): number {
  switch (t) {
    case "p":
      return 1;
    case "n":
    case "b":
      return 3;
    case "r":
      return 5;
    case "q":
      return 9;
    case "k":
      return 0;
    default:
      return 0;
  }
}

function materialBalance(chess: Chess): number {
  // Positive means White is ahead, negative means Black is ahead.
  let bal = 0;
  const b = chess.board();
  for (const row of b) {
    for (const p of row) {
      if (!p) continue;
      const v = pieceValue(p.type);
      bal += p.color === "w" ? v : -v;
    }
  }
  return bal;
}

function requireNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Report generation cancelled");
}

function scoreOrNull(line?: StockfishPvLine): StockfishScore | null {
  return line?.score ?? null;
}

function pvOrEmpty(line?: StockfishPvLine): string[] {
  return line?.pv?.length ? line.pv : [];
}

export function uciPvToSan(fen: string, uciPv: string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of uciPv) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;
    const res = chess.move({ from, to, promotion });
    if (!res) break;
    san.push(res.san);
  }
  return san;
}

type AnalysisKey = string;
function keyFor(fen: string, depth: number, multiPv: number): AnalysisKey {
  return `${fen}__d${depth}__mpv${multiPv}`;
}

export async function generateGameReport(
  client: StockfishClient,
  movesSan: string[],
  optsPartial: Partial<GenerateReportOpts> = {}
): Promise<ReportPly[]> {
  const opts: GenerateReportOpts = { ...DEFAULTS, ...optsPartial };
  const totalPlies = movesSan.length;
  const cache = new Map<AnalysisKey, StockfishPvLine[]>();

  const chess = new Chess();
  const out: ReportPly[] = [];

  // Track opponent mistake severity so we can label a follow-up as "!" when it punishes it.
  let prevPlyWinLossForSideThatPlayed: number | null = null;

  for (let i = 0; i < totalPlies; i++) {
    requireNotAborted(opts.signal);

    const san = movesSan[i];
    const fenBefore = chess.fen();
    const side = sideToMoveFromFen(fenBefore);
    const moveNumber = Math.floor(i / 2) + 1;

    // Analyze pre-move with MultiPV2 (best + runner-up).
    const preKey = keyFor(fenBefore, opts.depth, 2);
    let preLines = cache.get(preKey);
    if (!preLines) {
      const pre = await client.analyzePositionMultiPV(fenBefore, { depth: opts.depth, multiPv: 2 });
      const { lastLines } = await pre.done;
      preLines = lastLines;
      cache.set(preKey, preLines);
    }
    const bestLine = preLines.find((l) => l.multipv === 1);
    const secondLine = preLines.find((l) => l.multipv === 2);

    const bestMoveUci = bestLine?.pv?.[0] ?? null;
    const bestScoreRaw = scoreOrNull(bestLine);
    const secondScoreRaw = scoreOrNull(secondLine);

    const bestScore = bestScoreRaw ? normalizeScoreForPlayer(bestScoreRaw, side, side) : null;
    const secondScore = secondScoreRaw ? normalizeScoreForPlayer(secondScoreRaw, side, side) : null;

    const winBest = bestScore ? winProbabilityFromScore(bestScore) : null;
    const winSecond = secondScore ? winProbabilityFromScore(secondScore) : null;

    const onlySoundMove =
      winBest != null && winSecond != null ? winBest - winSecond >= opts.onlySoundWinGap : false;

    // Apply played move.
    const materialBefore = materialBalance(chess);
    let playedMove: Move | null = null;
    try {
      playedMove = chess.move(san, { strict: true }) as unknown as Move | null;
    } catch {
      playedMove = null;
    }
    if (!playedMove) {
      const bad: ReportPly = {
        ply: i + 1,
        moveNumber,
        side,
        san,
        uci: "",
        fenBefore,
        fenAfter: fenBefore,
        bestMoveUci,
        bestLineUci: pvOrEmpty(bestLine),
        bestLineSan: bestLine?.pv?.length ? uciPvToSan(fenBefore, bestLine.pv) : [],
        bestScore,
        playedScore: null,
        winBest,
        winPlayed: null,
        winLoss: null,
        onlySoundMove,
        sacrifice: false,
        annotation: null,
        notes: [`Invalid move at ply ${i + 1}: "${san}"`],
      };
      out.push(bad);
      opts.onProgress?.(i + 1, totalPlies, bad);
      break;
    }

    const uci = uciFromMove(playedMove);
    const fenAfter = chess.fen();
    const materialAfter = materialBalance(chess);
    const moverMaterialDelta =
      side === "w" ? materialAfter - materialBefore : -(materialAfter - materialBefore);

    // Evaluate after the played move (single PV is fine).
    const postKey = keyFor(fenAfter, opts.depth, 1);
    let postLines = cache.get(postKey);
    if (!postLines) {
      const post = await client.analyzePositionMultiPV(fenAfter, { depth: opts.depth, multiPv: 1 });
      const { lastLines } = await post.done;
      postLines = lastLines;
      cache.set(postKey, postLines);
    }
    const playedLine = postLines.find((l) => l.multipv === 1);
    const playedScoreRaw = scoreOrNull(playedLine);
    // After the move, side to move flipped, so normalize to the player who just moved.
    const playedScore =
      playedScoreRaw ? normalizeScoreForPlayer(playedScoreRaw, sideToMoveFromFen(fenAfter), side) : null;

    const winPlayed = playedScore ? winProbabilityFromScore(playedScore) : null;
    const winLoss =
      winBest != null && winPlayed != null ? Math.max(0, winBest - winPlayed) : null;

    // Sacrifice heuristic: mover gave up >= 3 points of material and still played the engine's best move.
    const sacrifice =
      moverMaterialDelta <= -3 && bestMoveUci != null ? bestMoveUci === uci : false;

    let annotation: MoveAnnotation = null;
    const notes: string[] = [];

    if (winLoss != null) {
      if (winLoss >= 20) annotation = "??";
      else if (winLoss >= 10) annotation = "?";
      else if (winLoss >= 5) annotation = "?!";
    }

    // Upgrade for sacrifices / only-sound / punishment.
    if (annotation === null) {
      if (sacrifice && onlySoundMove) annotation = "!!";
      else if (sacrifice) annotation = "!?";
      else if (
        onlySoundMove &&
        bestMoveUci != null &&
        bestMoveUci === uci &&
        prevPlyWinLossForSideThatPlayed != null &&
        prevPlyWinLossForSideThatPlayed >= 10
      ) {
        annotation = "!";
      }
    }

    // For report variations: show best continuation when the played move was a mistake.
    const shouldShowVar =
      opts.showVariationsForMistakes && annotation != null && ["?!", "?", "??"].includes(annotation);

    const bestLineUci = shouldShowVar ? pvOrEmpty(bestLine) : pvOrEmpty(bestLine);
    const bestLineSan = bestLineUci.length ? uciPvToSan(fenBefore, bestLineUci) : [];

    if (onlySoundMove) notes.push("Only sound move (MultiPV2 gap).");
    if (sacrifice) notes.push("Sacrifice heuristic triggered (material drop, engine-best).");

    const plyReport: ReportPly = {
      ply: i + 1,
      moveNumber,
      side,
      san,
      uci,
      fenBefore,
      fenAfter,
      bestMoveUci,
      bestLineUci,
      bestLineSan,
      bestScore,
      playedScore,
      winBest,
      winPlayed,
      winLoss,
      onlySoundMove,
      sacrifice,
      annotation,
      notes,
    };

    out.push(plyReport);
    prevPlyWinLossForSideThatPlayed = winLoss;
    opts.onProgress?.(i + 1, totalPlies, plyReport);
  }

  return out;
}

