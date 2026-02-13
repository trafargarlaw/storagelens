# Disk Scanner (Tauri + React)

## Development

```bash
pnpm install
pnpm tauri dev
```

## macOS Signing and Notarization

Non-secret bundle settings live in:

- `src-tauri/tauri.conf.json`


Release workflow:

- `.github/workflows/release-macos.yml`

It builds a signed/notarized macOS bundle with `pnpm tauri build`.
