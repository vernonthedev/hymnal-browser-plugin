import { contextBridge, ipcRenderer } from "electron";
console.log("Preload script loaded");
contextBridge.exposeInMainWorld("desktopApi", {
    getRuntime: () => ipcRenderer.invoke("runtime:get"),
    copyText: (text) => ipcRenderer.invoke("clipboard:copy", text),
    openExternal: (target) => ipcRenderer.invoke("shell:openExternal", target),
    openPath: (target) => ipcRenderer.invoke("shell:openPath", target),
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
    getReleaseInfo: () => ipcRenderer.invoke("app:getReleaseInfo"),
    minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
    closeWindow: () => ipcRenderer.invoke("window:close"),
    onBackendEvent: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("backend-event", listener);
        return () => ipcRenderer.removeListener("backend-event", listener);
    },
});
