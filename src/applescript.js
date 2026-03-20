import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Send a message via Messages.app using AppleScript.
 * @param {string} handle - Phone number or email (e.g. "+15551234567" or "user@icloud.com")
 * @param {string} service - "iMessage" or "SMS"
 * @param {string} text - Message body
 */
export async function sendMessage(handle, service, text) {
  const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedHandle = handle.replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = ${service === 'SMS' || service === 'RCS' ? 'SMS' : 'iMessage'}
      set targetBuddy to participant "${escapedHandle}" of targetService
      send "${escapedText}" to targetBuddy
    end tell
  `;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: 15000,
    });
    return { success: true, output: stdout.trim() };
  } catch (err) {
    console.error('AppleScript send failed:', err.message);
    throw new Error(`Failed to send message: ${err.message}`);
  }
}

/**
 * Mark a conversation as read by opening it via the participant buddy.
 * @param {string} handle - The chat identifier (e.g. "+15551234567" or "user@icloud.com")
 * @param {string} service - "iMessage" or "SMS"
 */
export async function markChatAsRead(handle, service) {
  const escapedHandle = handle.replace(/"/g, '\\"');
  const serviceType = (service === 'SMS' || service === 'RCS') ? 'SMS' : 'iMessage';

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = ${serviceType}
      set targetBuddy to participant "${escapedHandle}" of targetService
      send "" to targetBuddy
    end tell
  `;

  // Sending empty string may not work — alternative: just open the chat window
  // which is enough to mark as read. Let's use a different approach:
  // Open Messages.app to that conversation by sending a read receipt.
  const openScript = `
    tell application "Messages"
      activate
      set targetService to 1st account whose service type = ${serviceType}
      set targetBuddy to buddy "${escapedHandle}" of targetService
      set active chat to chat of targetBuddy
    end tell
  `;

  try {
    await execFileAsync('osascript', ['-e', openScript], { timeout: 10000 });
    return { success: true };
  } catch (err) {
    console.error('AppleScript markAsRead failed:', err.message);
    throw new Error(`Failed to mark as read: ${err.message}`);
  }
}

/**
 * Ensure Messages.app is running.
 */
export async function ensureMessagesRunning() {
  const script = `
    tell application "System Events"
      if not (exists process "Messages") then
        tell application "Messages" to activate
        delay 2
      end if
    end tell
  `;

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 10000 });
  } catch (err) {
    console.warn('Could not ensure Messages.app is running:', err.message);
  }
}
