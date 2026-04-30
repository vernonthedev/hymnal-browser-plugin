# Hymn Broadcast Console + Overlay Server

A unified Electron application for managing hymn overlays during live broadcasts. The backend is now integrated directly into the Electron main process, handling both HTTP and WebSocket services for a seamless, standalone experience.

<img width="1230" height="794" alt="Screenshot 2026-03-01 151446" src="https://github.com/user-attachments/assets/56296449-293f-4e0c-b5f4-3a06a515b919" />

## Architecture

- **Integrated Backend**: Node.js HTTP + WebSocket server built into the Electron main process (replacing the legacy Python server).
- `electron/`: desktop app main process, preload bridge, and renderer UI
- `overlays/`: browser-source layouts for `lowerthird`, `stage`, and `lyrics`
- `assets/`: shared overlay assets and legacy static styles
- `hymns/`: flat `*.txt` hymn files

## Development

### Prerequisites

- [Bun](https://bun.sh/) (preferred) or [Node.js](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/) (required only for building app icons)

### Getting Started

```powershell
bun install
bun dev
```

The Electron app starts the backend automatically, chooses open ports if `9999` or `8765` are busy, and shows the active overlay URLs inside the UI.

## Overlay URLs

Typical local URLs look like:

```text
http://127.0.0.1:9999/overlays/lowerthird.html?token=...&wsPort=8765
http://127.0.0.1:9999/overlays/stage.html?token=...&wsPort=8765
http://127.0.0.1:9999/overlays/lyrics.html?token=...&wsPort=8765
```

Paste the URL shown in the Electron app into an OBS or vMix browser source.

## Packaging

To create a production build for your platform:

```powershell
bun run build:icons
bun run dist
```

If generated icons are missing, packaging commands now fail early with a clear preflight error telling you to run `bun run build:icons`.

Platform-specific packaging commands:

```powershell
bun run dist:win
bun run dist:mac
bun run dist:linux
```

`electron-builder` is configured for Windows (`nsis`), macOS (`dmg`), and Linux (`AppImage`, `deb`).

## Automated Releases

Pushes to `main` run semantic-release, update `CHANGELOG.md`, create a GitHub release, generate app icons from `assets/logo.png`, and then build platform installers for:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: `.AppImage` and `.deb`

Those installer files are uploaded to the GitHub release automatically.

Optional code-signing and notarization secrets for CI:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## OBS or VMIX Setup

Add New Browser Source
URL:
Replace ... with the token and wsPort shown in the Electron app

```http
# For the lower third overlay
http://127.0.0.1:9999/overlays/lowerthird.html?token=...&wsPort=8765
# For the stage overlay
http://127.0.0.1:9999/overlays/stage.html?token=...&wsPort=8765
# For the lyrics overlay
http://127.0.0.1:9999/overlays/lyrics.html?token=...&wsPort=8765
```

Size:

```http
1920 -->width
1080 -->height
```

## Contributing

> Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.
> Please check out the [Contributing Guide](CONTRIBUTING.md) to get started.

Made with love 💖 by @[vernonthedev](https://github.com/vernonthedev)
