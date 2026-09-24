# Chessical (Desktop)

Chessical is a **Vite + React** app packaged as a **Tauri** desktop application for **macOS + Windows**.

## License

Licensed under **GPL-3.0**. See `LICENSE`.

## Development

Install deps:

```bash
npm install
```

Run in a desktop window (Tauri + Vite):

```bash
npm run tauri:dev
```

### Openings data

The **Library** tab shows every opening from the [Lichess opening database](https://github.com/lichess-org/chess-openings). The **Learn** tab shows a curated set of high-level families (e.g. Sicilian, Queen's Gambit); within each family, **common complete main lines are taught before rarer sidelines**, using per-line popularity (`lineProminence` in `learn-tracks.json`).

To refresh openings from Lichess (run occasionally or after upstream changes):

```bash
npm run fetch:openings
npm run compute:learn-prominence
```

`fetch:openings` overwrites `src/data/openings.json` and refreshes track stubs in `src/data/learn-tracks.json` (preserving existing popularity fields). `compute:learn-prominence` sets family `prominence` and per-line `lineProminence` from Lichess masters explorer when `LICHESS_TOKEN` is set, or from opening-database corridor traffic otherwise. You do not need to run these to build or run the app; the repo includes generated data.

## Build installers

Build production bundles (macOS `.app` + `.dmg`, Windows installers on Windows):

```bash
npm run tauri:build
```

Tauri configuration lives in `src-tauri/tauri.conf.json`.

## Code signing / notarization (production)

### macOS (Developer ID + notarization)

- Ensure you have an Apple Developer account.
- Install a **Developer ID Application** certificate in Keychain.
- For notarization, provide credentials via environment variables (recommended in CI).

Tauri uses `src-tauri/Entitlements.plist` during bundling.

### Windows (Authenticode)

- Obtain a Windows code-signing certificate and configure signing in your build environment.
- Run Windows builds on Windows (or a Windows CI runner).
