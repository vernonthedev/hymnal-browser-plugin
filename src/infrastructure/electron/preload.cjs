"use strict";

// src/infrastructure/electron/preload.ts
var import_electron = require("electron");
console.log("Preload script loaded");
import_electron.contextBridge.exposeInMainWorld("desktopApi", {
  getRuntime: () => import_electron.ipcRenderer.invoke("runtime:get"),
  copyText: (text) => import_electron.ipcRenderer.invoke("clipboard:copy", text),
  openExternal: (target) => import_electron.ipcRenderer.invoke("shell:openExternal", target),
  openPath: (target) => import_electron.ipcRenderer.invoke("shell:openPath", target),
  getVersion: () => import_electron.ipcRenderer.invoke("app:getVersion"),
  getReleaseInfo: () => import_electron.ipcRenderer.invoke("app:getReleaseInfo"),
  minimizeWindow: () => import_electron.ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => import_electron.ipcRenderer.invoke("window:maximize"),
  toggleMaximizeWindow: () => import_electron.ipcRenderer.invoke("window:toggleMaximize"),
  closeWindow: () => import_electron.ipcRenderer.invoke("window:close"),
  moveWindow: (dx, dy) => import_electron.ipcRenderer.invoke("window:move", dx, dy),
  onBackendEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("backend-event", listener);
    return () => import_electron.ipcRenderer.removeListener("backend-event", listener);
  }
});
