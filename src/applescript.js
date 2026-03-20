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
 * Mark a conversation as read by setting it as the active chat in Messages.app.
 * @param {string} chatGuid - The chat guid (e.g. "iMessage;-;+15551234567")
 */
export async function markChatAsRead(chatGuid) {
  const escapedId = chatGuid.replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set theChats to every chat whose id is "${escapedId}"
      if (count of theChats) > 0 then
        set active chat to item 1 of theChats
      end if
    end tell
  `;

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 10000 });
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
