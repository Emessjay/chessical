import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src", "data");
const LEARN_FAMILIES_PATH = path.join(DATA_DIR, "learn-families.json");

/**
 * Approximate prominence percentages for each curated learn-family,
 * based on master/tournament opening usage. Values are on a 0–100 scale
 * and are only used for relative ordering in the Learn tab.
 *
 * These numbers were derived from master-level opening statistics
 * (e.g. Lichess masters / common theory sources) and rounded to
 * simple integers.
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

function loadJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function updateLearnFamiliesProminence() {
  if (!fs.existsSync(LEARN_FAMILIES_PATH)) {
    throw new Error(`learn-families.json not found at ${LEARN_FAMILIES_PATH}`);
  }

  const families = loadJson(LEARN_FAMILIES_PATH);
  let updatedCount = 0;

  const updatedFamilies = families.map((fam) => {
    const percent = FAMILY_PROMINENCE_PERCENT[fam.id];
    if (typeof percent === "number") {
      updatedCount += 1;
      return {
        ...fam,
        prominence: percent,
      };
    }
    return fam;
  });

  saveJson(LEARN_FAMILIES_PATH, updatedFamilies);

  // eslint-disable-next-line no-console
  console.log(
    `Updated prominence for ${updatedCount} families in ${path.relative(
      ROOT,
      LEARN_FAMILIES_PATH,
    )}`,
  );
}

async function main() {
  try {
    updateLearnFamiliesProminence();
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

