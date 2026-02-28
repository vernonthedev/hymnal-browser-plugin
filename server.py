import http.server
import socketserver
import threading
import json
import os
from websocket_server import WebsocketServer

PORT_HTTP = 9999
PORT_WS = 8765
BASE_DIR = os.path.dirname(__file__)

state = {
    "hymn": "1",
    "line": 0,
    "lines": []
}

def load_hymn(hymn):
    path = os.path.join(BASE_DIR, "hymns", f"{hymn}.txt")
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
    return lines

# ---------- HTTP SERVER ----------
def start_http():
    os.chdir(BASE_DIR)
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT_HTTP), handler) as httpd:
        print(f"[HTTP] Serving at http://localhost:{PORT_HTTP}")
        httpd.serve_forever()

# ---------- WEBSOCKET SERVER ----------
def on_message(client, server, message):
    global state
    data = json.loads(message)

    if data["cmd"] == "load":
        state["hymn"] = data["hymn"]
        state["lines"] = load_hymn(state["hymn"])
        state["line"] = 0

    if data["cmd"] == "next":
        if state["line"] < len(state["lines"]) - 1:
            state["line"] += 1

    if data["cmd"] == "prev":
        if state["line"] > 0:
            state["line"] -= 1

    if data["cmd"] == "show":
        pass

    payload = {
        "hymn": state["hymn"],
        "line": state["line"],
        "text": state["lines"][state["line"]] if state["lines"] else ""
    }

    server.send_message_to_all(json.dumps(payload))

def start_ws():
    server = WebsocketServer(host="0.0.0.0", port=PORT_WS)
    server.set_fn_message_received(on_message)
    print(f"[WS] WebSocket running on ws://localhost:{PORT_WS}")
    server.run_forever()

# ---------- START ----------
if __name__ == "__main__":
    print("===================================")
    print("  HYMN BROADCAST CONTROL SYSTEM")
    print("===================================")

    t1 = threading.Thread(target=start_http)
    t1.start()

    start_ws()