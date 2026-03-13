const { app, BrowserWindow, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const WebSocket = require('ws');

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://macbook.local:3000';
const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://macbook.local:3000';

let tray, win, ws;
const iconNormal = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon.png'));
const iconAlert = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon-alert.png'));

app.whenReady().then(() => {
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
        // Flash tray icon
        tray.setImage(iconAlert);

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

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  // Keep running in tray
});

// Clean up on quit
app.on('before-quit', () => {
  if (ws) ws.close();
  app.exit(0);
});
