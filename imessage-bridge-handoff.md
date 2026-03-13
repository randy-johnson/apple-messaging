# iMessage Bridge — Claude Code Handoff

## Project Overview

Build a Node.js ES6+ web server running on a MacBook that bridges iMessage/SMS to a browser-based chat UI accessible from a Windows desktop on the home network. The user interacts with family via a clean web interface instead of using Microsoft Lync or Phone Link.

---

## Architecture

```
iPhone ←→ iCloud ←→ MacBook Messages.app
                           ↕  (AppleScript via osascript)
                     Node.js ES6 Server (Express + WebSocket)
                           ↕  (HTTP / WS on LAN)
                   Electron App on Windows Desktop
                   ├── BrowserWindow (renders web UI)
                   ├── System Tray icon (blink on new message)
                   ├── Native Desktop Notifications + sound
                   └── WebSocket client (real-time updates)
```

---

## Environment

| Item | Detail |
|---|---|
| Bridge machine | MacBook (temporary, will migrate to Mac Mini) |
| macOS Messages | Configured, synced with iPhone via iCloud |
| Node.js | Already installed on MacBook |
| Network scope | Home LAN only (no public internet exposure) |
| Message types | Primarily iMessage (blue bubble), some SMS (green bubble, e.g. mom) |
| JS standard | **ES6+ modules only — no CommonJS `require()`** |

---

## Tech Stack

### MacBook (Bridge Server)
- **Runtime:** Node.js (ES6+ modules, `"type": "module"` in package.json)
- **Server:** Express
- **Real-time:** WebSockets (`ws` package) for push to clients
- **AppleScript bridge:** `osascript` called via Node.js `child_process`
- **UI assets:** Static HTML/CSS/JS served by Express (consumed by Electron)
- **Message polling:** Interval-based polling of Messages SQLite DB OR AppleScript query (see notes below)

### Windows Desktop (Electron App)
- **Electron** — wraps the web UI in a native Windows app
- **BrowserWindow** — renders the web UI from `http://macbook.local:3000`
- **Tray icon** — sits in system tray, blinks/flashes on new message
- **Native notifications** — `Notification` API via Electron for OS-level popups with sound
- **WebSocket client** — listens for `new_message` events to trigger tray + notification
- **Auto-launch** — starts with Windows via Electron's `auto-launch` or registry entry

---

## Project Structure

```
imessage-bridge/
├── package.json                  # "type": "module", server dependencies
├── server.js                     # Express + WebSocket server entry point
├── src/
│   ├── applescript.js            # osascript wrapper — send & read messages
│   ├── messagePoller.js          # Polls for new messages, emits via WebSocket
│   ├── contacts.js               # Loads and caches known contacts
│   └── routes/
│       └── api.js                # REST API routes (/conversations, /send, etc.)
├── public/
│   ├── index.html                # Single-page chat UI
│   ├── app.js                    # Frontend JS (ES6 modules via <script type="module">)
│   └── style.css
├── electron/                     # Windows desktop wrapper
│   ├── package.json              # Electron dependencies (NOT "type":"module" — Electron uses CJS)
│   ├── main.js                   # Electron main process — BrowserWindow, Tray, WS client
│   ├── preload.js                # Preload script (context bridge if needed)
│   └── assets/
│       ├── tray-icon.png         # Normal tray icon (16x16 or 32x32)
│       ├── tray-icon-alert.png   # Highlighted tray icon for new message
│       └── notification.wav      # Sound played on new message
└── scripts/
    └── test-applescript.sh       # Manual AppleScript test snippets
```

> **Note on Electron + ES6 modules:** Electron's main process uses CommonJS by default. Keep `electron/main.js` and `electron/preload.js` as CJS (`require()`). The web UI loaded in BrowserWindow is a normal webpage and can use ES6 modules freely.

---

## Core Features

### 1. Conversation List
- List all conversations (contacts + group chats) visible in Messages.app
- Show last message preview and timestamp
- Visual indicator for unread (if detectable)

### 2. Message Thread View
- Load full message history for a selected conversation
- Distinguish iMessage (blue) vs SMS (green) visually
- Show sender name, timestamp, message body

### 3. Send Messages
- Text input + send button
- Send via AppleScript to Messages.app
- Supports both iMessage and SMS (Messages.app handles the routing)

### 4. Real-time Receive
- Poll for new messages every ~3–5 seconds
- Push new messages to browser via WebSocket
- No page refresh needed

---

## AppleScript Approach

Messages.app is scriptable via AppleScript. Node.js executes scripts using `child_process.exec` or `execFile` with `osascript`.

### Send a Message
```applescript
tell application "Messages"
  set targetBuddy to buddy "recipient@example.com" of service "iMessage"
  send "Hello!" to targetBuddy
end tell
```

For phone numbers (SMS / green bubble):
```applescript
tell application "Messages"
  set targetBuddy to buddy "+15551234567" of service "SMS"
  send "Hello mom!" to targetBuddy
end tell
```

### Read Recent Messages
Two approaches — use whichever proves more reliable:

**Option A: AppleScript (simpler, no permissions needed beyond Automation)**
```applescript
tell application "Messages"
  set theChats to every chat
  -- iterate chats, get messages
end tell
```

**Option B: SQLite direct read (more reliable for history)**
Messages are stored at:
```
~/Library/Messages/chat.db
```
Query with `better-sqlite3` npm package. Read-only access. May require Full Disk Access permission in macOS System Settings > Privacy & Security.

> **Recommendation:** Start with AppleScript for sending and SQLite for reading history. AppleScript for reading can be slow/unreliable for large histories.

---

## macOS Permissions Required

The MacBook will prompt for these — grant them all:

| Permission | Why |
|---|---|
| Automation → Messages | Required for AppleScript send |
| Full Disk Access (for Node.js / Terminal) | Required to read `chat.db` via SQLite |
| Contacts (optional) | To resolve phone numbers to names |

Grant in: **System Settings → Privacy & Security**

---

## API Design (REST + WebSocket)

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/conversations` | List all conversations |
| GET | `/api/conversations/:id/messages` | Get messages for a conversation |
| POST | `/api/send` | Send a message |

### POST `/api/send` Body
```json
{
  "handle": "+15551234567",
  "service": "SMS",
  "text": "Hello mom!"
}
```
`service` is either `"iMessage"` or `"SMS"`

### WebSocket Events (server → client)
```json
{ "type": "new_message", "conversationId": "...", "message": { ... } }
```

---

## Electron App (Windows)

The Electron app lives in `electron/` and is a **separate project** from the server. It does not run any server logic — it purely wraps the web UI and handles native Windows integration.

### What the Electron main process does

1. Creates a `BrowserWindow` that loads `http://macbook.local:3000`
2. Opens a WebSocket connection to `ws://macbook.local:3000`
3. On `new_message` WS event:
   - Swaps tray icon to alert version
   - Fires a native `Notification` with sender name + message preview
   - Plays a notification sound
4. On window focus or message read → resets tray icon to normal

### electron/main.js (outline — CJS)

```javascript
const { app, BrowserWindow, Tray, nativeImage, Notification } = require('electron');
const { autoUpdater } = require('electron-updater'); // optional
const path = require('path');
const WebSocket = require('ws');

const BRIDGE_URL = 'http://macbook.local:3000';
const BRIDGE_WS  = 'ws://macbook.local:3000';

let tray, win, ws;
const iconNormal = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon.png'));
const iconAlert  = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon-alert.png'));

app.whenReady().then(() => {
  // Tray
  tray = new Tray(iconNormal);
  tray.setToolTip('iMessage Bridge');
  tray.on('click', () => { win.show(); win.focus(); tray.setImage(iconNormal); });

  // BrowserWindow
  win = new BrowserWindow({ width: 1024, height: 768, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.loadURL(BRIDGE_URL);

  // WebSocket listener
  const connectWS = () => {
    ws = new WebSocket(BRIDGE_WS);
    ws.on('message', (data) => {
      const event = JSON.parse(data);
      if (event.type === 'new_message') {
        tray.setImage(iconAlert);
        new Notification({
          title: event.message.sender,
          body: event.message.text,
          // sound handled via HTML5 Audio in renderer or via shell.beep()
        }).show();
      }
    });
    ws.on('close', () => setTimeout(connectWS, 5000)); // auto-reconnect
  };
  connectWS();
});
```

### Notification Sound

Play sound in the **renderer process** (the web UI) when a `new_message` WS event arrives, using the HTML5 Audio API — simpler than piping audio through the main process:

```javascript
// In public/app.js — runs in BrowserWindow
const notifSound = new Audio('/sounds/notification.wav');

socket.addEventListener('message', (e) => {
  const event = JSON.parse(e.data);
  if (event.type === 'new_message') {
    notifSound.play();
    // update UI
  }
});
```

Serve `notification.wav` as a static file from Express.

### electron/package.json

```json
{
  "name": "imessage-bridge-desktop",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win"
  },
  "dependencies": {
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

> **No `"type": "module"`** in electron/package.json — Electron main process requires CJS.

### Building the Windows Installer

```bash
cd electron
npm install
npm run build
# outputs: dist/imessage-bridge-desktop Setup 1.0.0.exe
```

`electron-builder` config in `electron/package.json`:
```json
"build": {
  "appId": "com.yourname.imessage-bridge",
  "win": {
    "target": "nsis",
    "icon": "assets/tray-icon.png"
  }
}
```

---

## Server package.json (starting point)

```json
{
  "name": "imessage-bridge",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "ws": "^8.16.0",
    "better-sqlite3": "^9.4.0"
  }
}
```

---

## Network / Access

- Server listens on `0.0.0.0` so it's reachable from the home LAN (not just localhost)
- Default port: `3000` (configurable via `.env` or env var)
- Windows desktop accesses via: `http://macbook.local:3000` or `http://<macbook-ip>:3000`
- No auth needed for home LAN use (can add basic auth later if desired)

---

## Known Constraints & Gotchas

- **macOS Ventura+ and Sequoia** have tightened AppleScript permissions — expect permission prompts on first run
- **Messages.app must be open** for AppleScript send to work reliably; consider adding a login item or launchd plist to auto-start it
- **iMessage vs SMS routing** is controlled by Messages.app, not the script — the correct service must be specified in AppleScript or it may fail silently
- **Group chats** have different chat identifiers in `chat.db` — handle separately if needed
- **Reactions / tapbacks** will appear as raw text in SQLite — may want to filter or display them differently
- **chat.db schema** changes occasionally across macOS versions — validate on the installed macOS version
- **Node.js on macOS:** if installed via nvm, ensure the shell path is set correctly for launchd/startup scripts
- **Electron main process is CJS** — do NOT add `"type": "module"` to `electron/package.json`; the renderer (web UI) can still use ES6 modules freely
- **Electron WS auto-reconnect** — the MacBook may sleep or restart; the Electron WS client must reconnect gracefully (5s retry loop)
- **Windows notifications require focus permission** — Windows may suppress notifications if Do Not Disturb is on; document this for the user
- **macbook.local mDNS** — may not resolve reliably on all Windows setups; fallback to static LAN IP (set a DHCP reservation on the router)

---

## Phase 1 MVP Scope

Get a working end-to-end flow:

1. List conversations in sidebar
2. Click a conversation → load message history
3. Type and send a reply
4. New incoming messages appear within ~5 seconds (polling)
5. Electron app shows tray alert icon + plays sound on new message

Polish and group chat support can come in Phase 2.

---

## Phase 2 / Future Enhancements

- Migrate bridge server from MacBook to Mac Mini
- Image / attachment support
- Unread badge count on Electron tray icon
- Search across messages
- Contact photo display
- launchd plist for auto-start of server on macOS boot
- Electron auto-launch on Windows startup
- Optional basic auth for slightly hardened LAN access
- Package Electron app as `.exe` installer via electron-builder
