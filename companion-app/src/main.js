// ─── IECentral Companion App — Electron Main Process ────────────────────────
// Runs in the system tray. Starts a local WebSocket server on port 8787.
// The browser meeting room connects here and forwards remote-control events,
// which this app executes at the OS level via @nut-tree/nut-js.

const { app, Notification, dialog } = require("electron");
const path = require("path");
const { createTray, updateTrayStatus } = require("./tray");
const { startWebSocketServer, stopWebSocketServer } = require("./ws-server");
const { checkAccessibilityPermissions } = require("./permissions");

// ─── Prevent multiple instances ─────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log("[Companion] Another instance is already running. Exiting.");
  app.quit();
}

// ─── App configuration ─────────────────────────────────────────────────────

// No visible window — tray-only app
app.dock?.hide?.(); // Hide dock icon on macOS

app.on("window-all-closed", (e) => {
  // Do not quit when all windows are closed — we live in the tray
  e?.preventDefault?.();
});

// ─── App ready ──────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  console.log("[Companion] App ready. Initializing...");

  // Check accessibility permissions (macOS)
  const hasPermissions = await checkAccessibilityPermissions();
  if (!hasPermissions) {
    console.warn(
      "[Companion] Accessibility permissions not granted. " +
      "Mouse/keyboard control will not work until permissions are enabled."
    );
  }

  // Create the system tray
  createTray();

  // Start WebSocket server
  startWebSocketServer({
    port: 8787,
    onClientConnected: (clientInfo) => {
      console.log(`[Companion] Client connected: ${clientInfo}`);
      updateTrayStatus("connected", clientInfo);
      showNotification(
        "Remote Control Active",
        "A browser session has connected for remote control."
      );
    },
    onClientDisconnected: () => {
      console.log("[Companion] Client disconnected");
      updateTrayStatus("disconnected");
      showNotification(
        "Remote Control Ended",
        "The browser session has disconnected."
      );
    },
    onError: (err) => {
      console.error("[Companion] WebSocket error:", err.message);
      updateTrayStatus("error");
    },
  });

  console.log("[Companion] WebSocket server started on port 8787");
  updateTrayStatus("waiting");
});

// ─── Graceful shutdown ──────────────────────────────────────────────────────

app.on("before-quit", () => {
  console.log("[Companion] Shutting down...");
  stopWebSocketServer();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: true }).show();
  }
}

// ─── Unhandled errors ───────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[Companion] Uncaught exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[Companion] Unhandled rejection:", err);
});
