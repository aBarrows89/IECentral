# Tray Icon Requirements

The companion app generates tray icons programmatically via SVG, so no static
icon files are strictly required. However, for a polished production build you
should supply the following assets:

## Tray Icons (22x22 px, PNG with transparency)

- `tray-icon-waiting.png` — Gray "R" badge. Shown when waiting for a browser
  connection.
- `tray-icon-connected.png` — Green "R" badge. Shown when a browser session is
  actively connected.
- `tray-icon-disconnected.png` — Yellow "R" badge. Shown after a session ends.
- `tray-icon-error.png` — Red "R" badge. Shown on error.

### macOS Template Images

On macOS, provide `Template` variants that use only black and transparency so
the system can automatically adapt to light/dark menu bar:

- `tray-iconTemplate.png` (22x22)
- `tray-iconTemplate@2x.png` (44x44)

## App Icon (for About dialog and OS-level app listing)

- `icon.icns` — macOS app icon (512x512 and lower)
- `icon.ico` — Windows app icon (256x256 and lower)
- `icon.png` — 512x512 PNG source

## Design Guidelines

- The icon should feature a stylized "R" (for Remote) or the IECentral logo
  mark inside a rounded-rect or circle badge.
- Use the IECentral brand color palette (cyan/teal primary).
- Tray icons must be legible at 22px; keep detail minimal.
