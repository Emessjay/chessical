import { Chess } from "chess.js";

export interface ParsedGameInput {
  movesSan: string[];
  metadata?: Record<string, string>;
  warnings: string[];
  kind: "pgn" | "san";
}

function parseSanTokens(raw: string): { movesSan: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const cleaned = raw
    .replace(/\{[^}]*\}/g, " ") // strip {...} comments
    .replace(/\([^)]*\)/g, " ") // strip (...) variations (simple)
    .replace(/\d+\.(\.\.)?/g, " ") // strip move numbers like "1." / "1..."
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return { movesSan: [], warnings };

  const tokens = cleaned
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => !["1-0", "0-1", "1/2-1/2", "*"].includes(t));

  return { movesSan: tokens, warnings };
}

function looksLikePgn(raw: string): boolean {
  if (/\[[A-Za-z0-9_]+\s+"[^"]*"\]/.test(raw)) return true; // headers
  // PGN movetext commonly has move numbers + result token, even without headers
  if (/\b1\.\s*\S+/.test(raw) && /\b(1-0|0-1|1\/2-1\/2|\*)\b/.test(raw)) return true;
  return false;
}

function parsePgnHeaders(raw: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const m of raw.matchAll(/^\[([A-Za-z0-9_]+)\s+"([^"]*)"\]\s*$/gm)) {
    headers[m[1]] = m[2];
  }
  return Object.keys(headers).length ? headers : undefined;
}

export function parseGameInput(raw: string): ParsedGameInput {
  const trimmed = raw.trim();
  if (!trimmed) return { movesSan: [], warnings: [], kind: "san" };

  if (looksLikePgn(trimmed)) {
    const chess = new Chess();
    const metadata = parsePgnHeaders(trimmed);
    const warnings: string[] = [];

    // chess.js loadPgn() returns undefined on success, not true — treat "no throw" as success
    let loaded = false;
    try {
      (chess as unknown as { loadPgn(pgn: string, opts?: { sloppy?: boolean }): void }).loadPgn(
        trimmed,
        { sloppy: true }
      );
      loaded = true;
    } catch {
      try {
        (chess as unknown as { loadPgn(pgn: string): void }).loadPgn(trimmed);
        loaded = true;
      } catch {
        loaded = false;
      }
    }

    if (!loaded) {
      warnings.push("Could not parse PGN; falling back to SAN token parsing.");
      const movetextOnly = trimmed.replace(/^[\s\S]*?\n\n/, ""); // strip header block
      const san = parseSanTokens(movetextOnly);
      return { kind: "san", movesSan: san.movesSan, warnings: [...warnings, ...san.warnings] };
    }

    const movesSan = chess.history({ verbose: false });
    return { kind: "pgn", movesSan, metadata, warnings };
  }

  const san = parseSanTokens(trimmed);
  return { kind: "san", movesSan: san.movesSan, warnings: san.warnings };
}

