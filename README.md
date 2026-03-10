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
