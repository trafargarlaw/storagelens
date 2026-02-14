# Disk Scanner (Tauri + React)

## Development

```bash
pnpm install
pnpm tauri dev
```

## Release Workflows

- macOS: `/Users/mac/Desktop/Code/disk-scanner/.github/workflows/release-macos.yml`
- Windows: `/Users/mac/Desktop/Code/disk-scanner/.github/workflows/release-windows.yml`

Windows bundle targets are configured in:

- `/Users/mac/Desktop/Code/disk-scanner/src-tauri/tauri.windows.conf.json`

## macOS Signing and Notarization

Non-secret bundle settings live in:

- `/Users/mac/Desktop/Code/disk-scanner/src-tauri/tauri.conf.json`

Release workflow:

- `/Users/mac/Desktop/Code/disk-scanner/.github/workflows/release-macos.yml`

It builds a signed/notarized macOS bundle with `pnpm tauri build`.

### Where to put signing + notarization values

This project uses API key notarization (no Apple ID/password flow).

For local builds, export these in your shell before running `pnpm tauri build`:

```bash
export APPLE_API_KEY="<App Store Connect API Key ID>"
export APPLE_API_ISSUER="<App Store Connect Issuer ID>"
export APPLE_API_KEY_PATH="/absolute/path/to/AuthKey_XXXXXX.p8"
```

Local note: you still need a valid `Developer ID Application` certificate installed
in your keychain for signing.

For CI builds, add these GitHub repository secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY_CONTENT` (entire `.p8` file contents)

- `APPLE_SIGNING_IDENTITY` is optional.

The macOS workflow writes `APPLE_API_KEY_CONTENT` to a temporary file and sets
`APPLE_API_KEY_PATH` automatically during the run.
