import { app, BrowserWindow, Tray, nativeImage, Notification } from 'electron';
import path from 'node:path';
import WebSocket from 'ws';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://macbook.local:4008';
const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://macbook.local:4008';

// Resolve asset paths — in dev they're at the project root, in production they're in resources/
const assetsPath = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(app.getAppPath(), 'assets');

let tray, win, ws, iconNormal, iconAlert;

app.whenReady().then(() => {
  iconNormal = nativeImage.createFromPath(path.join(assetsPath, 'tray-icon.png'));
  iconAlert = nativeImage.createFromPath(path.join(assetsPath, 'tray-icon-alert.png'));

  // System Tray
  tray = new Tray(iconNormal);
  tray.setToolTip('iMessage Bridge');
  tray.on('click', () => {
    if (win) {
      win.show();
      win.focus();
      tray.setImage(iconNormal);
    }
  });

  // Browser Window
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    icon: iconNormal,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadURL(BRIDGE_URL);

  win.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    win.hide();
  });

  win.on('focus', () => {
    tray.setImage(iconNormal);
    win.flashFrame(false);
  });

  // WebSocket connection for notifications
  connectWebSocket();
});

function connectWebSocket() {
  ws = new WebSocket(BRIDGE_WS);

  ws.on('open', () => {
    console.log('Connected to iMessage Bridge WebSocket');
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      if (event.type === 'new_message' && !event.message.isFromMe) {
        // Flash tray icon and taskbar
        tray.setImage(iconAlert);
        win.flashFrame(true);

        // Show native notification
        const notification = new Notification({
          title: event.message.sender || 'New Message',
          body: event.message.text || '',
          icon: iconNormal,
        });

        notification.on('click', () => {
          win.show();
          win.focus();
          tray.setImage(iconNormal);
        });

        notification.show();
      }
    } catch (err) {
      console.error('Error processing WS message:', err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket disconnected, reconnecting in 5s...');
    setTimeout(connectWebSocket, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

// Keep running in tray when all windows are closed
app.on('window-all-closed', () => {
  // Don't quit — stay in system tray
});

// Clean up on quit
app.on('before-quit', () => {
  if (ws) ws.close();
  app.exit(0);
});
