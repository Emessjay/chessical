import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openingFamilies } from "./opening-families.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src", "data");
const OPENINGS_PATH = path.join(DATA_DIR, "openings.json");
const LEARN_FAMILIES_PATH = path.join(DATA_DIR, "learn-families.json");

const TSV_URLS = [
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/a.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/b.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/c.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/d.tsv",
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master/e.tsv",
];

/**
 * Simple TSV parser for the lichess openings files (eco, name, pgn).
 * Name can contain tabs, so we take first column as eco, last as pgn, middle as name.
 */
function parseTsv(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const eco = parts[0].trim();
    const pgn = parts[parts.length - 1].trim();
    const name = parts.slice(1, -1).join("\t").trim();
    if (!eco || !name || !pgn) continue;
    result.push({ eco, name, pgn });
  }
  return result;
}

/**
 * Very lightweight PGN -> SAN move list parser.
 * We only need the sequence of moves, so we:
 * - Drop result markers (1-0, 0-1, 1/2-1/2, *)
 * - Drop move numbers (`1.`, `23...`)
 * - Split on whitespace, filter out empties.
 */
function pgnToMoves(pgn) {
  const tokens = pgn
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");

  const moves = [];
  for (const token of tokens) {
    if (!token) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) continue;
    if (/^\d+\.+$/.test(token)) continue; // "1.", "23."
    if (/^\d+\.\.\.$/.test(token)) continue; // "23..."
    moves.push(token);
  }
  return moves;
}

/**
 * Unique id for an opening entry: slug from name + eco so same name with different ECO stays distinct.
 */
function entryId(name, eco) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${slug}-${eco.toLowerCase()}`;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function loadAllLichessOpenings() {
  const all = [];
  for (const url of TSV_URLS) {
    // eslint-disable-next-line no-console
    console.log(`Fetching ${url} ...`);
    const text = await fetchText(url);
    const entries = parseTsv(text);
    all.push(...entries);
  }
  return all;
}

/** Build a flat list of every opening for the library (all ECOs). */
function buildAllOpenings(entries) {
  const seen = new Set();
  return entries.map(({ eco, name, pgn }) => {
    const moves = pgnToMoves(pgn);
    let id = entryId(name, eco);
    if (seen.has(id)) {
      let n = 0;
      while (seen.has(id + "-" + n)) n++;
      id = id + "-" + n;
    }
    seen.add(id);
    return { id, name, eco, moves };
  });
}

/** Write learn-families.json for the app (curated families for Learn tab only). */
function writeLearnFamilies() {
  const families = openingFamilies.map((f) => {
    const out = {
      id: f.id,
      name: f.name,
      namePrefixes: f.lichessNamePrefixes,
      maxLines: f.maxLines,
    };
    if (f.preferredResponses) out.preferredResponses = f.preferredResponses;
    return out;
  });
  fs.writeFileSync(
    LEARN_FAMILIES_PATH,
    JSON.stringify(families, null, 2),
    "utf8"
  );
}

async function main() {
  try {
    const raw = await loadAllLichessOpenings();
    const allOpenings = buildAllOpenings(raw);

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(
      OPENINGS_PATH,
      JSON.stringify(allOpenings, null, 2),
      "utf8"
    );
    writeLearnFamilies();

    // eslint-disable-next-line no-console
    console.log(
      `Wrote ${allOpenings.length} openings to ${path.relative(ROOT, OPENINGS_PATH)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `Wrote ${openingFamilies.length} learn families to ${path.relative(
        ROOT,
        LEARN_FAMILIES_PATH
      )}`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  }
}

// Run only when executed directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  // eslint-disable-next-line no-console
  main();
}

