"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Message types ───────────────────────────────────────────────────────────

interface RemoteControlMessage {
  type:
    | "request-control"
    | "grant-control"
    | "revoke-control"
    | "release-control"
    | "deny-control"
    | "mouse-move"
    | "mouse-down"
    | "mouse-up"
    | "key-down"
    | "key-up"
    | "scroll";
  fromParticipantId: string;
  displayName?: string;
  // Mouse event fields (normalised 0-1)
  x?: number;
  y?: number;
  button?: number;
  // Keyboard event fields
  key?: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  // Scroll
  deltaX?: number;
  deltaY?: number;
}

// ─── Companion app message types ────────────────────────────────────────────

interface CompanionMessage {
  type: string;
  x?: number;
  y?: number;
  button?: number | string;
  key?: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  deltaX?: number;
  deltaY?: number;
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface ControlRequest {
  participantId: string;
  displayName: string;
}

export interface IncomingRemoteEvent {
  type: "mouse-move" | "mouse-down" | "mouse-up" | "key-down" | "key-up" | "scroll";
  x?: number;
  y?: number;
  button?: number;
  key?: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  deltaX?: number;
  deltaY?: number;
  fromParticipantId: string;
}

export interface UseRemoteControlOptions {
  peerConnections: Map<string, RTCPeerConnection>;
  myParticipantId: string;
  myDisplayName: string;
  isScreenSharing: boolean;
}

export interface UseRemoteControlReturn {
  // Sharer side
  controlRequests: ControlRequest[];
  activeController: string | null;
  activeControllerName: string | null;
  grantControl: (participantId: string) => void;
  revokeControl: () => void;
  denyControl: (participantId: string) => void;

  // Viewer side
  requestControl: (targetParticipantId: string) => void;
  releaseControl: () => void;
  hasControl: boolean;
  controlGranted: boolean;
  controlTarget: string | null; // who I requested/have control of

  // Mouse/keyboard handlers the viewer overlay calls
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onKeyUp: (e: React.KeyboardEvent) => void;
  onWheel: (e: React.WheelEvent) => void;

  // Sharer receives these to render the remote cursor / events
  incomingRemoteEvents: IncomingRemoteEvent[];
  remoteCursorPosition: { x: number; y: number } | null;

  // Companion app status
  companionAppConnected: boolean;
}

// ─── Companion App WebSocket connection ─────────────────────────────────────

const COMPANION_WS_URL = "ws://127.0.0.1:8787";
const COMPANION_RECONNECT_INTERVAL = 5000;
const COMPANION_PING_TIMEOUT = 3000;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRemoteControl({
  peerConnections,
  myParticipantId,
  myDisplayName,
  isScreenSharing,
}: UseRemoteControlOptions): UseRemoteControlReturn {
  // ── Sharer state ──
  const [controlRequests, setControlRequests] = useState<ControlRequest[]>([]);
  const [activeController, setActiveController] = useState<string | null>(null);
  const [activeControllerName, setActiveControllerName] = useState<string | null>(null);

  // ── Viewer state ──
  const [controlGranted, setControlGranted] = useState(false);
  const [controlTarget, setControlTarget] = useState<string | null>(null);

  // ── Shared ──
  const [remoteCursorPosition, setRemoteCursorPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [incomingRemoteEvents, setIncomingRemoteEvents] = useState<
    IncomingRemoteEvent[]
  >([]);

  // ── Companion app state ──
  const [companionAppConnected, setCompanionAppConnected] = useState(false);
  const companionWsRef = useRef<WebSocket | null>(null);
  const companionReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companionMountedRef = useRef(true);

  // Data channels keyed by remote participant id
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  // Track which PCs we have already set up listeners for
  const setupPCsRef = useRef<Set<string>>(new Set());

  // ── Companion app detection & connection ──

  const connectToCompanionApp = useCallback(() => {
    if (!companionMountedRef.current) return;
    if (companionWsRef.current?.readyState === WebSocket.OPEN) return;

    // Close any existing connection
    if (companionWsRef.current) {
      companionWsRef.current.onclose = null;
      companionWsRef.current.onerror = null;
      companionWsRef.current.close();
      companionWsRef.current = null;
    }

    try {
      const ws = new WebSocket(COMPANION_WS_URL);
      companionWsRef.current = ws;

      let pingTimeout: ReturnType<typeof setTimeout> | null = null;

      ws.onopen = () => {
        console.log("[useRemoteControl] WebSocket to companion app opened, sending ping...");
        // Send ping to verify it is the companion app
        ws.send(JSON.stringify({ type: "ping" }));

        // Set timeout for pong response
        pingTimeout = setTimeout(() => {
          console.warn("[useRemoteControl] Companion app did not respond to ping");
          ws.close();
        }, COMPANION_PING_TIMEOUT);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") {
            // Companion app confirmed
            if (pingTimeout) {
              clearTimeout(pingTimeout);
              pingTimeout = null;
            }
            console.log("[useRemoteControl] Companion app detected, version:", msg.version);
            setCompanionAppConnected(true);
          } else if (msg.type === "error") {
            console.warn("[useRemoteControl] Companion app error:", msg.message);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        console.log("[useRemoteControl] Companion app WebSocket closed");
        if (pingTimeout) {
          clearTimeout(pingTimeout);
          pingTimeout = null;
        }
        companionWsRef.current = null;
        setCompanionAppConnected(false);

        // Schedule reconnection attempt
        if (companionMountedRef.current) {
          companionReconnectTimerRef.current = setTimeout(() => {
            connectToCompanionApp();
          }, COMPANION_RECONNECT_INTERVAL);
        }
      };

      ws.onerror = () => {
        // Error will be followed by onclose, so no need to handle separately
        // Just suppress the console error for expected connection failures
      };
    } catch {
      // WebSocket constructor can throw if URL is invalid, but ours is static
      // Schedule retry
      if (companionMountedRef.current) {
        companionReconnectTimerRef.current = setTimeout(() => {
          connectToCompanionApp();
        }, COMPANION_RECONNECT_INTERVAL);
      }
    }
  }, []);

  // Start companion app detection on mount
  useEffect(() => {
    companionMountedRef.current = true;
    connectToCompanionApp();

    return () => {
      companionMountedRef.current = false;
      if (companionReconnectTimerRef.current) {
        clearTimeout(companionReconnectTimerRef.current);
        companionReconnectTimerRef.current = null;
      }
      if (companionWsRef.current) {
        companionWsRef.current.onclose = null;
        companionWsRef.current.onerror = null;
        companionWsRef.current.close();
        companionWsRef.current = null;
      }
      setCompanionAppConnected(false);
    };
  }, [connectToCompanionApp]);

  // ── Forward events to companion app ──

  const forwardToCompanionApp = useCallback((msg: CompanionMessage) => {
    const ws = companionWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        console.error("[useRemoteControl] Failed to forward to companion app:", err);
      }
    }
  }, []);

  // ── Data channel setup ──

  useEffect(() => {
    const channels = dataChannelsRef.current;
    const setupPCs = setupPCsRef.current;

    for (const [peerId, pc] of peerConnections) {
      if (setupPCs.has(peerId)) continue;
      setupPCs.add(peerId);

      // Create outgoing data channel
      try {
        const dc = pc.createDataChannel("remote-control", {
          ordered: true,
        });

        dc.onopen = () => {
          channels.set(peerId, dc);
        };

        dc.onclose = () => {
          channels.delete(peerId);
        };

        dc.onmessage = (event) => {
          handleIncomingMessage(peerId, event.data);
        };
      } catch {
        // Data channel may already exist or PC might be closed
      }

      // Listen for incoming data channels from remote
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        if (dc.label !== "remote-control") return;

        dc.onopen = () => {
          channels.set(peerId, dc);
        };

        dc.onclose = () => {
          channels.delete(peerId);
        };

        dc.onmessage = (ev) => {
          handleIncomingMessage(peerId, ev.data);
        };
      };
    }

    // Clean up channels for PCs that are gone
    for (const peerId of channels.keys()) {
      if (!peerConnections.has(peerId)) {
        channels.get(peerId)?.close();
        channels.delete(peerId);
        setupPCs.delete(peerId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerConnections, myParticipantId]);

  // ── Send helper ──

  const sendToParticipant = useCallback(
    (participantId: string, msg: RemoteControlMessage) => {
      const dc = dataChannelsRef.current.get(participantId);
      if (dc && dc.readyState === "open") {
        try {
          dc.send(JSON.stringify(msg));
        } catch (err) {
          console.error("[useRemoteControl] Failed to send:", err);
        }
      }
    },
    []
  );

  // ── Incoming message handler ──

  const handleIncomingMessage = useCallback(
    (fromPeerId: string, raw: string) => {
      let msg: RemoteControlMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.type) {
        case "request-control": {
          // I am the screen sharer; someone wants control
          setControlRequests((prev) => {
            if (prev.some((r) => r.participantId === msg.fromParticipantId))
              return prev;
            return [
              ...prev,
              {
                participantId: msg.fromParticipantId,
                displayName: msg.displayName || "Participant",
              },
            ];
          });
          break;
        }

        case "grant-control": {
          // I am the viewer; the sharer granted my request
          setControlGranted(true);
          break;
        }

        case "deny-control": {
          // Sharer denied my request
          setControlTarget(null);
          setControlGranted(false);
          break;
        }

        case "revoke-control": {
          // Sharer revoked control
          setControlGranted(false);
          setControlTarget(null);
          break;
        }

        case "release-control": {
          // Viewer released control
          setActiveController(null);
          setActiveControllerName(null);
          setRemoteCursorPosition(null);
          break;
        }

        case "mouse-move": {
          // I am the sharer; viewer is moving the mouse
          setRemoteCursorPosition({
            x: msg.x ?? 0,
            y: msg.y ?? 0,
          });

          const event: IncomingRemoteEvent = {
            type: msg.type,
            x: msg.x,
            y: msg.y,
            fromParticipantId: msg.fromParticipantId,
          };
          setIncomingRemoteEvents((prev) => [...prev.slice(-49), event]);

          // Forward to companion app for OS-level cursor control
          forwardToCompanionApp({
            type: "mouse-move",
            x: msg.x,
            y: msg.y,
          });
          break;
        }

        case "mouse-down":
        case "mouse-up": {
          const event: IncomingRemoteEvent = {
            type: msg.type,
            x: msg.x,
            y: msg.y,
            button: msg.button,
            fromParticipantId: msg.fromParticipantId,
          };
          setIncomingRemoteEvents((prev) => [...prev.slice(-49), event]);

          // Forward to companion app
          forwardToCompanionApp({
            type: msg.type,
            x: msg.x,
            y: msg.y,
            button: msg.button,
          });
          break;
        }

        case "key-down":
        case "key-up": {
          const event: IncomingRemoteEvent = {
            type: msg.type,
            key: msg.key,
            code: msg.code,
            shiftKey: msg.shiftKey,
            ctrlKey: msg.ctrlKey,
            altKey: msg.altKey,
            metaKey: msg.metaKey,
            fromParticipantId: msg.fromParticipantId,
          };
          setIncomingRemoteEvents((prev) => [...prev.slice(-49), event]);

          // Forward to companion app
          forwardToCompanionApp({
            type: msg.type,
            key: msg.key,
            code: msg.code,
            shiftKey: msg.shiftKey,
            ctrlKey: msg.ctrlKey,
            altKey: msg.altKey,
            metaKey: msg.metaKey,
          });
          break;
        }

        case "scroll": {
          const event: IncomingRemoteEvent = {
            type: msg.type,
            deltaX: msg.deltaX,
            deltaY: msg.deltaY,
            fromParticipantId: msg.fromParticipantId,
          };
          setIncomingRemoteEvents((prev) => [...prev.slice(-49), event]);

          // Forward to companion app
          forwardToCompanionApp({
            type: "scroll",
            deltaX: msg.deltaX,
            deltaY: msg.deltaY,
          });
          break;
        }
      }
    },
    [forwardToCompanionApp]
  );

  // ── Reset state when screen sharing stops ──

  useEffect(() => {
    if (!isScreenSharing) {
      // If we were the sharer and stopped, revoke any active controller
      if (activeController) {
        sendToParticipant(activeController, {
          type: "revoke-control",
          fromParticipantId: myParticipantId,
        });
      }
      setControlRequests([]);
      setActiveController(null);
      setActiveControllerName(null);
      setRemoteCursorPosition(null);
      setIncomingRemoteEvents([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScreenSharing]);

  // ── Sharer actions ──

  const grantControl = useCallback(
    (participantId: string) => {
      const request = controlRequests.find(
        (r) => r.participantId === participantId
      );

      // Revoke from previous controller if any
      if (activeController && activeController !== participantId) {
        sendToParticipant(activeController, {
          type: "revoke-control",
          fromParticipantId: myParticipantId,
        });
      }

      setActiveController(participantId);
      setActiveControllerName(request?.displayName || "Participant");
      setControlRequests((prev) =>
        prev.filter((r) => r.participantId !== participantId)
      );

      sendToParticipant(participantId, {
        type: "grant-control",
        fromParticipantId: myParticipantId,
      });
    },
    [controlRequests, activeController, myParticipantId, sendToParticipant]
  );

  const revokeControl = useCallback(() => {
    if (activeController) {
      sendToParticipant(activeController, {
        type: "revoke-control",
        fromParticipantId: myParticipantId,
      });
    }
    setActiveController(null);
    setActiveControllerName(null);
    setRemoteCursorPosition(null);
  }, [activeController, myParticipantId, sendToParticipant]);

  const denyControl = useCallback(
    (participantId: string) => {
      setControlRequests((prev) =>
        prev.filter((r) => r.participantId !== participantId)
      );
      sendToParticipant(participantId, {
        type: "deny-control",
        fromParticipantId: myParticipantId,
      });
    },
    [myParticipantId, sendToParticipant]
  );

  // ── Viewer actions ──

  const requestControl = useCallback(
    (targetParticipantId: string) => {
      setControlTarget(targetParticipantId);
      setControlGranted(false);
      sendToParticipant(targetParticipantId, {
        type: "request-control",
        fromParticipantId: myParticipantId,
        displayName: myDisplayName,
      });
    },
    [myParticipantId, myDisplayName, sendToParticipant]
  );

  const releaseControl = useCallback(() => {
    if (controlTarget) {
      sendToParticipant(controlTarget, {
        type: "release-control",
        fromParticipantId: myParticipantId,
      });
    }
    setControlGranted(false);
    setControlTarget(null);
  }, [controlTarget, myParticipantId, sendToParticipant]);

  // ── Mouse / keyboard event handlers (viewer sends these) ──

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!controlGranted || !controlTarget) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      sendToParticipant(controlTarget, {
        type: "mouse-move",
        fromParticipantId: myParticipantId,
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    },
    [controlGranted, controlTarget, myParticipantId, sendToParticipant]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!controlGranted || !controlTarget) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      sendToParticipant(controlTarget, {
        type: "mouse-down",
        fromParticipantId: myParticipantId,
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
        button: e.button,
      });
    },
    [controlGranted, controlTarget, myParticipantId, sendToParticipant]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!controlGranted || !controlTarget) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      sendToParticipant(controlTarget, {
        type: "mouse-up",
        fromParticipantId: myParticipantId,
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
        button: e.button,
      });
    },
    [controlGranted, controlTarget, myParticipantId, sendToParticipant]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!controlGranted || !controlTarget) return;

      // Escape releases control
      if (e.key === "Escape") {
        releaseControl();
        return;
      }

      e.preventDefault();
      sendToParticipant(controlTarget, {
        type: "key-down",
        fromParticipantId: myParticipantId,
        key: e.key,
        code: e.code,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    },
    [
      controlGranted,
      controlTarget,
      myParticipantId,
      sendToParticipant,
      releaseControl,
    ]
  );

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (!controlGranted || !controlTarget) return;
      e.preventDefault();
      sendToParticipant(controlTarget, {
        type: "key-up",
        fromParticipantId: myParticipantId,
        key: e.key,
        code: e.code,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    },
    [controlGranted, controlTarget, myParticipantId, sendToParticipant]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!controlGranted || !controlTarget) return;
      sendToParticipant(controlTarget, {
        type: "scroll",
        fromParticipantId: myParticipantId,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
      });
    },
    [controlGranted, controlTarget, myParticipantId, sendToParticipant]
  );

  return {
    // Sharer
    controlRequests,
    activeController,
    activeControllerName,
    grantControl,
    revokeControl,
    denyControl,

    // Viewer
    requestControl,
    releaseControl,
    hasControl: controlGranted,
    controlGranted,
    controlTarget,

    // Event handlers
    onMouseMove,
    onMouseDown,
    onMouseUp,
    onKeyDown,
    onKeyUp,
    onWheel,

    // Incoming events for sharer overlay
    incomingRemoteEvents,
    remoteCursorPosition,

    // Companion app
    companionAppConnected,
  };
}
