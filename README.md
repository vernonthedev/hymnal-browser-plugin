# SDA Hymnal Desktop + Overlay Server

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

### Electron app

```powershell
npm install
npm run dev
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
npm run build:backend
```

Then package the desktop app:

```powershell
npm run dist
```

`electron-builder` is configured for Windows (`nsis`), macOS (`dmg`), and Linux (`AppImage`, `deb`).
