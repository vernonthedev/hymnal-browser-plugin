(function () {
  const textEl = document.getElementById("text");
  const cardEl = document.getElementById("overlay-card");
  const speakerEl = document.getElementById("speaker");
  const statusEl = document.getElementById("overlay-status");
  const profile = document.body.dataset.profile || "lowerthird";
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const wsPort = Number(params.get("wsPort")) || 8765;
  const wsUrl = `ws://127.0.0.1:${wsPort}`;

  let socket = null;
  let reconnectDelay = 500;
  let reconnectTimer = null;
  let currentState = {
    text: "",
    visible: true,
    style: {},
  };

  function showStatus(message) {
    if (!message) {
      statusEl.textContent = "";
      statusEl.classList.remove("visible");
      return;
    }
    statusEl.textContent = message;
    statusEl.classList.add("visible");
  }

  function applyStyle(style) {
    const root = document.documentElement;
    const fontSizeMap = {
      sm: "34px",
      md: "48px",
      lg: "60px",
      xl: "74px",
    };
    const gradientMap = {
      dark: [
        [6, 10, 20],
        [28, 39, 66],
      ],
      warm: [
        [82, 28, 18],
        [145, 64, 31],
      ],
      clean: [
        [2, 6, 23],
        [30, 41, 59],
      ],
    };
    const opacity = Number(style.backgroundOpacity ?? 0.55);
    const gradient = gradientMap[style.backgroundGradient] ?? gradientMap.dark;
    root.style.setProperty("--overlay-font-size", fontSizeMap[style.fontSizePreset] || "48px");
    root.style.setProperty("--overlay-align", style.alignment || (profile === "lyrics" ? "left" : "center"));
    root.style.setProperty("--overlay-safe-margin", `${Number(style.safeMargin || 80)}px`);
    if (style.showBackground === false) {
      cardEl.classList.add("backgroundless");
      cardEl.style.background = "transparent";
      cardEl.style.boxShadow = "none";
    } else {
      cardEl.classList.remove("backgroundless");
      const [startColor, endColor] = gradient;
      cardEl.style.background = `linear-gradient(135deg, rgba(${startColor[0]}, ${startColor[1]}, ${startColor[2]}, ${opacity}), rgba(${endColor[0]}, ${endColor[1]}, ${endColor[2]}, ${opacity}))`;
      cardEl.style.boxShadow = "";
    }
    document.body.dataset.animation = style.animation || "pop";
    speakerEl.textContent = style.speakerLabel || "";
    speakerEl.classList.toggle("visible", Boolean(style.speakerLabel));
  }

  function triggerAnimation() {
    cardEl.classList.remove("animate");
    void cardEl.offsetWidth;
    cardEl.classList.add("animate");
  }

  function renderState(nextState, shouldRetrigger) {
    currentState = {
      ...currentState,
      ...nextState,
      style: {
        ...currentState.style,
        ...(nextState.style || {}),
      },
    };
    textEl.textContent = currentState.text || "";
    applyStyle(currentState.style || {});
    cardEl.classList.toggle("visible", Boolean(currentState.visible && currentState.text));
    cardEl.classList.toggle("blank", !currentState.visible || !currentState.text);
    if (shouldRetrigger) {
      triggerAnimation();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      return;
    }
    showStatus("Reconnecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 1.8, 8000);
      connect();
    }, reconnectDelay);
  }

  function handleMessage(event) {
    const payload = JSON.parse(event.data);
    if (payload.type === "hello") {
      socket.send(JSON.stringify({ cmd: "hello", role: "overlay" }));
      if (token) {
        socket.send(JSON.stringify({ cmd: "auth", token }));
      }
      return;
    }

    if (payload.type === "heartbeat") {
      socket.send(JSON.stringify({ cmd: "pong", ts: payload.ts }));
      return;
    }

    if (payload.type === "error") {
      showStatus(payload.message || "Connection error");
      return;
    }

    if (payload.type === "state" || payload.type === "visibility" || payload.type === "style") {
      renderState(payload, payload.type !== "style");
      showStatus("");
      return;
    }

    if (payload.type === "retrigger") {
      renderState(payload, true);
      showStatus("");
    }
  }

  function connect() {
    socket = new WebSocket(wsUrl);
    socket.addEventListener("open", () => {
      reconnectDelay = 500;
      showStatus("");
    });
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", () => {
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    });
  }

  connect();
})();
