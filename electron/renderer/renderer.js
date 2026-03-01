const MAX_LOG_LINES = 9;
const MAX_FINDER_RESULTS = 6;

const state = {
  runtime: null,
  status: null,
  socket: null,
  hymnIndex: [],
  presets: {},
  appVersion: "0.0.0",
  reconnectTimer: null,
  styleUpdateTimer: null,
  logLines: [],
  pickerDismissed: false,
};

const elements = {
  serverPhase: document.getElementById("server-phase"),
  serverPorts: document.getElementById("server-ports"),
  hymnInput: document.getElementById("hymn-input"),
  hymnSearchResults: document.getElementById("hymn-search-results"),
  hymnSearchPopover: document.getElementById("hymn-search-popover"),
  finderResultsCount: document.getElementById("finder-results-count"),
  finderSelectionNumber: document.getElementById("finder-selection-number"),
  finderSelectionPreview: document.getElementById("finder-selection-preview"),
  loadBtn: document.getElementById("load-btn"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  resetBtn: document.getElementById("reset-btn"),
  blankBtn: document.getElementById("blank-btn"),
  showBtn: document.getElementById("show-btn"),
  retriggerBtn: document.getElementById("retrigger-btn"),
  reloadIndexBtn: document.getElementById("reload-index-btn"),
  windowMinimizeBtn: document.getElementById("window-minimize-btn"),
  windowCloseBtn: document.getElementById("window-close-btn"),
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
  speakerTemplate: document.getElementById("speaker-template-select"),
  fontSize: document.getElementById("font-size-select"),
  alignment: document.getElementById("alignment-select"),
  animation: document.getElementById("animation-select"),
  safeMargin: document.getElementById("safe-margin-input"),
  speaker: document.getElementById("speaker-input"),
  presetSelect: document.getElementById("preset-select"),
  presetName: document.getElementById("preset-name-input"),
  applyPresetBtn: document.getElementById("apply-preset-btn"),
  savePresetBtn: document.getElementById("save-preset-btn"),
};

function renderLogs() {
  if (!elements.logOutput) {
    return;
  }
  elements.logOutput.textContent = state.logLines.length
    ? state.logLines.join("\n")
    : "Waiting for backend logs...";
}

function appendLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  state.logLines = [line, ...state.logLines].slice(0, MAX_LOG_LINES);
  renderLogs();
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

function createIcon(iconName) {
  if (iconName === "copy") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v1.125A2.625 2.625 0 0 1 13.125 21H6.375A2.625 2.625 0 0 1 3.75 18.375V8.625A2.625 2.625 0 0 1 6.375 6h1.125m3.75-3h6.375A2.625 2.625 0 0 1 20.25 5.625v9.75A2.625 2.625 0 0 1 17.625 18h-6.75a2.625 2.625 0 0 1-2.625-2.625v-9.75A2.625 2.625 0 0 1 10.875 3Z" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-6.75-4.5L21 3m0 0-3 9m3-9h-9" />
    </svg>
  `;
}

function renderOverlayUrls() {
  if (!state.runtime) {
    elements.overlayUrlList.innerHTML = "<p class=\"result-preview\">Waiting for runtime details...</p>";
    return;
  }

  elements.overlayUrlList.innerHTML = "";
  for (const overlay of state.runtime.overlayUrls) {
    const card = document.createElement("div");
    card.className = "url-card";
    card.innerHTML = `
      <div class="url-card-title">
        <strong>${overlay.name}</strong>
        <span class="badge">${overlay.path.replace("/", "")}</span>
      </div>
      <p>${overlay.path}</p>
      <code title="${overlay.url}">${overlay.url}</code>
      <div class="url-actions">
        <button data-action="copy" type="button">
          <span class="icon" aria-hidden="true">${createIcon("copy")}</span>
          Copy
        </button>
        <button data-action="open" class="primary-btn" type="button">
          <span class="icon" aria-hidden="true">${createIcon("open")}</span>
          Open
        </button>
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
  return;
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
  if (document.activeElement !== elements.safeMargin) {
    elements.safeMargin.value = String(style.safeMargin ?? 80);
  }
  if (document.activeElement !== elements.speaker) {
    elements.speaker.value = style.speakerLabel || "";
  }
  if (document.activeElement !== elements.speakerTemplate) {
    elements.speakerTemplate.value = style.speakerLabel || "";
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getHymnTitle(item) {
  const preview = String(item?.preview || "").trim();
  if (!preview) {
    return "Untitled hymn";
  }

  const firstLine = preview.split(/\r?\n/)[0].trim();
  const firstSegment = firstLine.split(/[-|:]/)[0].trim();
  return firstSegment || firstLine;
}

function getMatchingHymns(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return state.hymnIndex.slice(0, MAX_FINDER_RESULTS);
  }

  return state.hymnIndex
    .filter((item) => {
      const number = normalizeText(item.number);
      const preview = normalizeText(item.preview);
      return number.startsWith(normalizedQuery) || preview.includes(normalizedQuery);
    })
    .slice(0, MAX_FINDER_RESULTS);
}

function getSelectedHymn() {
  const typed = normalizeText(elements.hymnInput.value);
  if (typed) {
    const exactMatch = state.hymnIndex.find(
      (item) => normalizeText(item.number) === typed || normalizeText(item.preview) === typed,
    );
    if (exactMatch) {
      return exactMatch;
    }

    const firstMatch = getMatchingHymns(typed)[0];
    if (firstMatch) {
      return firstMatch;
    }
  }

  if (state.status?.current_hymn) {
    return state.hymnIndex.find(
      (item) => normalizeText(item.number) === normalizeText(state.status.current_hymn),
    );
  }

  return null;
}

function renderFinderSpotlight() {
  const selectedHymn = getSelectedHymn();

  if (!selectedHymn) {
    elements.finderSelectionNumber.textContent = "No hymn selected";
    elements.finderSelectionPreview.textContent =
      "Type a number to pull matching hymns into the quick rail.";
    return;
  }

  elements.finderSelectionNumber.textContent = `Hymn ${selectedHymn.number}`;
  elements.finderSelectionPreview.textContent = getHymnTitle(selectedHymn);
}

function renderFinderResults() {
  if (!elements.hymnSearchResults || !elements.finderResultsCount) {
    return;
  }
  const results = getMatchingHymns(elements.hymnInput.value);
  const activeNumber = getSelectedHymn()?.number;
  const query = normalizeText(elements.hymnInput.value);
  elements.finderResultsCount.textContent = `${results.length} hymn${results.length === 1 ? "" : "s"}`;
  elements.hymnSearchPopover?.classList.toggle("is-hidden", !query || results.length === 0);
  if (state.pickerDismissed) {
    elements.hymnSearchPopover?.classList.add("is-hidden");
  }

  elements.hymnSearchResults.innerHTML = "";

  for (const hymn of results) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-card";
    if (hymn.number === activeNumber) {
      button.classList.add("is-active");
    }
    button.innerHTML = `
      <span class="result-number">#${hymn.number}</span>
      <div class="result-main">
        <span class="result-title">${getHymnTitle(hymn)}</span>
        <p class="result-preview">Hymn ${hymn.number}</p>
      </div>
    `;
    button.addEventListener("click", () => {
      elements.hymnInput.value = hymn.number;
      state.pickerDismissed = true;
      renderFinderSpotlight();
      renderFinderResults();
      elements.hymnSearchPopover?.classList.add("is-hidden");
    });
    button.addEventListener("dblclick", () => {
      elements.hymnInput.value = hymn.number;
      state.pickerDismissed = true;
      sendCommand({ cmd: "load", hymn: hymn.number });
      elements.hymnSearchPopover?.classList.add("is-hidden");
    });
    elements.hymnSearchResults.appendChild(button);
  }

  if (!results.length) {
    elements.hymnSearchResults.innerHTML = "";
  }
}

function renderStatus() {
  const status = state.status;
  if (!status) {
    return;
  }

  elements.serverPorts.textContent = `HTTP ${status.http_port}, WS ${status.ws_port}`;
  elements.currentHymn.textContent = status.current_hymn || "-";
  elements.lineMeta.textContent = status.total_lines
    ? `${status.line_index + 1}/${status.total_lines}`
    : "0/0";
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

  renderFinderSpotlight();
  renderFinderResults();
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
    renderFinderSpotlight();
    renderFinderResults();

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
      renderFinderSpotlight();
      renderFinderResults();
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
    safeMargin: Number(elements.safeMargin.value),
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
  elements.windowMinimizeBtn.addEventListener("click", async () => {
    await window.desktopApi.minimizeWindow();
  });
  elements.windowCloseBtn.addEventListener("click", async () => {
    await window.desktopApi.closeWindow();
  });
  elements.copyDiagnosticsBtn?.addEventListener("click", copyDiagnostics);
  elements.openHymnsBtn.addEventListener("click", async () => {
    if (state.runtime?.hymnsDir) {
      await window.desktopApi.openPath(state.runtime.hymnsDir);
    }
  });

  elements.speakerTemplate.addEventListener("change", () => {
    elements.speaker.value = elements.speakerTemplate.value;
    queueStyleUpdate();
  });

  [elements.fontSize, elements.alignment, elements.animation, elements.safeMargin].forEach(
    (input) => {
      input.addEventListener("change", () => {
        queueStyleUpdate();
      });
    },
  );

  [elements.speaker].forEach((input) => {
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

  elements.hymnInput.addEventListener("input", () => {
    state.pickerDismissed = false;
    renderFinderSpotlight();
    renderFinderResults();
  });

  elements.hymnInput.addEventListener("focus", () => {
    renderFinderResults();
  });

  elements.hymnInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      state.pickerDismissed = true;
      sendCommand({ cmd: "load", hymn: elements.hymnInput.value.trim() });
      elements.hymnSearchPopover?.classList.add("is-hidden");
    }
  });

  elements.loadBtn.addEventListener("click", () => {
    state.pickerDismissed = true;
    elements.hymnSearchPopover?.classList.add("is-hidden");
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      elements.hymnSearchPopover &&
      target instanceof Node &&
      !elements.hymnSearchPopover.contains(target) &&
      !elements.hymnInput.contains(target)
    ) {
      state.pickerDismissed = true;
      elements.hymnSearchPopover.classList.add("is-hidden");
    }
  });

  window.addEventListener("keydown", (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    ) {
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
  renderFinderResults();
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
