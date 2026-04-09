/**
 * OS-level system notifications
 *
 * Sends native system notifications when the window is not in focus.
 * Falls back silently when permissions are denied or API is unavailable.
 */

/**
 * Request notification permission (Web browsers only).
 * Electron renderer processes have access by default.
 * Only prompts when permission is in "default" state.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  // Only prompt when "default" (not yet asked)
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/**
 * Send a system notification.
 * Silent when the window has focus (toast handles it instead).
 * Silent when Notification API is unavailable or permission is denied.
 */
export function sendOSNotification(
  title: string,
  body?: string,
  onClick?: () => void
): void {
  // Window is in focus — let toast handle it
  if (document.hasFocus()) return;

  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, { body });
    notification.onclick = () => {
      window.focus();
      onClick?.();
    };
  } catch {
    // Silently ignore (e.g. service worker context issues)
  }
}
