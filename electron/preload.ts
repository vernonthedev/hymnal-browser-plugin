import { contextBridge, ipcRenderer } from "electron";

console.log("Preload script loaded");

contextBridge.exposeInMainWorld("desktopApi", {
  getRuntime: (): Promise<any> => ipcRenderer.invoke("runtime:get"),
  copyText: (text: string): Promise<boolean> => ipcRenderer.invoke("clipboard:copy", text),
  openExternal: (target: string): Promise<boolean> => ipcRenderer.invoke("shell:openExternal", target),
  openPath: (target: string): Promise<boolean> => ipcRenderer.invoke("shell:openPath", target),
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  getReleaseInfo: (): Promise<any> => ipcRenderer.invoke("app:getReleaseInfo"),
  minimizeWindow: (): Promise<boolean> => ipcRenderer.invoke("window:minimize"),
  closeWindow: (): Promise<boolean> => ipcRenderer.invoke("window:close"),
  onBackendEvent: (callback: (payload: any) => void): (() => void) => {
    const listener = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on("backend-event", listener);
    return () => ipcRenderer.removeListener("backend-event", listener);
  },
});
