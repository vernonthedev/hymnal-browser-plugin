const { app, BrowserWindow, ipcMain, shell, clipboard, Menu } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");

const DEFAULT_HTTP_PORT = 9999;
const DEFAULT_WS_PORT = 8765;
const HEALTH_TIMEOUT_MS = 15000;
const RESTART_BACKOFF_MS = [1000, 3000, 5000, 10000];
const CHANGELOG_FILE = "CHANGELOG.md";

let mainWindow = null;
let backendProcess = null;
let runtimeInfo = null;
let restartAttempt = 0;
let shuttingDown = false;
let backendExitedUnexpectedly = false;
let restartTimer = null;
let fatalBackendError = null;

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

function resolveBackendCommand() {
  const unpackedRoot = path.join(process.resourcesPath, "backend");
  const executableName = process.platform === "win32" ? "server.exe" : "server";
  const packagedExecutable = path.join(unpackedRoot, executableName);
  if (app.isPackaged && fs.existsSync(packagedExecutable)) {
    return { command: packagedExecutable, args: [] };
  }

  const repoRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const localVenvPython =
    process.platform === "win32"
      ? path.join(repoRoot, "env", "Scripts", "python.exe")
      : path.join(repoRoot, "env", "bin", "python");
  if (fs.existsSync(localVenvPython)) {
    return {
      command: localVenvPython,
      args: [],
    };
  }

  const localLauncher = process.platform === "win32" ? "py" : "python3.12";
  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "server.py")
    : path.join(app.getAppPath(), "server.py");
  return {
    command: localLauncher,
    args: process.platform === "win32" ? ["-3.12", scriptPath] : [scriptPath],
  };
}

function isFatalBackendLine(line) {
  return (
    line.includes("ModuleNotFoundError") ||
    line.includes("ImportError") ||
    line.includes("No module named")
  );
}

function overlayUrlsFromRuntime(info) {
  return info.overlayProfiles.map((overlay) => ({
    ...overlay,
    url: `http://127.0.0.1:${info.httpPort}${overlay.path}?token=${encodeURIComponent(info.token)}&wsPort=${info.wsPort}`,
  }));
}

async function waitForHealth(httpPort) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error("Backend health check timed out.");
}

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
  if (backendProcess) {
    return;
  }

  const config = loadOrCreateRuntimeConfig();
  const appDataRoot = getAppDataRoot();
  const dataDir = path.join(appDataRoot, "data");
  const hymnsDir = path.join(dataDir, "hymns");
  ensureDirectory(dataDir);
  seedHymnsDir(hymnsDir);

  const httpPort = await choosePort(DEFAULT_HTTP_PORT);
  const wsPort = await choosePort(DEFAULT_WS_PORT);
  const backend = resolveBackendCommand();
  const baseDir = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const args = [
    ...backend.args,
    app.isPackaged ? "" : path.join(app.getAppPath(), "server.py"),
    `--http-port=${httpPort}`,
    `--ws-port=${wsPort}`,
    `--base-dir=${baseDir}`,
    `--data-dir=${dataDir}`,
    `--token=${config.token}`,
  ].filter(Boolean);

  sendToRenderer("backend-event", {
    type: "lifecycle",
    phase: "starting",
    message: "Server starting",
  });

  backendProcess = spawn(backend.command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  backendExitedUnexpectedly = true;
  fatalBackendError = null;

  monitorBackendOutput(backendProcess.stdout, async (line) => {
    try {
      const payload = JSON.parse(line);
      if (payload.event === "ready") {
        await waitForHealth(payload.http_port);
        runtimeInfo = {
          version: payload.version,
          httpPort: payload.http_port,
          wsPort: payload.ws_port,
          dataDir: payload.data_dir,
          hymnsDir: payload.hymns_dir,
          token: config.token,
          overlayProfiles: payload.overlay_profiles,
          overlayUrls: [],
        };
        runtimeInfo.overlayUrls = overlayUrlsFromRuntime(runtimeInfo);
        restartAttempt = 0;
        sendToRenderer("backend-event", { type: "runtime", runtime: runtimeInfo });
        sendToRenderer("backend-event", {
          type: "lifecycle",
          phase: "running",
          message: "Server running",
        });
      } else {
        sendToRenderer("backend-event", {
          type: "log",
          message: payload.message || line,
        });
      }
    } catch {
      sendToRenderer("backend-event", {
        type: "log",
        message: line,
      });
    }
  });

  monitorBackendOutput(backendProcess.stderr, (line) => {
    if (isFatalBackendLine(line)) {
      fatalBackendError = line;
      backendExitedUnexpectedly = false;
    }
    sendToRenderer("backend-event", {
      type: "log",
      message: line,
      level: "error",
    });
  });

  backendProcess.once("error", (error) => {
    backendExitedUnexpectedly = false;
    sendToRenderer("backend-event", {
      type: "toast",
      level: "error",
      message: `Failed to start backend: ${error.message}`,
    });
    scheduleBackendRestart();
  });

  backendProcess.once("exit", (_code, signal) => {
    backendProcess = null;
    runtimeInfo = null;
    if (shuttingDown) {
      return;
    }
    sendToRenderer("backend-event", {
      type: "lifecycle",
      phase: "stopped",
      message: signal ? `Backend stopped (${signal})` : "Backend stopped",
    });
    if (fatalBackendError) {
      sendToRenderer("backend-event", {
        type: "toast",
        level: "error",
        message:
          "Backend startup failed. Use Python 3.12 and install requirements with env\\Scripts\\python.exe -m pip install -r requirements.txt.",
      });
      return;
    }
    if (backendExitedUnexpectedly) {
      scheduleBackendRestart();
    }
  });
}

function scheduleBackendRestart() {
  if (restartTimer) {
    return;
  }
  const delay = RESTART_BACKOFF_MS[Math.min(restartAttempt, RESTART_BACKOFF_MS.length - 1)];
  restartAttempt += 1;
  sendToRenderer("backend-event", {
    type: "toast",
    level: "warning",
    message: `Backend stopped unexpectedly. Restarting in ${Math.round(delay / 1000)}s.`,
  });
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!shuttingDown) {
      startBackend().catch((error) => {
        sendToRenderer("backend-event", {
          type: "toast",
          level: "error",
          message: error.message,
        });
        scheduleBackendRestart();
      });
    }
  }, delay);
}

function stopBackend() {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve();
      return;
    }
    backendExitedUnexpectedly = false;
    const activeProcess = backendProcess;
    activeProcess.once("exit", () => resolve());
    activeProcess.kill("SIGTERM");
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill("SIGKILL");
      }
    }, 4000);
  });
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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  createWindow();
  await startBackend();
});

app.on("before-quit", async (event) => {
  if (shuttingDown) {
    return;
  }
  event.preventDefault();
  shuttingDown = true;
  clearTimeout(restartTimer);
  await stopBackend();
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
