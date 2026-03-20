// ─── WebSocket Server ───────────────────────────────────────────────────────
// Accepts a single browser connection at a time on ws://localhost:8787.
// Validates origin, handles incoming remote-control messages, and dispatches
// them to the input controller.

const { WebSocketServer } = require("ws");
const { handleRemoteControlMessage } = require("./input-controller");

// ─── State ──────────────────────────────────────────────────────────────────

let wss = null;
let activeClient = null;
let callbacks = {};
let heartbeatInterval = null;

// ─── Allowed origins ────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "http://localhost",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://iecentral.com",
  "https://www.iecentral.com",
  "https://app.iecentral.com",
];

function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(
    (allowed) => origin === allowed || origin.startsWith(allowed)
  );
}

// ─── Start server ───────────────────────────────────────────────────────────

function startWebSocketServer({ port, onClientConnected, onClientDisconnected, onError }) {
  callbacks = { onClientConnected, onClientDisconnected, onError };

  wss = new WebSocketServer({
    port,
    host: "127.0.0.1", // Only accept local connections
    maxPayload: 64 * 1024, // 64KB max message size
  });

  wss.on("listening", () => {
    console.log(`[WS] Server listening on ws://127.0.0.1:${port}`);
  });

  wss.on("connection", (ws, req) => {
    const origin = req.headers.origin || "";
    const remoteAddr = req.socket.remoteAddress;

    console.log(`[WS] Connection attempt from origin="${origin}" addr=${remoteAddr}`);

    // Validate origin
    if (!isOriginAllowed(origin)) {
      console.warn(`[WS] Rejected connection from disallowed origin: ${origin}`);
      ws.close(4003, "Origin not allowed");
      return;
    }

    // Only allow one active client at a time
    if (activeClient && activeClient.readyState === activeClient.OPEN) {
      console.warn("[WS] Rejecting connection: another client is already active");
      ws.close(4001, "Another client is already connected");
      return;
    }

    activeClient = ws;
    const clientInfo = `${origin} (${remoteAddr})`;
    callbacks.onClientConnected?.(clientInfo);

    // Set up heartbeat
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        console.warn("[WS] Invalid JSON received:", data.toString().slice(0, 100));
        return;
      }

      // Handle ping/pong for companion app detection
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", version: "1.0.0", timestamp: Date.now() }));
        return;
      }

      // Forward to input controller
      try {
        handleRemoteControlMessage(msg);
      } catch (err) {
        console.error("[WS] Error handling message:", err.message);
        // Send error back to client
        ws.send(JSON.stringify({
          type: "error",
          message: err.message,
        }));
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[WS] Client disconnected: code=${code} reason=${reason}`);
      if (activeClient === ws) {
        activeClient = null;
        callbacks.onClientDisconnected?.();
      }
    });

    ws.on("error", (err) => {
      console.error("[WS] Client error:", err.message);
      if (activeClient === ws) {
        activeClient = null;
        callbacks.onError?.(err);
      }
    });
  });

  wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[WS] Port ${port} is already in use. Is another companion app running?`);
    } else {
      console.error("[WS] Server error:", err.message);
    }
    callbacks.onError?.(err);
  });

  // Heartbeat — close dead connections every 30s
  heartbeatInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log("[WS] Terminating unresponsive client");
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
}

// ─── Stop server ────────────────────────────────────────────────────────────

function stopWebSocketServer() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (activeClient) {
    activeClient.close(1000, "Server shutting down");
    activeClient = null;
  }

  if (wss) {
    wss.close(() => {
      console.log("[WS] Server closed");
    });
    wss = null;
  }
}

// ─── Send message to active client ─────────────────────────────────────────

function sendToClient(msg) {
  if (activeClient && activeClient.readyState === activeClient.OPEN) {
    activeClient.send(JSON.stringify(msg));
  }
}

module.exports = {
  startWebSocketServer,
  stopWebSocketServer,
  sendToClient,
};
