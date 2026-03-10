// Curated list of high-level opening families for Chessical.
// Each family corresponds to a single course under `openings -> learn`.
// We deliberately keep this list reasonably small (~20) and high-level.

export const openingFamilies = [
  {
    id: "kings-pawn-game",
    name: "King's Pawn Game",
    lichessNamePrefixes: ["King's Pawn Game"],
    maxLines: 6,
  },
  {
    id: "italian",
    name: "Italian Game",
    lichessNamePrefixes: ["Italian Game"],
    maxLines: 8,
  },
  {
    id: "ruy-lopez",
    name: "Ruy Lopez",
    lichessNamePrefixes: ["Ruy Lopez"],
    maxLines: 8,
  },
  {
    id: "scotch",
    name: "Scotch Game",
    lichessNamePrefixes: ["Scotch Game"],
    maxLines: 6,
  },
  {
    id: "four-knights",
    name: "Four Knights Game",
    lichessNamePrefixes: ["Four Knights Game"],
    maxLines: 6,
  },
  {
    id: "sicilian",
    name: "Sicilian Defense",
    lichessNamePrefixes: ["Sicilian Defense"],
    maxLines: 10,
  },
  {
    id: "french",
    name: "French Defense",
    lichessNamePrefixes: ["French Defense"],
    maxLines: 8,
  },
  {
    id: "caro-kann",
    name: "Caro-Kann Defense",
    lichessNamePrefixes: ["Caro-Kann Defense"],
    maxLines: 6,
  },
  {
    id: "pirc",
    name: "Pirc Defense",
    lichessNamePrefixes: ["Pirc Defense"],
    maxLines: 6,
  },
  {
    id: "scandinavian",
    name: "Scandinavian Defense",
    lichessNamePrefixes: ["Scandinavian Defense"],
    maxLines: 6,
  },
  {
    id: "queens-gambit",
    name: "Queen's Gambit",
    lichessNamePrefixes: [
      "Queen's Gambit",
      "Queen's Gambit Declined",
      "Queen's Gambit Accepted",
    ],
    maxLines: 10,
  },
  {
    id: "slav",
    name: "Slav Defense",
    lichessNamePrefixes: ["Slav Defense", "Semi-Slav Defense"],
    maxLines: 8,
  },
  {
    id: "kings-indian",
    name: "King's Indian Defense",
    lichessNamePrefixes: ["King's Indian Defense"],
    maxLines: 8,
  },
  {
    id: "gruenfeld",
    name: "Grünfeld Defense",
    lichessNamePrefixes: ["Grünfeld Defense", "Grunfeld Defense"],
    maxLines: 6,
  },
  {
    id: "queens-indian",
    name: "Queen's Indian Defense",
    lichessNamePrefixes: ["Queen's Indian Defense"],
    maxLines: 6,
  },
  {
    id: "nimzo-indian",
    name: "Nimzo-Indian Defense",
    lichessNamePrefixes: ["Nimzo-Indian Defense"],
    maxLines: 6,
  },
  {
    id: "benoni",
    name: "Benoni Defense",
    lichessNamePrefixes: ["Benoni Defense", "Old Benoni Defense"],
    maxLines: 6,
  },
  {
    id: "benko",
    name: "Benko Gambit",
    lichessNamePrefixes: ["Benko Gambit"],
    maxLines: 4,
  },
  {
    id: "english",
    name: "English Opening",
    lichessNamePrefixes: ["English Opening", "Symmetrical English"],
    maxLines: 10,
    preferredResponses: ["e5", "c5", "e6", "g6", "c6", "d5", "Nc6", "f5", "b5", "g5"],
  },
  {
    id: "reti",
    name: "Reti Opening",
    lichessNamePrefixes: ["Reti Opening"],
    maxLines: 6,
  },
  {
    id: "catalan",
    name: "Catalan Opening",
    lichessNamePrefixes: ["Catalan Opening"],
    maxLines: 6,
  },
  {
    id: "dutch",
    name: "Dutch Defense",
    lichessNamePrefixes: ["Dutch Defense"],
    maxLines: 6,
  },
];

