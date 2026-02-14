# storagelens (Tauri + React)

## Development

```bash
pnpm install
pnpm tauri dev
```

## Release Workflows

- macOS: `.github/workflows/release-macos.yml`
- Windows: `.github/workflows/release-windows.yml`

Both workflows now upload installers to the matching GitHub Release when the push is a tag (`v*`).

Create a release by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Download page:

- `https://github.com/<OWNER>/<REPO>/releases/tag/v0.1.0`

Windows bundle targets are configured in:

- `src-tauri/tauri.windows.conf.json`

## macOS Signing and Notarization

Non-secret bundle settings live in:

- `src-tauri/tauri.conf.json`

Release workflow:

- `.github/workflows/release-macos.yml`

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
