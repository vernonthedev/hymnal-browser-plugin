"use strict";
(() => {
  // assets/overlay-client.ts
  (function() {
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
      style: {}
    };
    function showStatus(message) {
      if (!message) {
        if (statusEl) statusEl.textContent = "";
        statusEl?.classList.remove("visible");
        return;
      }
      if (statusEl) statusEl.textContent = message;
      statusEl?.classList.add("visible");
    }
    function applyStyle(style) {
      const root = document.documentElement;
      const fontSizeMap = {
        sm: "34px",
        md: "48px",
        lg: "60px",
        xl: "74px"
      };
      root.style.setProperty(
        "--overlay-font-size",
        fontSizeMap[style.fontSizePreset || ""] || "48px"
      );
      root.style.setProperty(
        "--overlay-align",
        style.alignment || (profile === "lyrics" ? "left" : "center")
      );
      root.style.setProperty(
        "--overlay-safe-margin",
        `${Number(style.safeMargin || 80)}px`
      );
      document.body.dataset.animation = style.animation || "pop";
      if (speakerEl) speakerEl.textContent = style.speakerLabel || "";
      speakerEl?.classList.toggle("visible", Boolean(style.speakerLabel));
    }
    function triggerAnimation() {
      cardEl?.classList.remove("animate");
      void cardEl?.offsetWidth;
      cardEl?.classList.add("animate");
    }
    function renderState(nextState, shouldRetrigger) {
      currentState = {
        ...currentState,
        ...nextState,
        style: {
          ...currentState.style,
          ...nextState.style || {}
        }
      };
      if (textEl) textEl.textContent = currentState.text || "";
      applyStyle(currentState.style || {});
      cardEl?.classList.toggle(
        "visible",
        Boolean(currentState.visible && currentState.text)
      );
      cardEl?.classList.toggle(
        "blank",
        !currentState.visible || !currentState.text
      );
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
        reconnectDelay = Math.min(reconnectDelay * 1.8, 8e3);
        connect();
      }, reconnectDelay);
    }
    function handleMessage(event) {
      const payload = JSON.parse(event.data);
      if (payload.type === "hello") {
        socket?.send(JSON.stringify({ cmd: "hello", role: "overlay" }));
        if (token) {
          socket?.send(JSON.stringify({ cmd: "auth", token }));
        }
        return;
      }
      if (payload.type === "heartbeat") {
        socket?.send(JSON.stringify({ cmd: "pong", ts: payload.ts }));
        return;
      }
      if (payload.type === "error") {
        showStatus(payload.message || "Connection error");
        return;
      }
      if (payload.type === "state" || payload.type === "visibility" || payload.type === "style" || payload.type === "retrigger") {
        const statePayload = payload;
        renderState(statePayload, payload.type !== "style");
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
})();
