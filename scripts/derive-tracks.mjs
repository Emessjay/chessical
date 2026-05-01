#!/usr/bin/env node
// One-off derivation: convert learn-families.json → learn-tracks.json,
// fanning each family out to one or two tracks based on which sides are
// worth studying.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAMILIES_PATH = join(__dirname, "..", "src", "data", "learn-families.json");
const TRACKS_PATH = join(__dirname, "..", "src", "data", "learn-tracks.json");

// Side allocation per family id.
const BOTH = new Set([
  "kings-pawn-game",
  "italian",
  "ruy-lopez",
  "scotch",
  "four-knights",
  "sicilian",
  "french",
  "queens-gambit",
  "kings-indian",
]);
const WHITE_ONLY = new Set(["english", "reti", "catalan"]);
const BLACK_ONLY = new Set([
  "caro-kann",
  "pirc",
  "scandinavian",
  "slav",
  "gruenfeld",
  "queens-indian",
  "nimzo-indian",
  "benoni",
  "benko",
  "dutch",
]);

function sidesFor(familyId) {
  if (BOTH.has(familyId)) return ["white", "black"];
  if (WHITE_ONLY.has(familyId)) return ["white"];
  if (BLACK_ONLY.has(familyId)) return ["black"];
  throw new Error(`Family ${familyId} has no side allocation`);
}

const families = JSON.parse(readFileSync(FAMILIES_PATH, "utf8"));
const tracks = [];
for (const fam of families) {
  for (const side of sidesFor(fam.id)) {
    tracks.push({
      id: `${fam.id}-${side}`,
      name: fam.name,
      side,
      namePrefixes: fam.namePrefixes,
      ...(fam.maxLines != null ? { maxLines: fam.maxLines } : {}),
      ...(fam.prominence != null ? { prominence: fam.prominence } : {}),
      ...(fam.eco != null ? { eco: fam.eco } : {}),
      ...(fam.preferredResponses != null
        ? { preferredResponses: fam.preferredResponses }
        : {}),
      ...(fam.lineProminence != null
        ? { lineProminence: fam.lineProminence }
        : {}),
    });
  }
}

writeFileSync(TRACKS_PATH, JSON.stringify(tracks, null, 2) + "\n");
console.log(`Wrote ${tracks.length} tracks → ${TRACKS_PATH}`);
