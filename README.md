# Hymn Broadcast Console + Overlay Server

Electron now provides the operator control panel, while the Python backend remains the single source of truth for hymn state, overlay visibility, and live style settings. OBS or vMix still loads overlay pages from a localhost URL.

## Architecture

- `server.py`: HTTP + WebSocket backend bound to `127.0.0.1`
- `electron/`: desktop app main process, preload bridge, and renderer UI
- `overlays/`: browser-source layouts for `lowerthird`, `stage`, and `lyrics`
- `assets/`: shared overlay assets and legacy static styles
- `hymns/`: flat `*.txt` hymn files

## Development

### Python backend prerequisites

```powershell
py -3.12 -m venv env
.\env\Scripts\activate
pip install -r requirements.txt
```

> [!IMPORTANT]
> Incase those versions above are not found then please install `python3.12` using this link [Python3.12](https://www.python.org/downloads/release/python-3122/)

### Electron app

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

Build the backend executable first:

```powershell
bun run build:icons
bun run build:backend
```

Then package the desktop app:

```powershell
bun run dist
```

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
