const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  getRuntime: () => ipcRenderer.invoke("runtime:get"),
  copyText: (text) => ipcRenderer.invoke("clipboard:copy", text),
  openExternal: (target) => ipcRenderer.invoke("shell:openExternal", target),
  openPath: (target) => ipcRenderer.invoke("shell:openPath", target),
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  onBackendEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("backend-event", listener);
    return () => ipcRenderer.removeListener("backend-event", listener);
  },
});
