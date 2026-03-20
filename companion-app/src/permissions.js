// ─── Permissions Check ──────────────────────────────────────────────────────
// On macOS, the app needs Accessibility permissions to simulate mouse/keyboard
// input. This module checks for those permissions and prompts the user.

const { systemPreferences, dialog } = require("electron");

async function checkAccessibilityPermissions() {
  // Only relevant on macOS
  if (process.platform !== "darwin") {
    return true;
  }

  // Check if we already have accessibility permission
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);

  if (isTrusted) {
    console.log("[Permissions] Accessibility access is granted.");
    return true;
  }

  // Prompt the user
  const result = await dialog.showMessageBox({
    type: "warning",
    title: "Accessibility Permission Required",
    message: "IECentral Companion needs Accessibility access",
    detail:
      "To control your mouse and keyboard during remote desktop sessions, " +
      "this app needs Accessibility permissions.\n\n" +
      'Click "Open System Settings" to grant access, then restart the app.\n\n' +
      "System Settings > Privacy & Security > Accessibility",
    buttons: ["Open System Settings", "Continue Without Permissions", "Quit"],
    defaultId: 0,
    cancelId: 1,
  });

  switch (result.response) {
    case 0:
      // Request permission (this opens System Settings on macOS)
      systemPreferences.isTrustedAccessibilityClient(true);
      return false;
    case 1:
      // Continue without permissions
      console.warn("[Permissions] Continuing without accessibility permissions.");
      return false;
    case 2:
      // Quit
      const { app } = require("electron");
      app.quit();
      return false;
    default:
      return false;
  }
}

module.exports = {
  checkAccessibilityPermissions,
};
