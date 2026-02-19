# StorageLens

StorageLens is a desktop disk scanner built with Tauri + React. It scans a volume
or folder, visualizes where space is used, and lets you drill down quickly.

## Features

- Fast recursive scan with progress updates
- Treemap + folder tree for browsing large directories
- Cached recent scan results
- Reveal selected files/folders in the system file manager
- Cross-platform packaging via Tauri (macOS and Windows workflows included)

## Tech Stack

- Tauri v2 (Rust backend)
- React + TypeScript + Vite
- TanStack Router
- Tailwind CSS

## Local Development

```bash
pnpm install
pnpm tauri dev
```

## Production Build

```bash
pnpm tauri build
```

Windows bundle targets are configured in `src-tauri/tauri.windows.conf.json`.

## Release Workflows

- macOS: `.github/workflows/release-macos.yml`
- Windows: `.github/workflows/release-windows.yml`

Tag pushes matching `v*` publish artifacts to GitHub Releases.

```bash
git tag v0.2.0
git push origin v0.2.0
```

Release URL pattern:

- `https://github.com/<OWNER>/<REPO>/releases/tag/v0.2.0`
