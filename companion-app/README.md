# IECentral Companion App

Lightweight desktop companion for IECentral video meetings that enables full
remote desktop control. The app runs on the machine being controlled, receives
mouse and keyboard commands from the browser via a local WebSocket, and
executes them at the OS level.

## How It Works

1. The companion app starts and listens on `ws://127.0.0.1:8787`.
2. When a user joins an IECentral meeting and starts screen sharing, the
   browser automatically detects the companion app by sending a `ping` to the
   local WebSocket.
3. When a remote participant is granted control, mouse and keyboard events
   flow through the WebRTC data channel to the sharer's browser, which
   forwards them over WebSocket to the companion app.
4. The companion app translates the events into OS-level input using
   `@nut-tree/nut-js`, giving the remote user full desktop control (not just
   browser-tab control).

## Prerequisites

- **Node.js** 18+ and npm
- **macOS**: Accessibility permissions must be granted in
  System Settings > Privacy & Security > Accessibility.
- **Windows**: Run as administrator if UAC-protected apps need to be controlled.

## Installation

```bash
cd companion-app
npm install
```

## Development

```bash
npm start
```

This launches the Electron app. It will appear as a tray icon (no visible
window). The tray icon shows connection status:

| Color  | Meaning                            |
|--------|------------------------------------|
| Gray   | Waiting for a browser connection   |
| Green  | Browser session connected          |
| Yellow | Session ended / disconnected       |
| Red    | Error (e.g., port already in use)  |

## Building for Distribution

### macOS

```bash
npm run build:mac
```

Produces a `.dmg` in the `dist/` directory.

### Windows

```bash
npm run build:win
```

Produces an NSIS installer in the `dist/` directory.

## Architecture

```
companion-app/
  src/
    main.js              Electron main process entry point
    ws-server.js         WebSocket server (port 8787)
    input-controller.js  Translates messages to OS-level input
    tray.js              System tray icon and context menu
    permissions.js       macOS accessibility permission check
    preload.js           Electron preload (minimal)
  assets/
    ICON_REQUIREMENTS.md  Describes needed icon assets
  entitlements.mac.plist  macOS code-signing entitlements
  package.json
  README.md
```

## Message Protocol

All messages are JSON over WebSocket.

### Detection

| Direction       | Type   | Fields                        |
|-----------------|--------|-------------------------------|
| Browser -> App  | `ping` | —                             |
| App -> Browser  | `pong` | `version`, `timestamp`        |

### Input Events (Browser -> App)

| Type         | Fields                                              |
|--------------|-----------------------------------------------------|
| `mouse-move` | `x`, `y` (normalized 0-1)                           |
| `mouse-down` | `x`, `y`, `button` (0=left, 1=middle, 2=right)      |
| `mouse-up`   | `x`, `y`, `button`                                  |
| `key-down`   | `key`, `code`, `ctrlKey`, `shiftKey`, `altKey`, `metaKey` |
| `key-up`     | `key`, `code`                                       |
| `scroll`     | `deltaX`, `deltaY`, `x`, `y`                        |

Coordinates are normalized to 0-1 range (fraction of screen width/height).
The companion app converts them to actual pixel coordinates using the current
screen resolution.

## Security

- The WebSocket server binds to `127.0.0.1` only (no network access).
- Origin validation restricts connections to IECentral domains and localhost.
- Only one browser client can connect at a time.
- All actions are logged to stdout for auditing.

## Troubleshooting

**"Port 8787 is already in use"**
Another instance of the companion app (or another service) is using port 8787.
Quit the other instance or change the port.

**Mouse/keyboard not working on macOS**
Open System Settings > Privacy & Security > Accessibility and ensure
IECentral Companion is listed and checked.

**"Browser-Only Control" shown instead of "Full Desktop Control"**
The companion app is not running or the browser could not connect to it.
Check that the app is running (look for the tray icon) and that no firewall
is blocking localhost connections.
