// ─── Input Controller ───────────────────────────────────────────────────────
// Translates incoming remote-control messages into OS-level mouse/keyboard
// actions using @nut-tree/nut-js.

const { mouse, keyboard, screen, Button, Key, Point } = require("@nut-tree/nut-js");

// ─── Configuration ──────────────────────────────────────────────────────────

// Reduce mouse movement delay for smoother control
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

// ─── Screen dimensions cache ────────────────────────────────────────────────

let screenWidth = 1920;
let screenHeight = 1080;
let screenUpdateInterval = null;

async function updateScreenDimensions() {
  try {
    const width = await screen.width();
    const height = await screen.height();
    if (width > 0 && height > 0) {
      screenWidth = width;
      screenHeight = height;
    }
  } catch (err) {
    console.warn("[Input] Failed to get screen dimensions:", err.message);
  }
}

// Update screen dimensions periodically (handles resolution changes)
updateScreenDimensions();
screenUpdateInterval = setInterval(updateScreenDimensions, 10000);

// ─── Key mapping ────────────────────────────────────────────────────────────

const BROWSER_KEY_TO_NUT = {
  // Modifiers
  Control: Key.LeftControl,
  Shift: Key.LeftShift,
  Alt: Key.LeftAlt,
  Meta: Key.LeftSuper,

  // Navigation
  Enter: Key.Enter,
  Tab: Key.Tab,
  Escape: Key.Escape,
  Backspace: Key.Backspace,
  Delete: Key.Delete,
  Insert: Key.Insert,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,

  // Arrows
  ArrowUp: Key.Up,
  ArrowDown: Key.Down,
  ArrowLeft: Key.Left,
  ArrowRight: Key.Right,

  // Function keys
  F1: Key.F1,
  F2: Key.F2,
  F3: Key.F3,
  F4: Key.F4,
  F5: Key.F5,
  F6: Key.F6,
  F7: Key.F7,
  F8: Key.F8,
  F9: Key.F9,
  F10: Key.F10,
  F11: Key.F11,
  F12: Key.F12,

  // Whitespace
  " ": Key.Space,

  // Punctuation & symbols
  CapsLock: Key.CapsLock,
  NumLock: Key.NumLock,
  ScrollLock: Key.ScrollLock,
  PrintScreen: Key.Print,
  Pause: Key.Pause,
  ContextMenu: Key.Menu,
};

// Map browser key codes (e.g., "KeyA") to nut-js Key values
const CODE_TO_NUT = {};
// Letters A-Z
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i); // A-Z
  CODE_TO_NUT[`Key${letter}`] = Key[letter];
}
// Digits 0-9
for (let i = 0; i <= 9; i++) {
  CODE_TO_NUT[`Digit${i}`] = Key[`Num${i}`];
}
// Numpad 0-9
for (let i = 0; i <= 9; i++) {
  CODE_TO_NUT[`Numpad${i}`] = Key[`NumPad${i}`];
}

// Additional code mappings
Object.assign(CODE_TO_NUT, {
  Minus: Key.Minus,
  Equal: Key.Equal,
  BracketLeft: Key.LeftBracket,
  BracketRight: Key.RightBracket,
  Backslash: Key.Backslash,
  Semicolon: Key.Semicolon,
  Quote: Key.Quote,
  Comma: Key.Comma,
  Period: Key.Period,
  Slash: Key.Slash,
  Backquote: Key.Grave,
  NumpadAdd: Key.Add,
  NumpadSubtract: Key.Subtract,
  NumpadMultiply: Key.Multiply,
  NumpadDivide: Key.Divide,
  NumpadDecimal: Key.Decimal,
  NumpadEnter: Key.Enter,
  ShiftLeft: Key.LeftShift,
  ShiftRight: Key.RightShift,
  ControlLeft: Key.LeftControl,
  ControlRight: Key.RightControl,
  AltLeft: Key.LeftAlt,
  AltRight: Key.RightAlt,
  MetaLeft: Key.LeftSuper,
  MetaRight: Key.RightSuper,
});

function resolveKey(key, code) {
  // Try code-based mapping first (more precise)
  if (code && CODE_TO_NUT[code] !== undefined) {
    return CODE_TO_NUT[code];
  }
  // Then try key-name mapping
  if (BROWSER_KEY_TO_NUT[key] !== undefined) {
    return BROWSER_KEY_TO_NUT[key];
  }
  // For single printable characters, try uppercase letter mapping
  if (key && key.length === 1) {
    const upper = key.toUpperCase();
    if (Key[upper] !== undefined) {
      return Key[upper];
    }
  }
  return null;
}

// ─── Button mapping ─────────────────────────────────────────────────────────

function resolveButton(button) {
  switch (button) {
    case 0:
    case "left":
      return Button.LEFT;
    case 1:
    case "middle":
      return Button.MIDDLE;
    case 2:
    case "right":
      return Button.RIGHT;
    default:
      return Button.LEFT;
  }
}

// ─── Coordinate conversion ──────────────────────────────────────────────────

function toScreenCoords(normX, normY) {
  const x = Math.round(Math.max(0, Math.min(1, normX)) * screenWidth);
  const y = Math.round(Math.max(0, Math.min(1, normY)) * screenHeight);
  return new Point(x, y);
}

// ─── Throttle for mouse-move ────────────────────────────────────────────────

let lastMoveTime = 0;
const MOVE_THROTTLE_MS = 8; // ~120fps max

// ─── Message handler ────────────────────────────────────────────────────────

async function handleRemoteControlMessage(msg) {
  const { type } = msg;

  switch (type) {
    // ── Mouse move ────────────────────────────────────────────────────────
    case "mouse-move": {
      const now = Date.now();
      if (now - lastMoveTime < MOVE_THROTTLE_MS) return;
      lastMoveTime = now;

      const pos = toScreenCoords(msg.x, msg.y);
      await mouse.setPosition(pos);
      break;
    }

    // ── Mouse down ────────────────────────────────────────────────────────
    case "mouse-down": {
      if (msg.x !== undefined && msg.y !== undefined) {
        const pos = toScreenCoords(msg.x, msg.y);
        await mouse.setPosition(pos);
      }
      const btn = resolveButton(msg.button);
      await mouse.pressButton(btn);
      console.log(`[Input] mouse-down button=${msg.button}`);
      break;
    }

    // ── Mouse up ──────────────────────────────────────────────────────────
    case "mouse-up": {
      if (msg.x !== undefined && msg.y !== undefined) {
        const pos = toScreenCoords(msg.x, msg.y);
        await mouse.setPosition(pos);
      }
      const btn = resolveButton(msg.button);
      await mouse.releaseButton(btn);
      console.log(`[Input] mouse-up button=${msg.button}`);
      break;
    }

    // ── Key down ──────────────────────────────────────────────────────────
    case "key-down": {
      const nutKey = resolveKey(msg.key, msg.code);
      if (nutKey !== null) {
        await keyboard.pressKey(nutKey);
        console.log(`[Input] key-down key="${msg.key}" code="${msg.code}" -> nutKey=${nutKey}`);
      } else {
        // Fallback: try to type the character directly
        if (msg.key && msg.key.length === 1) {
          await keyboard.type(msg.key);
          console.log(`[Input] key-down typed character: "${msg.key}"`);
        } else {
          console.warn(`[Input] Unmapped key: key="${msg.key}" code="${msg.code}"`);
        }
      }
      break;
    }

    // ── Key up ────────────────────────────────────────────────────────────
    case "key-up": {
      const nutKey = resolveKey(msg.key, msg.code);
      if (nutKey !== null) {
        await keyboard.releaseKey(nutKey);
      }
      // No fallback needed for key-up — if we typed it on key-down,
      // it was a one-shot type() call, not a press-hold.
      break;
    }

    // ── Scroll ────────────────────────────────────────────────────────────
    case "scroll": {
      // Move mouse to scroll position first if coordinates provided
      if (msg.x !== undefined && msg.y !== undefined) {
        const pos = toScreenCoords(msg.x, msg.y);
        await mouse.setPosition(pos);
      }

      const deltaY = msg.deltaY || 0;
      const deltaX = msg.deltaX || 0;

      // Vertical scroll
      if (Math.abs(deltaY) > 0) {
        const scrollAmount = Math.max(1, Math.round(Math.abs(deltaY) / 100));
        if (deltaY > 0) {
          await mouse.scrollDown(scrollAmount);
        } else {
          await mouse.scrollUp(scrollAmount);
        }
      }

      // Horizontal scroll
      if (Math.abs(deltaX) > 0) {
        const scrollAmount = Math.max(1, Math.round(Math.abs(deltaX) / 100));
        if (deltaX > 0) {
          await mouse.scrollRight(scrollAmount);
        } else {
          await mouse.scrollLeft(scrollAmount);
        }
      }
      break;
    }

    default:
      // Ignore unknown message types (ping is handled in ws-server)
      break;
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function cleanup() {
  if (screenUpdateInterval) {
    clearInterval(screenUpdateInterval);
    screenUpdateInterval = null;
  }
}

module.exports = {
  handleRemoteControlMessage,
  cleanup,
};
