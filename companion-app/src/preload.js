// ─── Preload Script ─────────────────────────────────────────────────────────
// Minimal preload for the companion app. Since this is a tray-only app with
// no visible BrowserWindow, the preload is kept minimal. It exists primarily
// for any future settings/status window that might be added.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("companion", {
  // Get current connection status
  getStatus: () => ipcRenderer.invoke("get-status"),

  // Listen for status changes
  onStatusChange: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("status-changed", handler);
    return () => ipcRenderer.removeListener("status-changed", handler);
  },

  // App info
  getVersion: () => ipcRenderer.invoke("get-version"),

  // Open external URL
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
