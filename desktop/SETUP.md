# iMessage Bridge Desktop App — Setup Instructions

## The Problem

There's a known Electron bug on Windows ([electron/electron#49034](https://github.com/electron/electron/issues/49034)) where `require('electron')` returns the executable path instead of the Electron API. This happens because `node_modules/electron/index.js` shadows the built-in Electron module.

**The workaround**: Use **Electron Forge** with the Vite plugin. Forge bundles main.js to a separate directory that has no `node_modules/electron`, so the built-in module resolves correctly.

---

## Step 1: Create a new Electron Forge project

Open a terminal on your **Windows machine** and run:

```bash
cd e:\poc\appleMessenging
npx create-electron-app@latest desktop-forge --template=vite
```

This creates `desktop-forge/` with a working Electron + Vite scaffold.

## Step 2: Test the scaffold works

```bash
cd desktop-forge
npm start
```

You should see a window appear with "Hello World". Close it and proceed.

## Step 3: Install ws dependency

```bash
cd desktop-forge
npm install ws
```

## Step 4: Replace the main process code

Replace `desktop-forge/src/main.js` with the content of our `desktop/main.js`. You'll need two changes:

1. Change `require()` to `import`:
```js
import { app, BrowserWindow, Tray, nativeImage, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

2. Update asset paths — since the bundled main.js runs from `.vite/build/`, use an absolute path to your assets:
```js
// Instead of path.join(__dirname, 'assets/tray-icon.png')
// You'll need to figure out the correct path. During dev, __dirname points to .vite/build/
// One approach: use app.getAppPath() to get back to the project root
const assetsPath = path.join(app.getAppPath(), 'assets');
```

## Step 5: Copy assets

```bash
cp -r ../desktop/assets desktop-forge/assets/
```

Make sure `assets/tray-icon.png`, `assets/tray-icon-alert.png`, and `assets/icon.png` are in the Forge project.

## Step 6: Replace the preload script

Replace `desktop-forge/src/preload.js` with our `desktop/preload.js`.

## Step 7: Remove the renderer (we don't need it)

Our app loads a remote URL (`http://macbook.local:3000`), not a local HTML file. You can either:
- Delete the `src/renderer.js` and `index.html` files (and update forge.config.js to remove the renderer entry)
- Or just leave them — they won't matter since `win.loadURL()` overrides the default page

## Step 8: Test

```bash
cd desktop-forge
npm start
```

You should see a window loading `http://macbook.local:3000` with the chat UI.

## Step 9: Build the Windows installer

```bash
cd desktop-forge
npm run make
```

This produces a Squirrel installer in `out/make/`.

---

## Key Files Reference

Our existing code that needs to be ported into the Forge project:

| Source File | Purpose |
|---|---|
| `desktop/main.js` | Electron main process — tray, window, WebSocket notifications |
| `desktop/preload.js` | Context bridge for renderer |
| `desktop/assets/tray-icon.png` | Normal tray icon (32x32) |
| `desktop/assets/tray-icon-alert.png` | Alert tray icon with red dot (32x32) |
| `desktop/assets/icon.png` | App icon (256x256) |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BRIDGE_URL` | `http://macbook.local:3000` | URL of the Mac bridge server |
| `BRIDGE_WS` | `ws://macbook.local:3000` | WebSocket URL of the Mac bridge server |

---

## Troubleshooting

- **Window is blank**: Make sure the Mac server is running and `macbook.local` resolves from Windows. Try `ping macbook.local` or use the IP directly.
- **Tray icon doesn't appear**: Ensure the asset PNGs are valid images (not placeholder files).
- **WebSocket won't connect**: Check that port 3000 is not blocked by Windows Firewall.
- **App won't quit**: Right-click the tray icon and select Quit, or use Task Manager. The close button minimizes to tray by design.
