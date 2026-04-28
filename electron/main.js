const { app, BrowserWindow, ipcMain, shell, clipboard, Menu } = require("electron");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const http = require("http");
const WebSocket = require("ws");

const DEFAULT_HTTP_PORT = 9999;
const DEFAULT_WS_PORT = 8765;
const HEARTBEAT_INTERVAL_SECONDS = 10;
const HEARTBEAT_TIMEOUT_SECONDS = 30;
const CHANGELOG_FILE = "CHANGELOG.md";
const APP_VERSION = "2.0.0";
const HOST = "127.0.0.1";

const DEFAULT_STYLE = {
  fontSizePreset: "md",
  alignment: "center",
  safeMargin: 80,
  animation: "pop",
  speakerLabel: "",
};
const DEFAULT_PRESETS = {
  "Default": { ...DEFAULT_STYLE },
  "Stage": {
    fontSizePreset: "xl",
    alignment: "center",
    safeMargin: 120,
    animation: "fade",
    speakerLabel: "",
  },
};
const OVERLAYS = [
  { id: "lowerthird", name: "Lower Third", path: "/overlays/lowerthird.html" },
  { id: "stage", name: "Stage", path: "/overlays/stage.html" },
  { id: "lyrics", name: "Lyrics", path: "/overlays/lyrics.html" },
];

let mainWindow = null;
let hymnBroadcastServer = null;
let runtimeInfo = null;

// Backend Server Implementation
class HymnBroadcastServer {
  constructor(baseDir, dataDir, token) {
    this.state = this.initializeState(baseDir, dataDir, token);
    this.wss = null;
    this.httpServer = null;
    this.heartbeatInterval = null;
  }

  initializeState(baseDir, dataDir, token) {
    const hymnsDir = fs.existsSync(path.join(dataDir, 'hymns')) ? path.join(dataDir, 'hymns') : path.join(baseDir, 'hymns');

    const presetsPath = path.join(dataDir, 'style-presets.json');

    // Ensure data directory exists
    fs.mkdirSync(dataDir, { recursive: true });

    const state = {
      baseDir,
      dataDir,
      hymnsDir,
      presetsPath,
      token,
      httpPort: 0,
      wsPort: 0,
      connectedClients: 0,
      controlClients: 0,
      lastError: '',
      overlayClients: new Map(),
      controlClientIds: new Set(),
      presets: this.loadPresets(presetsPath),
      hymnIndex: this.buildHymnIndex(hymnsDir),
      currentHymn: "1",
      lines: this.readHymnLines("1", hymnsDir),
      lineIndex: 0,
      visible: true,
      style: { ...DEFAULT_STYLE }
    };

    return state;
  }

  loadPresets(presetsPath) {
    if (!fs.existsSync(presetsPath)) {
      const presets = { ...DEFAULT_PRESETS };
      this.savePresets(presetsPath, presets);
      return presets;
    }

    try {
      const data = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      if (typeof data === 'object' && data !== null) {
        return data;
      }
    } catch {}

    const presets = { ...DEFAULT_PRESETS };
    this.savePresets(presetsPath, presets);
    return presets;
  }

  savePresets(presetsPath, presets) {
    fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2));
  }

  readHymnLines(hymn, hymnsDir) {
    const filePath = path.join(hymnsDir, `${hymn}.txt`);
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  sortHymnPath(path) {
    const stem = path.replace(/\.txt$/, '');
    const num = parseInt(stem);
    return isNaN(num) ? [Number.MAX_SAFE_INTEGER, stem] : [num, stem];
  }

  buildHymnIndex(hymnsDir) {
    if (!fs.existsSync(hymnsDir)) return [];
    const hymnFiles = fs.readdirSync(hymnsDir)
      .filter(file => file.endsWith('.txt'))
      .sort((a, b) => {
        const [aNum] = this.sortHymnPath(a);
        const [bNum] = this.sortHymnPath(b);
        return aNum - bNum;
      });

    return hymnFiles.map(file => {
      const number = file.replace(/\.txt$/, '');
      let preview = '';
      try {
        const content = fs.readFileSync(path.join(hymnsDir, file), 'utf-8');
        const firstLine = content.split(/\r?\n/)[0]?.trim();
        if (firstLine) preview = firstLine;
      } catch {}

      return { number, preview };
    });
  }

  getStatusPayload() {
    return {
      version: APP_VERSION,
      http_port: this.state.httpPort,
      ws_port: this.state.wsPort,
      current_hymn: this.state.currentHymn,
      line_index: this.state.lineIndex,
      total_lines: this.state.lines.length,
      text: this.currentText(),
      previous_text: this.state.lineIndex > 0 ? this.state.lines[this.state.lineIndex - 1] : '',
      next_text: this.state.lineIndex + 1 < this.state.lines.length ? this.state.lines[this.state.lineIndex + 1] : '',
      visible: this.state.visible,
      connected_clients: this.state.connectedClients,
      control_clients: this.state.controlClients,
      style: this.state.style,
      presets: this.state.presets,
      overlay_profiles: OVERLAYS,
      last_error: this.state.lastError,
      token_enabled: !!this.state.token,
    };
  }

  currentText() {
    if (!this.state.lines || this.state.lineIndex >= this.state.lines.length) {
      return '';
    }
    return this.state.lines[this.state.lineIndex];
  }

  handleWebSocketConnection(ws) {
    // Mark as overlay client initially
    const clientId = Math.random() * 1000000 | 0;
    this.state.overlayClients.set(clientId, {
      lastPong: Date.now() / 1000,
      authorized: !this.state.token,
      role: 'overlay'
    });

    ws.clientId = clientId;

    // Send hello message
    ws.send(JSON.stringify({
      type: 'hello',
      requiresAuth: !!this.state.token,
      overlayProfiles: OVERLAYS,
      httpPort: this.state.httpPort,
      wsPort: this.state.wsPort,
    }));

    if (!this.state.token) {
      ws.send(JSON.stringify(this.overlayPayload('state')));
    }

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = data.toString();
        this.handleWebSocketMessage(ws, message);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    // Handle close
    ws.on('close', () => {
      this.handleWebSocketClose(ws);
    });
  }

  handleWebSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      const clientId = ws.clientId;

      if (data.cmd === 'hello') {
        this.handleHello(ws, data, clientId);
      } else if (data.cmd === 'auth') {
        this.handleAuth(ws, data, clientId);
      } else if (data.cmd === 'pong') {
        this.handlePong(clientId);
      } else {
        this.handleCommand(ws, data, clientId);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  handleHello(ws, data, clientId) {
    const role = data.role || 'overlay';
    if (role === 'control') {
      this.markClientRole(clientId, 'control');
      ws.send(JSON.stringify({ type: 'status', status: this.getStatusPayload() }));
    } else {
      this.markClientRole(clientId, 'overlay');
      ws.send(JSON.stringify(this.overlayPayload('state')));
    }
  }

  handleAuth(ws, data, clientId) {
    const overlayMeta = this.state.overlayClients.get(clientId);
    if (!overlayMeta) {
      this.markClientRole(clientId, 'overlay');
      return;
    }

    const token = data.token || '';
    overlayMeta.authorized = token === this.state.token || !this.state.token;

    if (!overlayMeta.authorized) {
      ws.send(JSON.stringify({ type: 'error', message: 'Overlay token rejected.' }));
      return;
    }

    ws.send(JSON.stringify(this.overlayPayload('state')));
  }

  handlePong(clientId) {
    const overlayMeta = this.state.overlayClients.get(clientId);
    if (overlayMeta) {
      overlayMeta.lastPong = Date.now() / 1000;
    }
  }

  handleCommand(ws, data, clientId) {
    // Check authorization for overlay clients
    if (this.state.overlayClients.has(clientId)) {
      const overlayMeta = this.state.overlayClients.get(clientId);
      if (this.state.token && !overlayMeta.authorized) {
        ws.send(JSON.stringify({ type: 'error', message: 'Overlay is not authorized.' }));
        return;
      }
    }

    const { success, error, payload } = this.processCommand(data);

    if (!success) {
      ws.send(JSON.stringify({ type: 'error', message: error }));
      ws.send(JSON.stringify({ type: 'status', status: this.getStatusPayload() }));
      return;
    }

    if (payload) {
      this.broadcast(payload);
      if (payload.type === 'hymn_index' || payload.type === 'presets') {
        ws.send(JSON.stringify(payload));
      }
    }
  }

  handleWebSocketClose(ws) {
    const clientId = ws.clientId;
    if (!clientId) return;

    if (this.state.overlayClients.has(clientId)) {
      this.state.overlayClients.delete(clientId);
    }
    if (this.state.controlClientIds.has(clientId)) {
      this.state.controlClientIds.delete(clientId);
    }

    this.updateClientCounts();
    this.broadcast(this.overlayPayload('status'));
  }

  markClientRole(clientId, role) {
    this.state.overlayClients.delete(clientId);
    this.state.controlClientIds.delete(clientId);

    if (role === 'control') {
      this.state.controlClientIds.add(clientId);
    } else {
      this.state.overlayClients.set(clientId, {
        lastPong: Date.now() / 1000,
        authorized: !this.state.token,
        role: 'overlay'
      });
    }

    this.updateClientCounts();
  }

  updateClientCounts() {
    this.state.connectedClients = this.state.overlayClients.size;
    this.state.controlClients = this.state.controlClientIds.size;
  }

  processCommand(command) {
    const cmd = command.cmd;
    if (!cmd) {
      return { success: false, error: 'Missing cmd' };
    }

    switch (cmd) {
      case 'load':
        return this.handleLoadCommand(command);
      case 'next':
        return this.handleNextCommand();
      case 'prev':
        return this.handlePrevCommand();
      case 'reset':
        return this.handleResetCommand();
      case 'blank':
        return this.handleBlankCommand();
      case 'show':
        return this.handleShowCommand();
      case 'retrigger':
      case 'ping_overlay':
        return this.handleRetriggerCommand();
      case 'update_style':
        return this.handleUpdateStyleCommand(command);
      case 'save_preset':
        return this.handleSavePresetCommand(command);
      case 'apply_preset':
        return this.handleApplyPresetCommand(command);
      case 'reload_hymns':
        return this.handleReloadHymnsCommand();
      default:
        this.state.lastError = `Unsupported command: ${cmd}`;
        return { success: false, error: this.state.lastError };
    }
  }

  handleLoadCommand(command) {
    const hymn = String(command.hymn || '').trim();
    if (!hymn) {
      this.state.lastError = 'Please enter a hymn number.';
      return { success: false, error: this.state.lastError };
    }

    const lines = this.readHymnLines(hymn, this.state.hymnsDir);
    if (!lines.length) {
      this.state.lastError = `Hymn ${hymn} was not found or is empty.`;
      return { success: false, error: this.state.lastError };
    }

    this.state.currentHymn = hymn;
    this.state.lines = lines;
    this.state.lineIndex = 0;
    this.state.visible = true;
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('state') };
  }

  handleNextCommand() {
    if (this.state.lineIndex < this.state.lines.length - 1) {
      this.state.lineIndex++;
    }
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('state') };
  }

  handlePrevCommand() {
    if (this.state.lineIndex > 0) {
      this.state.lineIndex--;
    }
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('state') };
  }

  handleResetCommand() {
    this.state.lineIndex = 0;
    this.state.visible = true;
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('state') };
  }

  handleBlankCommand() {
    this.state.visible = false;
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('visibility') };
  }

  handleShowCommand() {
    this.state.visible = true;
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('visibility') };
  }

  handleRetriggerCommand() {
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('retrigger') };
  }

  handleUpdateStyleCommand(command) {
    const style = command.style;
    if (typeof style !== 'object' || !style) {
      this.state.lastError = 'Style payload must be an object.';
      return { success: false, error: this.state.lastError };
    }

    this.state.style = { ...this.state.style, ...style };
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('style') };
  }

  handleSavePresetCommand(command) {
    const name = String(command.name || '').trim();
    if (!name) {
      this.state.lastError = 'Preset name is required.';
      return { success: false, error: this.state.lastError };
    }

    this.state.presets[name] = { ...this.state.style };
    this.savePresets(this.state.presetsPath, this.state.presets);
    this.state.lastError = '';
    return { success: true, payload: { type: 'presets', presets: this.state.presets } };
  }

  handleApplyPresetCommand(command) {
    const name = String(command.name || '').trim();
    const preset = this.state.presets[name];
    if (!preset) {
      this.state.lastError = `Preset ${name} was not found.`;
      return { success: false, error: this.state.lastError };
    }

    this.state.style = { ...preset };
    this.state.lastError = '';
    return { success: true, payload: this.overlayPayload('style') };
  }

  handleReloadHymnsCommand() {
    this.state.hymnIndex = this.buildHymnIndex(this.state.hymnsDir);
    this.state.lastError = '';
    return { success: true, payload: { type: 'hymn_index', items: this.state.hymnIndex } };
  }

  overlayPayload(event = 'state') {
    return {
      type: event,
      httpPort: this.state.httpPort,
      wsPort: this.state.wsPort,
      hymn: this.state.currentHymn,
      lineIndex: this.state.lineIndex,
      totalLines: this.state.lines.length,
      text: this.currentText(),
      visible: this.state.visible,
      style: this.state.style,
      connectedClients: this.state.connectedClients,
      controlClients: this.state.controlClients,
      error: this.state.lastError,
    };
  }

  broadcast(payload) {
    if (!this.wss) return;

    const message = JSON.stringify(payload);
    const targets = payload.type === 'state' || payload.type === 'visibility' || payload.type === 'retrigger' || payload.type === 'style'
      ? Array.from(this.wss.clients).filter(ws => {
          const clientId = ws.clientId;
          if (!clientId || !this.state.overlayClients.has(clientId)) return false;

          const overlayMeta = this.state.overlayClients.get(clientId);
          return !this.state.token || overlayMeta.authorized;
        })
      : Array.from(this.wss.clients);

    targets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now() / 1000;

      this.wss.clients.forEach(ws => {
        const clientId = ws.clientId;
        const overlayMeta = this.state.overlayClients.get(clientId);
        if (!overlayMeta) return;

        if (now - overlayMeta.lastPong > HEARTBEAT_TIMEOUT_SECONDS) {
          ws.terminate();
          return;
        }

        if (this.state.token && !overlayMeta.authorized) return;

        ws.send(JSON.stringify({ type: 'heartbeat', ts: Math.floor(now) }));
      });
    }, HEARTBEAT_INTERVAL_SECONDS * 1000);
  }

  handleHttpRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const reqPath = url.pathname;

    try {
      switch (reqPath) {
        case '/health':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: fs.existsSync(this.state.hymnsDir),
            http_port: this.state.httpPort,
            ws_port: this.state.wsPort,
          }));
          break;

        case '/status':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.getStatusPayload()));
          break;

        case '/version':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ version: APP_VERSION }));
          break;

        case '/hymns':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ items: this.state.hymnIndex }));
          break;

        case '/presets':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ items: this.state.presets }));
          break;

        default:
          // Serve static files
          const filePath = path.join(this.state.baseDir, reqPath);
          if (fs.existsSync(filePath) && !filePath.includes('..')) {
            const content = fs.readFileSync(filePath);
            const ext = reqPath.split('.').pop()?.toLowerCase();
            const contentType = ext === 'html' ? 'text/html' :
                              ext === 'css' ? 'text/css' :
                              ext === 'js' ? 'application/javascript' :
                              'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          }
          break;
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  async start(httpPort, wsPort) {
    this.state.httpPort = httpPort;
    this.state.wsPort = wsPort;

    // Create HTTP server
    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    // Create WebSocket server
    this.wss = new WebSocket.Server({
      server: this.httpServer,
      perMessageDeflate: false
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    // Handle WebSocket connections
    this.wss.on('connection', (ws) => {
      this.handleWebSocketConnection(ws);
    });

    return new Promise((resolve) => {
      this.httpServer.listen(httpPort, HOST, () => {
        console.log(`HTTP server listening on http://${HOST}:${httpPort}`);
        console.log(`WebSocket server ready on ws://${HOST}:${httpPort}`);
        this.startHeartbeat();
        resolve();
      });
    });
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
  }
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getRepoReadablePath(relativePath) {
  if (app.isPackaged) {
    const resourcePath = path.join(process.resourcesPath, relativePath);
    if (fs.existsSync(resourcePath)) {
      return resourcePath;
    }
    return path.join(process.resourcesPath, "app.asar.unpacked", relativePath);
  }
  return path.join(app.getAppPath(), relativePath);
}

function getLatestReleaseInfo() {
  const fallbackVersion = app.getVersion();
  const changelogPath = getRepoReadablePath(CHANGELOG_FILE);

  if (!fs.existsSync(changelogPath)) {
    return {
      version: fallbackVersion,
      releasedOn: null,
      summary: [],
      source: "app",
    };
  }

  try {
    const changelog = fs.readFileSync(changelogPath, "utf8");
    const lines = changelog.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => /^#\s*\[?\d+\.\d+\.\d+\]?/.test(line));

    if (headerIndex === -1) {
      return {
        version: fallbackVersion,
        releasedOn: null,
        summary: [],
        source: "app",
      };
    }

    const header = lines[headerIndex];
    const versionMatch = header.match(/(\d+\.\d+\.\d+)/);
    const dateMatch = header.match(/\((\d{4}-\d{2}-\d{2})\)/);
    const nextHeaderIndex = lines.findIndex(
      (line, index) => index > headerIndex && /^#\s*\[?\d+\.\d+\.\d+\]?/.test(line),
    );
    const sectionLines = lines.slice(
      headerIndex + 1,
      nextHeaderIndex === -1 ? lines.length : nextHeaderIndex,
    );
    const summary = sectionLines
      .filter((line) => line.trim().startsWith("* "))
      .slice(0, 6)
      .map((line) => line.replace(/^\*\s*/, "").replace(/\s*\(\[?.*$/, "").trim());

    return {
      version: versionMatch ? versionMatch[1] : fallbackVersion,
      releasedOn: dateMatch ? dateMatch[1] : null,
      summary,
      source: "changelog",
    };
  } catch {
    return {
      version: fallbackVersion,
      releasedOn: null,
      summary: [],
      source: "app",
    };
  }
}

function getAppDataRoot() {
  return path.join(app.getPath("appData"), "SDA Hymnal Desktop");
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function seedHymnsDir(targetHymnsDir) {
  ensureDirectory(targetHymnsDir);
  const sourceDir = app.isPackaged
    ? getRepoReadablePath("hymns")
    : path.join(app.getAppPath(), "hymns");

  if (!fs.existsSync(sourceDir)) {
    return;
  }

  const hasFiles = fs.readdirSync(targetHymnsDir).some((entry) => entry.endsWith(".txt"));
  if (hasFiles) {
    return;
  }

  for (const fileName of fs.readdirSync(sourceDir)) {
    if (!fileName.endsWith(".txt")) {
      continue;
    }
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(targetHymnsDir, fileName));
  }
}

function loadOrCreateRuntimeConfig() {
  const root = getAppDataRoot();
  ensureDirectory(root);
  const configPath = path.join(root, "runtime.json");
  let config = {};

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      config = {};
    }
  }

  if (!config.token) {
    config.token = crypto.randomBytes(18).toString("hex");
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function choosePort(preferredPort) {
  if (await checkPort(preferredPort)) {
    return preferredPort;
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : preferredPort;
      server.close(() => resolve(port));
    });
  });
}

// Backend is now integrated directly into main process

function overlayUrlsFromRuntime(info) {
  return info.overlayProfiles.map((overlay) => ({
    ...overlay,
    url: `http://127.0.0.1:${info.httpPort}${overlay.path}?token=${encodeURIComponent(info.token)}&wsPort=${info.wsPort}`,
  }));
}

function overlayUrlsFromRuntime(info) {
  return info.overlayProfiles.map((overlay) => ({
    ...overlay,
    url: `http://127.0.0.1:${info.httpPort}${overlay.path}?token=${encodeURIComponent(info.token)}&wsPort=${info.wsPort}`,
  }));
}

// Backend is now integrated, no health check needed

function monitorBackendOutput(stream, onLine) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        onLine(line);
      }
    }
  });
}

async function startBackend() {
  if (hymnBroadcastServer) {
    return;
  }

  try {
    const config = loadOrCreateRuntimeConfig();
    const appDataRoot = getAppDataRoot();
    const dataDir = path.join(appDataRoot, "data");
    const hymnsDir = path.join(dataDir, "hymns");
    ensureDirectory(dataDir);
    seedHymnsDir(hymnsDir);

    const httpPort = await choosePort(DEFAULT_HTTP_PORT);
    const wsPort = await choosePort(DEFAULT_WS_PORT);
    const baseDir = app.isPackaged ? process.resourcesPath : app.getAppPath();



    sendToRenderer("backend-event", {
      type: "lifecycle",
      phase: "starting",
      message: "Server starting",
    });

    hymnBroadcastServer = new HymnBroadcastServer(baseDir, dataDir, config.token);
    await hymnBroadcastServer.start(httpPort, wsPort);

    runtimeInfo = {
      version: APP_VERSION,
      httpPort: httpPort,
      wsPort: wsPort,
      dataDir: dataDir,
      hymnsDir: hymnsDir,
      token: config.token,
      overlayProfiles: OVERLAYS,
      overlayUrls: [],
    };
    runtimeInfo.overlayUrls = overlayUrlsFromRuntime(runtimeInfo);

    console.log("Sending runtime event to renderer");
    sendToRenderer("backend-event", { type: "runtime", runtime: runtimeInfo });
    sendToRenderer("backend-event", {
      type: "lifecycle",
      phase: "running",
      message: "Server running",
    });
  } catch (error) {
    console.error('Failed to start backend:', error);
    sendToRenderer("backend-event", {
      type: "toast",
      level: "error",
      message: `Failed to start backend: ${error.message}`,
    });
  }
}

function stopBackend() {
  if (hymnBroadcastServer) {
    hymnBroadcastServer.stop();
    hymnBroadcastServer = null;
  }
  runtimeInfo = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 1180,
    minHeight: 760,
    maxWidth: 1180,
    maxHeight: 760,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0a0c10",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}



// Disable GPU acceleration to prevent crashes in headless environments
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--disable-software-rasterizer');

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  createWindow();
  await startBackend();

  ipcMain.handle("runtime:get", async () => runtimeInfo);
  ipcMain.handle("clipboard:copy", async (_event, text) => {
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle("shell:openExternal", async (_event, target) => {
    await shell.openExternal(target);
    return true;
  });
  ipcMain.handle("shell:openPath", async (_event, target) => {
    await shell.openPath(target);
    return true;
  });
  ipcMain.handle("app:getVersion", async () => app.getVersion());
  ipcMain.handle("app:getReleaseInfo", async () => getLatestReleaseInfo());
  ipcMain.handle("window:minimize", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return true;
  });
  ipcMain.handle("window:close", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    return true;
  });
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  stopBackend();
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
