// Preload script for Electron BrowserWindow
// This runs in a sandboxed context between the main process and the renderer.
// Add any context bridge APIs here if needed in the future.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
});
