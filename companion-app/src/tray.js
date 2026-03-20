// ─── System Tray Management ─────────────────────────────────────────────────

const { Tray, Menu, nativeImage, shell, app } = require("electron");
const path = require("path");

let tray = null;
let currentStatus = "waiting"; // "waiting" | "connected" | "disconnected" | "error"
let connectedClientInfo = "";

// ─── Tray icon generation ───────────────────────────────────────────────────
// We generate simple icons programmatically (colored circles) so we do not
// depend on external image files that may be missing.

function createTrayImage(color) {
  // Create a 22x22 PNG nativeImage (standard tray icon size on macOS)
  // Using a simple data URL approach
  const size = 22;
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="11" cy="11" r="8" fill="${color}" stroke="white" stroke-width="1.5"/>
    <text x="11" y="15" text-anchor="middle" fill="white" font-size="10" font-family="Arial" font-weight="bold">R</text>
  </svg>`;

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString("base64")}`;
  const img = nativeImage.createFromDataURL(dataUrl);
  return img.resize({ width: 22, height: 22 });
}

const STATUS_COLORS = {
  waiting: "#6B7280",      // Gray — waiting for connection
  connected: "#22C55E",    // Green — client connected
  disconnected: "#EAB308", // Yellow — was connected, now disconnected
  error: "#EF4444",        // Red — error state
};

const STATUS_LABELS = {
  waiting: "Waiting for connection...",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
};

// ─── Create tray ────────────────────────────────────────────────────────────

function createTray() {
  const icon = createTrayImage(STATUS_COLORS.waiting);
  tray = new Tray(icon);
  tray.setToolTip("IECentral Companion — Waiting for connection");
  rebuildMenu();

  tray.on("click", () => {
    // On click, show the context menu (especially useful on Windows)
    tray.popUpContextMenu();
  });

  return tray;
}

// ─── Rebuild context menu ───────────────────────────────────────────────────

function rebuildMenu() {
  if (!tray) return;

  const statusLabel = STATUS_LABELS[currentStatus] || "Unknown";
  const clientLabel = connectedClientInfo ? ` (${connectedClientInfo})` : "";

  const menu = Menu.buildFromTemplate([
    {
      label: `IECentral Companion v1.0.0`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: `Status: ${statusLabel}${clientLabel}`,
      enabled: false,
      icon: createTrayImage(STATUS_COLORS[currentStatus]),
    },
    { type: "separator" },
    {
      label: "Open IECentral",
      click: () => {
        shell.openExternal("https://iecentral.com");
      },
    },
    {
      label: "Open IECentral (localhost)",
      click: () => {
        shell.openExternal("http://localhost:3000");
      },
    },
    { type: "separator" },
    {
      label: "About",
      click: () => {
        const { dialog } = require("electron");
        dialog.showMessageBox({
          type: "info",
          title: "IECentral Companion",
          message: "IECentral Companion v1.0.0",
          detail:
            "Remote Desktop Control companion app for IECentral video meetings.\n\n" +
            "This app runs in the background and receives mouse/keyboard commands " +
            "from the browser via WebSocket, executing them at the OS level.\n\n" +
            "WebSocket server: ws://127.0.0.1:8787",
        });
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

// ─── Update status ──────────────────────────────────────────────────────────

function updateTrayStatus(status, clientInfo) {
  currentStatus = status;
  if (clientInfo !== undefined) {
    connectedClientInfo = clientInfo;
  }

  if (tray) {
    const icon = createTrayImage(STATUS_COLORS[status] || STATUS_COLORS.waiting);
    tray.setImage(icon);
    tray.setToolTip(`IECentral Companion — ${STATUS_LABELS[status] || "Unknown"}`);
    rebuildMenu();
  }
}

// ─── Destroy ────────────────────────────────────────────────────────────────

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  createTray,
  updateTrayStatus,
  destroyTray,
};
