import type { TrainerGame } from "./trainerTypes";

const BASE = "https://api.chess.com/pub/player";

interface ChessComArchivesResponse {
  archives: string[];
}

interface ChessComPlayer {
  username: string;
  rating?: number;
  result?: string;
}

interface ChessComGameRaw {
  url?: string;
  pgn: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
  end_time: number;
  time_control: string;
  time_class?: string;
  rated?: boolean;
}

interface ChessComArchiveResponse {
  games: ChessComGameRaw[];
}

function parsePgnTag(pgn: string, tag: string): string | null {
  const re = new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`);
  const m = pgn.match(re);
  return m ? m[1] : null;
}

function gameFromRaw(raw: ChessComGameRaw, username: string): TrainerGame {
  const userLower = username.toLowerCase();
  const whiteUser = (raw.white?.username ?? parsePgnTag(raw.pgn, "White") ?? "").toLowerCase();
  const isUserWhite = whiteUser === userLower;
  const result = parsePgnTag(raw.pgn, "Result") ?? "";
  const termination = parsePgnTag(raw.pgn, "Termination") ?? "";
  return {
    pgn: raw.pgn,
    white: raw.white?.username ?? parsePgnTag(raw.pgn, "White") ?? "?",
    black: raw.black?.username ?? parsePgnTag(raw.pgn, "Black") ?? "?",
    result,
    timeControl: raw.time_control ?? parsePgnTag(raw.pgn, "TimeControl") ?? "?",
    endTime: raw.end_time ?? 0,
    termination,
    isUserWhite,
    url: raw.url,
  };
}

export class ChessComError extends Error {
  code: "network" | "not_found" | "invalid_username" | "api_error";
  constructor(
    message: string,
    code: "network" | "not_found" | "invalid_username" | "api_error"
  ) {
    super(message);
    this.name = "ChessComError";
    this.code = code;
  }
}

/**
 * Fetches the latest `count` games for the given chess.com username.
 * Uses the archives endpoint and fetches from the most recent month(s) until enough games are collected.
 */
export async function fetchLatestGames(
  username: string,
  count: number = 20
): Promise<TrainerGame[]> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) {
    throw new ChessComError("Username is required", "invalid_username");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/${encodeURIComponent(trimmed)}/games/archives`);
  } catch (e) {
    throw new ChessComError(
      "Network error. Check your connection and try again.",
      "network"
    );
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new ChessComError("Username not found on chess.com", "not_found");
    }
    throw new ChessComError(
      `Chess.com API error (${res.status})`,
      "api_error"
    );
  }

  let data: ChessComArchivesResponse;
  try {
    data = await res.json();
  } catch {
    throw new ChessComError("Invalid response from chess.com", "api_error");
  }

  const archives = data.archives ?? [];
  if (archives.length === 0) {
    return [];
  }

  const allRaw: ChessComGameRaw[] = [];
  // Fetch from most recent month first (last in list)
  for (let i = archives.length - 1; i >= 0 && allRaw.length < count; i--) {
    try {
      const archiveRes = await fetch(archives[i]);
      if (!archiveRes.ok) continue;
      const archiveData: ChessComArchiveResponse = await archiveRes.json();
      const games = archiveData.games ?? [];
      allRaw.push(...games);
    } catch {
      // skip this archive on network error
    }
  }

  const byEndTime = [...allRaw].sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
  const latest = byEndTime.slice(0, count);
  return latest.map((g) => gameFromRaw(g, trimmed));
}
