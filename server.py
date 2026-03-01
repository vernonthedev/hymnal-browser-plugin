import argparse
import http.server
import json
import os
import socket
import socketserver
import sys
import threading
import time
import urllib.parse
from pathlib import Path
from typing import Any

from websocket_server import WebsocketServer

HOST = "127.0.0.1"
APP_VERSION = "2.0.0"
HEARTBEAT_INTERVAL_SECONDS = 10
HEARTBEAT_TIMEOUT_SECONDS = 30
DEFAULT_STYLE = {
    "fontSizePreset": "md",
    "alignment": "center",
    "safeMargin": 80,
    "animation": "pop",
    "backgroundGradient": "dark",
    "backgroundOpacity": 0.55,
    "speakerLabel": "",
}
DEFAULT_PRESETS = {
    "Default": DEFAULT_STYLE.copy(),
    "Stage": {
        "fontSizePreset": "xl",
        "alignment": "center",
        "safeMargin": 120,
        "animation": "fade",
        "backgroundGradient": "warm",
        "backgroundOpacity": 0.35,
        "speakerLabel": "",
    },
}
OVERLAYS = [
    {"id": "lowerthird", "name": "Lower Third", "path": "/overlays/lowerthird.html"},
    {"id": "stage", "name": "Stage", "path": "/overlays/stage.html"},
    {"id": "lyrics", "name": "Lyrics", "path": "/overlays/lyrics.html"},
]


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


class AppState:
    def __init__(self, base_dir: Path, data_dir: Path, token: str | None):
        self.base_dir = base_dir
        self.data_dir = data_dir
        self.hymns_dir = data_dir / "hymns"
        if not self.hymns_dir.exists():
            self.hymns_dir = base_dir / "hymns"
        self.presets_path = data_dir / "style-presets.json"
        self.state_lock = threading.Lock()
        self.presets = self._load_presets()
        self.hymn_index = self._build_hymn_index()
        self.current_hymn = "1"
        self.lines = self._read_hymn_lines("1")
        self.line_index = 0
        self.visible = True
        self.style = self.presets.get("Default", DEFAULT_STYLE.copy()).copy()
        self.token = token
        self.http_port = 0
        self.ws_port = 0
        self.connected_clients = 0
        self.control_clients = 0
        self.last_error = ""
        self.overlay_clients: dict[int, dict[str, Any]] = {}
        self.control_client_ids: set[int] = set()

    def _load_presets(self) -> dict[str, dict[str, Any]]:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if not self.presets_path.exists():
            presets = {name: preset.copy() for name, preset in DEFAULT_PRESETS.items()}
            self._save_presets(presets)
            return presets
        try:
            with self.presets_path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict) and data:
                return data
        except (OSError, json.JSONDecodeError):
            pass
        presets = {name: preset.copy() for name, preset in DEFAULT_PRESETS.items()}
        self._save_presets(presets)
        return presets

    def _save_presets(self, presets: dict[str, dict[str, Any]]) -> None:
        with self.presets_path.open("w", encoding="utf-8") as handle:
            json.dump(presets, handle, indent=2)

    def _read_hymn_lines(self, hymn: str) -> list[str]:
        path = self.hymns_dir / f"{hymn}.txt"
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as handle:
            return [line.strip() for line in handle.readlines() if line.strip()]

    def _build_hymn_index(self) -> list[dict[str, str]]:
        if not self.hymns_dir.exists():
            return []
        hymns: list[dict[str, str]] = []
        for hymn_path in sorted(self.hymns_dir.glob("*.txt"), key=self._sort_hymn_path):
            number = hymn_path.stem
            try:
                with hymn_path.open("r", encoding="utf-8") as handle:
                    first_line = next((line.strip() for line in handle if line.strip()), "")
            except OSError:
                first_line = ""
            hymns.append({"number": number, "preview": first_line})
        return hymns

    @staticmethod
    def _sort_hymn_path(path: Path) -> tuple[int, str]:
        try:
            return (int(path.stem), path.stem)
        except ValueError:
            return (sys.maxsize, path.stem)

    def reload_hymn_index(self) -> list[dict[str, str]]:
        with self.state_lock:
            self.hymn_index = self._build_hymn_index()
            return list(self.hymn_index)

    def current_text(self) -> str:
        if not self.lines or self.line_index >= len(self.lines):
            return ""
        return self.lines[self.line_index]

    def overlay_payload(self, event: str = "state") -> dict[str, Any]:
        return {
            "type": event,
            "httpPort": self.http_port,
            "wsPort": self.ws_port,
            "hymn": self.current_hymn,
            "lineIndex": self.line_index,
            "totalLines": len(self.lines),
            "text": self.current_text(),
            "visible": self.visible,
            "style": self.style,
            "connectedClients": self.connected_clients,
            "controlClients": self.control_clients,
            "error": self.last_error,
        }

    def status_payload(self) -> dict[str, Any]:
        with self.state_lock:
            return {
                "version": APP_VERSION,
                "http_port": self.http_port,
                "ws_port": self.ws_port,
                "current_hymn": self.current_hymn,
                "line_index": self.line_index,
                "total_lines": len(self.lines),
                "text": self.current_text(),
                "previous_text": self.lines[self.line_index - 1] if self.line_index > 0 and self.lines else "",
                "next_text": self.lines[self.line_index + 1] if self.line_index + 1 < len(self.lines) else "",
                "visible": self.visible,
                "connected_clients": self.connected_clients,
                "control_clients": self.control_clients,
                "style": self.style,
                "presets": self.presets,
                "overlay_profiles": OVERLAYS,
                "last_error": self.last_error,
                "token_enabled": bool(self.token),
            }

    def handle_command(self, command: dict[str, Any]) -> tuple[bool, str, dict[str, Any] | None]:
        cmd = command.get("cmd")
        if not cmd:
            return False, "Missing cmd", None

        with self.state_lock:
            if cmd == "load":
                hymn = str(command.get("hymn", "")).strip()
                if not hymn:
                    self.last_error = "Please enter a hymn number."
                    return False, self.last_error, None
                lines = self._read_hymn_lines(hymn)
                if not lines:
                    self.last_error = f"Hymn {hymn} was not found or is empty."
                    return False, self.last_error, None
                self.current_hymn = hymn
                self.lines = lines
                self.line_index = 0
                self.visible = True
                self.last_error = ""
                return True, "", self.overlay_payload("state")

            if cmd == "next":
                if self.line_index < len(self.lines) - 1:
                    self.line_index += 1
                self.last_error = ""
                return True, "", self.overlay_payload("state")

            if cmd == "prev":
                if self.line_index > 0:
                    self.line_index -= 1
                self.last_error = ""
                return True, "", self.overlay_payload("state")

            if cmd == "reset":
                self.line_index = 0
                self.visible = True
                self.last_error = ""
                return True, "", self.overlay_payload("state")

            if cmd == "blank":
                self.visible = False
                self.last_error = ""
                return True, "", self.overlay_payload("visibility")

            if cmd == "show":
                self.visible = True
                self.last_error = ""
                return True, "", self.overlay_payload("visibility")

            if cmd in {"retrigger", "ping_overlay"}:
                self.last_error = ""
                return True, "", self.overlay_payload("retrigger")

            if cmd == "update_style":
                style = command.get("style", {})
                if not isinstance(style, dict):
                    self.last_error = "Style payload must be an object."
                    return False, self.last_error, None
                self.style = {**self.style, **style}
                self.last_error = ""
                return True, "", self.overlay_payload("style")

            if cmd == "save_preset":
                name = str(command.get("name", "")).strip()
                if not name:
                    self.last_error = "Preset name is required."
                    return False, self.last_error, None
                self.presets[name] = dict(self.style)
                self._save_presets(self.presets)
                self.last_error = ""
                return True, "", {"type": "presets", "presets": self.presets}

            if cmd == "apply_preset":
                name = str(command.get("name", "")).strip()
                preset = self.presets.get(name)
                if not preset:
                    self.last_error = f"Preset {name} was not found."
                    return False, self.last_error, None
                self.style = dict(preset)
                self.last_error = ""
                return True, "", self.overlay_payload("style")

            if cmd == "reload_hymns":
                index = self.reload_hymn_index()
                self.last_error = ""
                return True, "", {"type": "hymn_index", "items": index}

            self.last_error = f"Unsupported command: {cmd}"
            return False, self.last_error, None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SDA Hymnal overlay backend")
    parser.add_argument("--http-port", type=int, default=9999)
    parser.add_argument("--ws-port", type=int, default=8765)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--token", type=str, default="")
    return parser.parse_args()


def bind_port(preferred_port: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, preferred_port))
        return sock.getsockname()[1]


class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "HymnalHTTP/2.0"

    def __init__(self, *args: Any, directory: str | None = None, app_state: AppState | None = None, **kwargs: Any):
        self.app_state = app_state
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        sys.stdout.write(json.dumps({"event": "http_log", "message": format % args}) + "\n")
        sys.stdout.flush()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self._send_json(
                200 if self.app_state and self.app_state.hymns_dir.exists() else 503,
                {
                    "ok": bool(self.app_state and self.app_state.hymns_dir.exists()),
                    "http_port": self.app_state.http_port if self.app_state else 0,
                    "ws_port": self.app_state.ws_port if self.app_state else 0,
                },
            )
            return

        if parsed.path == "/status":
            self._send_json(200, self.app_state.status_payload() if self.app_state else {})
            return

        if parsed.path == "/version":
            self._send_json(200, {"version": APP_VERSION})
            return

        if parsed.path == "/hymns":
            self._send_json(200, {"items": self.app_state.hymn_index if self.app_state else []})
            return

        if parsed.path == "/presets":
            self._send_json(200, {"items": self.app_state.presets if self.app_state else {}})
            return

        self.path = parsed.path
        super().do_GET()

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def send_json(server: WebsocketServer, client: dict[str, Any], payload: dict[str, Any]) -> None:
    if not client:
        return
    server.send_message(client, json.dumps(payload))


def broadcast(server: WebsocketServer, payload: dict[str, Any], targets: list[dict[str, Any]] | None = None) -> None:
    message = json.dumps(payload)
    for client in targets or list(server.clients):
        if not client:
            continue
        server.send_message(client, message)


def mark_client_role(app_state: AppState, client_id: int, role: str) -> None:
    app_state.overlay_clients.pop(client_id, None)
    app_state.control_client_ids.discard(client_id)

    if role == "control":
        app_state.control_client_ids.add(client_id)
        app_state.control_clients = len(app_state.control_client_ids)
        app_state.connected_clients = len(app_state.overlay_clients)
        return
    app_state.overlay_clients[client_id] = {
        "last_pong": time.time(),
        "authorized": not app_state.token,
        "role": "overlay",
    }
    app_state.connected_clients = len(app_state.overlay_clients)
    app_state.control_clients = len(app_state.control_client_ids)


def start_http_server(app_state: AppState) -> ThreadingTCPServer:
    def handler(*args: Any, **kwargs: Any) -> None:
        AppRequestHandler(*args, directory=str(app_state.base_dir), app_state=app_state, **kwargs)

    http_server = ThreadingTCPServer((HOST, app_state.http_port), handler)
    threading.Thread(target=http_server.serve_forever, daemon=True).start()
    return http_server


def start_websocket_server(app_state: AppState) -> WebsocketServer:
    ws_server = WebsocketServer(host=HOST, port=app_state.ws_port, loglevel=0)

    def new_client(client: dict[str, Any], server: WebsocketServer) -> None:
        if not client:
            return
        mark_client_role(app_state, client["id"], "overlay")
        send_json(
            server,
            client,
            {
                "type": "hello",
                "requiresAuth": bool(app_state.token),
                "overlayProfiles": OVERLAYS,
                "httpPort": app_state.http_port,
                "wsPort": app_state.ws_port,
            },
        )
        if not app_state.token:
            send_json(server, client, app_state.overlay_payload("state"))

    def client_left(client: dict[str, Any], server: WebsocketServer) -> None:
        if not client:
            return
        client_id = client["id"]
        if client_id in app_state.overlay_clients:
            app_state.overlay_clients.pop(client_id, None)
            app_state.connected_clients = len(app_state.overlay_clients)
        if client_id in app_state.control_client_ids:
            app_state.control_client_ids.discard(client_id)
            app_state.control_clients = len(app_state.control_client_ids)
        broadcast(server, app_state.overlay_payload("status"))

    def message_received(client: dict[str, Any], server: WebsocketServer, raw_message: str) -> None:
        if not client:
            return
        try:
            message = json.loads(raw_message)
        except json.JSONDecodeError:
            send_json(server, client, {"type": "error", "message": "Invalid JSON payload."})
            return

        cmd = message.get("cmd")
        client_id = client["id"]
        if cmd == "hello":
            role = str(message.get("role", "overlay"))
            if role == "control":
                mark_client_role(app_state, client_id, "control")
                send_json(server, client, {"type": "status", "status": app_state.status_payload()})
            else:
                mark_client_role(app_state, client_id, "overlay")
                send_json(server, client, app_state.overlay_payload("state"))
            return

        if cmd == "auth":
            overlay_meta = app_state.overlay_clients.get(client_id)
            if overlay_meta is None:
                mark_client_role(app_state, client_id, "overlay")
                overlay_meta = app_state.overlay_clients[client_id]
            token = str(message.get("token", ""))
            overlay_meta["authorized"] = token == app_state.token if app_state.token else True
            if not overlay_meta["authorized"]:
                send_json(server, client, {"type": "error", "message": "Overlay token rejected."})
                return
            send_json(server, client, app_state.overlay_payload("state"))
            return

        if cmd == "pong":
            overlay_meta = app_state.overlay_clients.get(client_id)
            if overlay_meta:
                overlay_meta["last_pong"] = time.time()
            return

        if client_id in app_state.overlay_clients:
            overlay_meta = app_state.overlay_clients[client_id]
            if app_state.token and not overlay_meta.get("authorized"):
                send_json(server, client, {"type": "error", "message": "Overlay is not authorized."})
                return

        ok, error_message, payload = app_state.handle_command(message)
        if not ok:
            send_json(server, client, {"type": "error", "message": error_message})
            send_json(server, client, {"type": "status", "status": app_state.status_payload()})
            return

        if payload:
            if payload.get("type") in {"state", "visibility", "retrigger", "style"}:
                authorized_overlays = [
                    overlay_client
                    for overlay_client in server.clients
                    if overlay_client
                    and overlay_client["id"] in app_state.overlay_clients
                    and (
                        not app_state.token
                        or app_state.overlay_clients[overlay_client["id"]].get("authorized")
                    )
                ]
                broadcast(server, payload, authorized_overlays)
            broadcast(server, {"type": "status", "status": app_state.status_payload()})
            if payload.get("type") in {"hymn_index", "presets"}:
                send_json(server, client, payload)

    ws_server.set_fn_new_client(new_client)
    ws_server.set_fn_client_left(client_left)
    ws_server.set_fn_message_received(message_received)
    threading.Thread(target=ws_server.run_forever, daemon=True).start()
    return ws_server


def start_heartbeat(ws_server: WebsocketServer, app_state: AppState) -> threading.Thread:
    def loop() -> None:
        while True:
            time.sleep(HEARTBEAT_INTERVAL_SECONDS)
            now = time.time()
            for client in list(ws_server.clients):
                overlay_meta = app_state.overlay_clients.get(client["id"])
                if not overlay_meta:
                    continue
                if now - overlay_meta.get("last_pong", now) > HEARTBEAT_TIMEOUT_SECONDS:
                    try:
                        client["handler"].finish()
                    except Exception:
                        pass
                    continue
                if app_state.token and not overlay_meta.get("authorized"):
                    continue
                send_json(ws_server, client, {"type": "heartbeat", "ts": int(now)})

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return thread


def emit_ready(app_state: AppState) -> None:
    payload = {
        "event": "ready",
        "version": APP_VERSION,
        "http_port": app_state.http_port,
        "ws_port": app_state.ws_port,
        "data_dir": str(app_state.data_dir),
        "hymns_dir": str(app_state.hymns_dir),
        "overlay_profiles": OVERLAYS,
    }
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main() -> None:
    args = parse_args()
    base_dir = Path(__file__).resolve().parent
    data_dir = args.data_dir.resolve()
    app_state = AppState(base_dir=base_dir, data_dir=data_dir, token=args.token or None)
    app_state.http_port = bind_port(args.http_port)
    app_state.ws_port = bind_port(args.ws_port)

    http_server = start_http_server(app_state)
    ws_server = start_websocket_server(app_state)
    start_heartbeat(ws_server, app_state)
    emit_ready(app_state)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        ws_server.shutdown_gracefully()
        http_server.shutdown()
        http_server.server_close()


if __name__ == "__main__":
    main()
