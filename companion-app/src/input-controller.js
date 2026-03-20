// ─── Input Controller ───────────────────────────────────────────────────────
// Translates incoming remote-control messages into OS-level mouse/keyboard
// actions using robotjs.

const robot = require("robotjs");

// ─── Configuration ──────────────────────────────────────────────────────────

// Set mouse movement speed (0 = instant)
robot.setMouseDelay(0);
robot.setKeyboardDelay(0);

// ─── Screen dimensions cache ────────────────────────────────────────────────

let screenWidth = 1920;
let screenHeight = 1080;
let screenUpdateInterval = null;

function updateScreenDimensions() {
  try {
    const size = robot.getScreenSize();
    if (size.width > 0 && size.height > 0) {
      screenWidth = size.width;
      screenHeight = size.height;
    }
  } catch (err) {
    console.warn("[Input] Failed to get screen dimensions:", err.message);
  }
}

// Update screen dimensions periodically (handles resolution changes)
updateScreenDimensions();
screenUpdateInterval = setInterval(updateScreenDimensions, 10000);

// ─── Key mapping ────────────────────────────────────────────────────────────
// Maps browser KeyboardEvent.key values to robotjs key names

const BROWSER_KEY_TO_ROBOT = {
  // Modifiers
  Control: "control",
  Shift: "shift",
  Alt: "alt",
  Meta: "command",

  // Navigation
  Enter: "enter",
  Tab: "tab",
  Escape: "escape",
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",

  // Arrows
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",

  // Function keys
  F1: "f1", F2: "f2", F3: "f3", F4: "f4",
  F5: "f5", F6: "f6", F7: "f7", F8: "f8",
  F9: "f9", F10: "f10", F11: "f11", F12: "f12",

  // Whitespace
  " ": "space",

  // Special
  CapsLock: "caps_lock",
  NumLock: "numlock",
  PrintScreen: "printscreen",
};

// Map browser key codes to robotjs key names
const CODE_TO_ROBOT = {};
// Letters a-z
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(97 + i); // a-z
  CODE_TO_ROBOT[`Key${letter.toUpperCase()}`] = letter;
}
// Digits 0-9
for (let i = 0; i <= 9; i++) {
  CODE_TO_ROBOT[`Digit${i}`] = String(i);
}
// Numpad
for (let i = 0; i <= 9; i++) {
  CODE_TO_ROBOT[`Numpad${i}`] = `numpad_${i}`;
}

Object.assign(CODE_TO_ROBOT, {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  NumpadAdd: "numpad_+",
  NumpadSubtract: "numpad_-",
  NumpadMultiply: "numpad_*",
  NumpadDivide: "numpad_/",
  NumpadDecimal: "numpad_.",
  NumpadEnter: "enter",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  ControlLeft: "control",
  ControlRight: "control",
  AltLeft: "alt",
  AltRight: "alt",
  MetaLeft: "command",
  MetaRight: "command",
});

function resolveKey(key, code) {
  // Try code-based mapping first (more precise)
  if (code && CODE_TO_ROBOT[code] !== undefined) {
    return CODE_TO_ROBOT[code];
  }
  // Then try key-name mapping
  if (BROWSER_KEY_TO_ROBOT[key] !== undefined) {
    return BROWSER_KEY_TO_ROBOT[key];
  }
  // For single printable characters, use the character directly (lowercase)
  if (key && key.length === 1) {
    return key.toLowerCase();
  }
  return null;
}

// ─── Coordinate conversion ──────────────────────────────────────────────────

function toScreenCoords(normX, normY) {
  const x = Math.round(Math.max(0, Math.min(1, normX)) * screenWidth);
  const y = Math.round(Math.max(0, Math.min(1, normY)) * screenHeight);
  return { x, y };
}

// ─── Button mapping ─────────────────────────────────────────────────────────

function resolveButton(button) {
  switch (button) {
    case 0:
    case "left":
      return "left";
    case 1:
    case "middle":
      return "middle";
    case 2:
    case "right":
      return "right";
    default:
      return "left";
  }
}

// ─── Throttle for mouse-move ────────────────────────────────────────────────

let lastMoveTime = 0;
const MOVE_THROTTLE_MS = 8; // ~120fps max

// Track pressed modifier keys for keyboard combinations
const pressedModifiers = new Set();

// ─── Message handler ────────────────────────────────────────────────────────

function handleRemoteControlMessage(msg) {
  const { type } = msg;

  try {
    switch (type) {
      // ── Mouse move ──────────────────────────────────────────────────────
      case "mouse-move": {
        const now = Date.now();
        if (now - lastMoveTime < MOVE_THROTTLE_MS) return;
        lastMoveTime = now;

        const { x, y } = toScreenCoords(msg.x, msg.y);
        robot.moveMouse(x, y);
        break;
      }

      // ── Mouse down ──────────────────────────────────────────────────────
      case "mouse-down": {
        if (msg.x !== undefined && msg.y !== undefined) {
          const { x, y } = toScreenCoords(msg.x, msg.y);
          robot.moveMouse(x, y);
        }
        const btn = resolveButton(msg.button);
        robot.mouseToggle("down", btn);
        console.log(`[Input] mouse-down button=${btn}`);
        break;
      }

      // ── Mouse up ────────────────────────────────────────────────────────
      case "mouse-up": {
        if (msg.x !== undefined && msg.y !== undefined) {
          const { x, y } = toScreenCoords(msg.x, msg.y);
          robot.moveMouse(x, y);
        }
        const btn = resolveButton(msg.button);
        robot.mouseToggle("up", btn);
        console.log(`[Input] mouse-up button=${btn}`);
        break;
      }

      // ── Key down ────────────────────────────────────────────────────────
      case "key-down": {
        const robotKey = resolveKey(msg.key, msg.code);
        if (robotKey !== null) {
          // Track modifiers
          if (["control", "shift", "alt", "command"].includes(robotKey)) {
            pressedModifiers.add(robotKey);
          }

          // Build modifier array for key combinations
          const modifiers = [...pressedModifiers].filter(m => m !== robotKey);

          if (modifiers.length > 0) {
            robot.keyTap(robotKey, modifiers);
            console.log(`[Input] key-tap ${robotKey} + [${modifiers.join(",")}]`);
          } else {
            robot.keyToggle(robotKey, "down");
            console.log(`[Input] key-down "${robotKey}"`);
          }
        } else {
          console.warn(`[Input] Unmapped key: key="${msg.key}" code="${msg.code}"`);
        }
        break;
      }

      // ── Key up ──────────────────────────────────────────────────────────
      case "key-up": {
        const robotKey = resolveKey(msg.key, msg.code);
        if (robotKey !== null) {
          // Remove from tracked modifiers
          pressedModifiers.delete(robotKey);
          robot.keyToggle(robotKey, "up");
        }
        break;
      }

      // ── Scroll ──────────────────────────────────────────────────────────
      case "scroll": {
        if (msg.x !== undefined && msg.y !== undefined) {
          const { x, y } = toScreenCoords(msg.x, msg.y);
          robot.moveMouse(x, y);
        }

        const deltaY = msg.deltaY || 0;
        const deltaX = msg.deltaX || 0;

        // robotjs scrollMouse(x, y) — positive = down/right, negative = up/left
        const scrollY = Math.round(deltaY / 100) || (deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0);
        const scrollX = Math.round(deltaX / 100) || (deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0);

        if (scrollY !== 0 || scrollX !== 0) {
          robot.scrollMouse(scrollX, scrollY);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[Input] Error handling ${type}:`, err.message);
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function cleanup() {
  if (screenUpdateInterval) {
    clearInterval(screenUpdateInterval);
    screenUpdateInterval = null;
  }
  pressedModifiers.clear();
}

module.exports = {
  handleRemoteControlMessage,
  cleanup,
};
