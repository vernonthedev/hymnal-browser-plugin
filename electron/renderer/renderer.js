const state = {
  runtime: null,
  status: null,
  socket: null,
  hymnIndex: [],
  presets: {},
  appVersion: "0.0.0",
  reconnectTimer: null,
  styleUpdateTimer: null,
};

const elements = {
  serverPhase: document.getElementById("server-phase"),
  serverPorts: document.getElementById("server-ports"),
  hymnInput: document.getElementById("hymn-input"),
  hymnOptions: document.getElementById("hymn-options"),
  loadBtn: document.getElementById("load-btn"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  resetBtn: document.getElementById("reset-btn"),
  blankBtn: document.getElementById("blank-btn"),
  showBtn: document.getElementById("show-btn"),
  retriggerBtn: document.getElementById("retrigger-btn"),
  reloadIndexBtn: document.getElementById("reload-index-btn"),
  prevLinePreview: document.getElementById("prev-line-preview"),
  currentLinePreview: document.getElementById("current-line-preview"),
  nextLinePreview: document.getElementById("next-line-preview"),
  currentHymn: document.getElementById("current-hymn"),
  lineMeta: document.getElementById("line-meta"),
  overlayCount: document.getElementById("overlay-count"),
  visibilityMeta: document.getElementById("visibility-meta"),
  overlayUrlList: document.getElementById("overlay-url-list"),
  copyDiagnosticsBtn: document.getElementById("copy-diagnostics-btn"),
  openHymnsBtn: document.getElementById("open-hymns-btn"),
  logOutput: document.getElementById("log-output"),
  toastRegion: document.getElementById("toast-region"),
  fontSize: document.getElementById("font-size-select"),
  alignment: document.getElementById("alignment-select"),
  animation: document.getElementById("animation-select"),
  gradient: document.getElementById("gradient-select"),
  safeMargin: document.getElementById("safe-margin-input"),
  opacity: document.getElementById("opacity-input"),
  speaker: document.getElementById("speaker-input"),
  presetSelect: document.getElementById("preset-select"),
  presetName: document.getElementById("preset-name-input"),
  applyPresetBtn: document.getElementById("apply-preset-btn"),
  savePresetBtn: document.getElementById("save-preset-btn"),
};

function appendLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.logOutput.textContent = `${line}\n${elements.logOutput.textContent}`.trim();
}

function showToast(message, level = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${level}`;
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function setLifecycle(phase, message) {
  elements.serverPhase.textContent = message;
  elements.serverPhase.className = `phase phase-${phase}`;
}

function renderOverlayUrls() {
  if (!state.runtime) {
    elements.overlayUrlList.innerHTML = "<p>Waiting for runtime details...</p>";
    return;
  }

  elements.overlayUrlList.innerHTML = "";
  for (const overlay of state.runtime.overlayUrls) {
    const card = document.createElement("div");
    card.className = "url-card";
    card.innerHTML = `
      <div>
        <strong>${overlay.name}</strong>
        <p>${overlay.path}</p>
      </div>
      <code>${overlay.url}</code>
      <div class="url-actions">
        <button data-action="copy">Copy URL</button>
        <button data-action="open" class="primary-btn">Open in browser</button>
      </div>
    `;
    const [copyBtn, openBtn] = card.querySelectorAll("button");
    copyBtn.addEventListener("click", async () => {
      await window.desktopApi.copyText(overlay.url);
      showToast(`${overlay.name} URL copied.`);
    });
    openBtn.addEventListener("click", async () => {
      await window.desktopApi.openExternal(overlay.url);
    });
    elements.overlayUrlList.appendChild(card);
  }
}

function renderHymnOptions() {
  elements.hymnOptions.innerHTML = "";
  for (const item of state.hymnIndex) {
    const option = document.createElement("option");
    option.value = item.number;
    option.label = `${item.number} - ${item.preview}`;
    elements.hymnOptions.appendChild(option);
  }
}

function renderPresets() {
  elements.presetSelect.innerHTML = "";
  for (const name of Object.keys(state.presets)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    elements.presetSelect.appendChild(option);
  }
}

function syncStyleForm(style = {}) {
  if (document.activeElement !== elements.fontSize) {
    elements.fontSize.value = style.fontSizePreset || "md";
  }
  if (document.activeElement !== elements.alignment) {
    elements.alignment.value = style.alignment || "center";
  }
  if (document.activeElement !== elements.animation) {
    elements.animation.value = style.animation || "pop";
  }
  if (document.activeElement !== elements.gradient) {
    elements.gradient.value = style.backgroundGradient || "dark";
  }
  if (document.activeElement !== elements.safeMargin) {
    elements.safeMargin.value = String(style.safeMargin ?? 80);
  }
  if (document.activeElement !== elements.opacity) {
    elements.opacity.value = String(style.backgroundOpacity ?? 0.55);
  }
  if (document.activeElement !== elements.speaker) {
    elements.speaker.value = style.speakerLabel || "";
  }
}

function renderStatus() {
  const status = state.status;
  if (!status) {
    return;
  }

  elements.serverPorts.textContent = `HTTP ${status.http_port}, WS ${status.ws_port}`;
  elements.currentHymn.textContent = status.current_hymn || "-";
  elements.lineMeta.textContent = status.total_lines ? `${status.line_index + 1}/${status.total_lines}` : "0/0";
  elements.overlayCount.textContent = String(status.connected_clients || 0);
  elements.visibilityMeta.textContent = status.visible ? "Shown" : "Blank";
  elements.currentLinePreview.textContent = status.text || "(No text)";
  elements.prevLinePreview.textContent = status.previous_text || "-";
  elements.nextLinePreview.textContent = status.next_text || "-";
  syncStyleForm(status.style || {});

  if (status.presets) {
    state.presets = status.presets;
    renderPresets();
  }
}

async function fetchJson(route) {
  if (!state.runtime) {
    throw new Error("Runtime is not available yet.");
  }
  const response = await fetch(`http://127.0.0.1:${state.runtime.httpPort}${route}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${route}`);
  }
  return response.json();
}

async function refreshIndexes() {
  try {
    const hymnPayload = await fetchJson("/hymns");
    state.hymnIndex = hymnPayload.items || [];
    renderHymnOptions();
    const presetPayload = await fetchJson("/presets");
    state.presets = presetPayload.items || {};
    renderPresets();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function sendCommand(payload) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast("Backend socket is not ready.", "error");
    return;
  }
  state.socket.send(JSON.stringify(payload));
}

function connectSocket() {
  if (!state.runtime) {
    return;
  }

  window.clearTimeout(state.reconnectTimer);
  if (state.socket) {
    state.socket.close();
  }

  state.socket = new WebSocket(`ws://127.0.0.1:${state.runtime.wsPort}`);
  state.socket.addEventListener("open", () => {
    state.socket.send(JSON.stringify({ cmd: "hello", role: "control" }));
  });
  state.socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "status") {
      state.status = payload.status;
      renderStatus();
      return;
    }
    if (payload.type === "error") {
      showToast(payload.message, "error");
      return;
    }
    if (payload.type === "hymn_index") {
      state.hymnIndex = payload.items || [];
      renderHymnOptions();
      return;
    }
    if (payload.type === "presets") {
      state.presets = payload.presets || {};
      renderPresets();
    }
  });
  state.socket.addEventListener("close", () => {
    state.reconnectTimer = window.setTimeout(connectSocket, 1200);
  });
}

function buildStylePayload() {
  return {
    fontSizePreset: elements.fontSize.value,
    alignment: elements.alignment.value,
    animation: elements.animation.value,
    backgroundGradient: elements.gradient.value,
    safeMargin: Number(elements.safeMargin.value),
    backgroundOpacity: Number(elements.opacity.value),
    speakerLabel: elements.speaker.value.trim(),
  };
}

function queueStyleUpdate() {
  window.clearTimeout(state.styleUpdateTimer);
  state.styleUpdateTimer = window.setTimeout(() => {
    sendCommand({ cmd: "update_style", style: buildStylePayload() });
  }, 180);
}

async function copyDiagnostics() {
  const diagnostics = {
    appVersion: state.appVersion,
    runtime: state.runtime,
    status: state.status,
    timestamp: new Date().toISOString(),
  };
  await window.desktopApi.copyText(JSON.stringify(diagnostics, null, 2));
  showToast("Diagnostics copied.");
}

function bindEvents() {
  elements.loadBtn.addEventListener("click", () => {
    sendCommand({ cmd: "load", hymn: elements.hymnInput.value.trim() });
  });
  elements.prevBtn.addEventListener("click", () => sendCommand({ cmd: "prev" }));
  elements.nextBtn.addEventListener("click", () => sendCommand({ cmd: "next" }));
  elements.resetBtn.addEventListener("click", () => sendCommand({ cmd: "reset" }));
  elements.blankBtn.addEventListener("click", () => sendCommand({ cmd: "blank" }));
  elements.showBtn.addEventListener("click", () => sendCommand({ cmd: "show" }));
  elements.retriggerBtn.addEventListener("click", () => sendCommand({ cmd: "retrigger" }));
  elements.reloadIndexBtn.addEventListener("click", () => sendCommand({ cmd: "reload_hymns" }));
  elements.copyDiagnosticsBtn.addEventListener("click", copyDiagnostics);
  elements.openHymnsBtn.addEventListener("click", async () => {
    if (state.runtime?.hymnsDir) {
      await window.desktopApi.openPath(state.runtime.hymnsDir);
    }
  });

  [
    elements.fontSize,
    elements.alignment,
    elements.animation,
    elements.gradient,
    elements.safeMargin,
  ].forEach((input) => {
    input.addEventListener("change", () => {
      queueStyleUpdate();
    });
  });

  [elements.opacity, elements.speaker].forEach((input) => {
    input.addEventListener("input", queueStyleUpdate);
    input.addEventListener("change", queueStyleUpdate);
  });

  elements.applyPresetBtn.addEventListener("click", () => {
    sendCommand({ cmd: "apply_preset", name: elements.presetSelect.value });
  });

  elements.savePresetBtn.addEventListener("click", () => {
    const name = elements.presetName.value.trim();
    if (!name) {
      showToast("Preset name is required.", "error");
      return;
    }
    sendCommand({ cmd: "update_style", style: buildStylePayload() });
    sendCommand({ cmd: "save_preset", name });
    elements.presetName.value = "";
  });

  elements.hymnInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendCommand({ cmd: "load", hymn: elements.hymnInput.value.trim() });
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }
    if (event.key === "ArrowRight" || event.key === " ") {
      event.preventDefault();
      sendCommand({ cmd: "next" });
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      sendCommand({ cmd: "prev" });
      return;
    }
    if (event.key.toLowerCase() === "r") {
      sendCommand({ cmd: "reset" });
      return;
    }
    if (event.key.toLowerCase() === "b") {
      sendCommand({ cmd: "blank" });
    }
  });
}

async function init() {
  bindEvents();
  state.appVersion = await window.desktopApi.getVersion();
  const runtime = await window.desktopApi.getRuntime();
  if (runtime) {
    state.runtime = runtime;
    renderOverlayUrls();
    connectSocket();
    await refreshIndexes();
  }

  window.desktopApi.onBackendEvent(async (event) => {
    if (event.type === "runtime") {
      state.runtime = event.runtime;
      renderOverlayUrls();
      connectSocket();
      await refreshIndexes();
      return;
    }

    if (event.type === "status") {
      state.status = event.status;
      renderStatus();
      return;
    }

    if (event.type === "lifecycle") {
      setLifecycle(event.phase, event.message);
      appendLog(event.message);
      return;
    }

    if (event.type === "toast") {
      showToast(event.message, event.level || "info");
      appendLog(event.message);
      return;
    }

    if (event.type === "log") {
      appendLog(event.message);
    }
  });
}

init();
