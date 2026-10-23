import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  getBootstrap: () => ipcRenderer.invoke("iwakura:bootstrap"),
  openExternal: (url: string) => ipcRenderer.invoke("iwakura:open-external", url),
  quit: () => ipcRenderer.invoke("iwakura:quit"),
};

contextBridge.exposeInMainWorld("iwakura", bridge);
