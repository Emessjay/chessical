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
 * and are only used for relative ordering in the Learn tab. Both sides
 * of a family inherit the same prominence.
 */
const FAMILY_PROMINENCE_PERCENT = {
  "sicilian": 18,
  "queens-gambit": 14,
  "ruy-lopez": 12,
  "english": 10,
  "italian": 9,
  "french": 7,
  "kings-indian": 7,
  "caro-kann": 6,
  "slav": 6,
  "nimzo-indian": 5,
  "reti": 5,
  "kings-pawn-game": 4,
  "gruenfeld": 4,
  "queens-indian": 4,
  "catalan": 4,
  "pirc": 3,
  "dutch": 2,
  "scandinavian": 2,
  "scotch": 2,
  "four-knights": 2,
  "benoni": 1,
  "benko": 1,
};

function familyIdOf(track) {
  return track.id.replace(/-(white|black)$/, "");
}

function loadJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function updateLearnTracksProminence() {
  if (!fs.existsSync(LEARN_TRACKS_PATH)) {
    throw new Error(`learn-tracks.json not found at ${LEARN_TRACKS_PATH}`);
  }

  const tracks = loadJson(LEARN_TRACKS_PATH);
  let updatedCount = 0;

  const updatedTracks = tracks.map((track) => {
    const percent = FAMILY_PROMINENCE_PERCENT[familyIdOf(track)];
    if (typeof percent === "number") {
      updatedCount += 1;
      return {
        ...track,
        prominence: percent,
      };
    }
    return track;
  });

  saveJson(LEARN_TRACKS_PATH, updatedTracks);

  // eslint-disable-next-line no-console
  console.log(
    `Updated prominence for ${updatedCount} tracks in ${path.relative(
      ROOT,
      LEARN_TRACKS_PATH,
    )}`,
  );
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

const FETCH_DELAY_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchExplorerStats(fen) {
  const url = `https://explorer.lichess.ovh/master?fen=${encodeURIComponent(fen)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch explorer data: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function updateLineProminenceFromExplorer() {
  if (!fs.existsSync(OPENINGS_PATH)) {
    throw new Error(`openings.json not found at ${OPENINGS_PATH}`);
  }
  if (!fs.existsSync(LEARN_TRACKS_PATH)) {
    throw new Error(`learn-tracks.json not found at ${LEARN_TRACKS_PATH}`);
  }

  const openings = loadJson(OPENINGS_PATH);
  const tracks = loadJson(LEARN_TRACKS_PATH);

  // Cache results per family id so both white and black tracks of the same
  // family don't refetch the same FENs.
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

      lineProminence = {};
      // eslint-disable-next-line no-console
      console.log(`Fetching ${matches.length} positions for ${famId}...`);
      for (const entry of matches) {
        const fen = getFenAfterMoves(entry.moves ?? []);
        let total = 0;
        try {
          const data = await fetchExplorerStats(fen);
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
      lineProminenceByFamily.set(famId, lineProminence);
    }

    updatedTracks.push({
      ...track,
      lineProminence,
    });
  }

  saveJson(LEARN_TRACKS_PATH, updatedTracks);

  // eslint-disable-next-line no-console
  console.log(
    `Updated lineProminence for ${updatedTracks.length} tracks in ${path.relative(
      ROOT,
      LEARN_TRACKS_PATH,
    )}`,
  );
}

async function main() {
  try {
    updateLearnTracksProminence();
    await updateLineProminenceFromExplorer();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // eslint-disable-next-line no-console
  main();
}
