import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src", "data");
const LEARN_TRACKS_PATH = path.join(DATA_DIR, "learn-tracks.json");
const OPENINGS_PATH = path.join(DATA_DIR, "openings.json");

/**
 * Approximate prominence percentages for each curated learn-family,
 * based on master/tournament opening usage. Values are on a 0–100 scale
 * and are only used for relative ordering of tracks in the Learn tab.
 * Both sides of a family inherit the same prominence.
 */
const FAMILY_PROMINENCE_PERCENT = {
  sicilian: 18,
  "queens-gambit": 14,
  "ruy-lopez": 12,
  english: 10,
  italian: 9,
  french: 7,
  "kings-indian": 7,
  "caro-kann": 6,
  slav: 6,
  "nimzo-indian": 5,
  reti: 5,
  "kings-pawn-game": 4,
  gruenfeld: 4,
  "queens-indian": 4,
  catalan: 4,
  pirc: 3,
  dutch: 2,
  scandinavian: 2,
  scotch: 2,
  "four-knights": 2,
  benoni: 1,
  benko: 1,
};

/** Lichess opening explorer (requires a personal API token since 2026). */
const EXPLORER_MASTERS_URL = "https://explorer.lichess.org/masters";
const FETCH_DELAY_MS = 150;

function familyIdOf(track) {
  return track.id.replace(/-(white|black)$/, "");
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrefix(prefix, full) {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

/**
 * Offline popularity: count how many family openings pass through each
 * entry's move sequence. Used when the explorer API is unavailable.
 */
function corridorTrafficForEntries(entries) {
  const scores = {};
  for (const entry of entries) {
    let count = 0;
    const moves = entry.moves ?? [];
    for (const other of entries) {
      if (isPrefix(moves, other.moves ?? [])) count += 1;
    }
    scores[entry.id] = count;
  }
  return scores;
}

function updateLearnTracksProminence(tracks) {
  let updatedCount = 0;
  const updatedTracks = tracks.map((track) => {
    const percent = FAMILY_PROMINENCE_PERCENT[familyIdOf(track)];
    if (typeof percent === "number") {
      updatedCount += 1;
      return { ...track, prominence: percent };
    }
    return track;
  });
  // eslint-disable-next-line no-console
  console.log(`Set family prominence on ${updatedCount} tracks`);
  return updatedTracks;
}

function getFenAfterMoves(moves) {
  const chess = new Chess();
  for (const san of moves) {
    try {
      const result = chess.move(san, { strict: true });
      if (!result) break;
    } catch {
      break;
    }
  }
  return chess.fen();
}

function getExplorerToken() {
  return (
    process.env.LICHESS_TOKEN ||
    process.env.LICHESS_API_TOKEN ||
    process.env.LICHESS_EXPLORER_TOKEN ||
    ""
  ).trim();
}

async function fetchExplorerStats(fen, token) {
  const url = `${EXPLORER_MASTERS_URL}?fen=${encodeURIComponent(fen)}&topGames=0&moves=0`;
  const headers = {
    Accept: "application/json",
    "User-Agent": "Chessical/0.1 (learn line prominence; github.com/Emessjay/chessical)",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Explorer ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 120)}` : ""}`
    );
  }
  return res.json();
}

/**
 * Prefer Lichess masters explorer game counts when a token is available and
 * the API responds; otherwise write corridor-traffic scores so Learn ordering
 * stays data-driven offline.
 */
async function updateLineProminence(tracks, openings) {
  const token = getExplorerToken();
  let mode = "corridor";
  let explorerOk = false;

  if (token) {
    try {
      await fetchExplorerStats(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        token
      );
      explorerOk = true;
      mode = "explorer";
      // eslint-disable-next-line no-console
      console.log("Using Lichess masters explorer for lineProminence");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `Explorer probe failed (${err.message}); falling back to corridor traffic`
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "No LICHESS_TOKEN set; computing lineProminence from opening-database corridor traffic"
    );
  }

  const lineProminenceByFamily = new Map();
  const updatedTracks = [];

  for (const track of tracks) {
    const famId = familyIdOf(track);
    let lineProminence = lineProminenceByFamily.get(famId);
    if (!lineProminence) {
      const prefixes = (track.namePrefixes ?? []).map((p) => p.toLowerCase());
      const matches = openings.filter((entry) => {
        const lower = (entry.name ?? "").toLowerCase();
        return prefixes.some((p) => lower.startsWith(p));
      });

      if (explorerOk) {
        lineProminence = {};
        // eslint-disable-next-line no-console
        console.log(`Fetching ${matches.length} explorer positions for ${famId}...`);
        for (const entry of matches) {
          const fen = getFenAfterMoves(entry.moves ?? []);
          let total = 0;
          try {
            const data = await fetchExplorerStats(fen, token);
            const white = typeof data.white === "number" ? data.white : 0;
            const black = typeof data.black === "number" ? data.black : 0;
            const draws = typeof data.draws === "number" ? data.draws : 0;
            total = white + black + draws;
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`  failed for ${entry.id}: ${err.message}`);
            total = 0;
          }
          lineProminence[entry.id] = total;
          await sleep(FETCH_DELAY_MS);
        }
      } else {
        lineProminence = corridorTrafficForEntries(matches);
        // eslint-disable-next-line no-console
        console.log(
          `Corridor traffic for ${famId}: ${matches.length} lines`
        );
      }
      lineProminenceByFamily.set(famId, lineProminence);
    }

    updatedTracks.push({
      ...track,
      lineProminence,
      lineProminenceSource: mode,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Wrote lineProminence (${mode}) for ${updatedTracks.length} tracks`
  );
  return updatedTracks;
}

async function main() {
  try {
    if (!fs.existsSync(LEARN_TRACKS_PATH)) {
      throw new Error(`learn-tracks.json not found at ${LEARN_TRACKS_PATH}`);
    }
    if (!fs.existsSync(OPENINGS_PATH)) {
      throw new Error(`openings.json not found at ${OPENINGS_PATH}`);
    }

    const openings = loadJson(OPENINGS_PATH);
    let tracks = loadJson(LEARN_TRACKS_PATH);
    tracks = updateLearnTracksProminence(tracks);
    tracks = await updateLineProminence(tracks, openings);
    saveJson(LEARN_TRACKS_PATH, tracks);
    // eslint-disable-next-line no-console
    console.log(
      `Updated ${path.relative(ROOT, LEARN_TRACKS_PATH)}`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
