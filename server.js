import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import apiRoutes from './src/routes/api.js';
import { startPolling, stopPolling, closeDb } from './src/messagePoller.js';
import { loadContacts } from './src/contacts.js';
import { ensureMessagesRunning } from './src/applescript.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);

// WebSocket server shares the HTTP server
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// Track connected WebSocket clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`WebSocket client connected (${clients.size} total)`);

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WebSocket client disconnected (${clients.size} total)`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    clients.delete(ws);
  });
});

/**
 * Broadcast a message to all connected WebSocket clients.
 */
function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(payload);
    }
  }
}

// Start the server
async function start() {
  // Start polling for new messages
  startPolling((newMessages) => {
    for (const { conversationId, message } of newMessages) {
      broadcast({
        type: 'new_message',
        conversationId,
        message,
      });
    }
  }, 3000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`iMessage Bridge server running on http://0.0.0.0:${PORT}`);
  });

  // Load contacts and ensure Messages.app in background (non-fatal)
  loadContacts().catch((err) => console.warn('Contacts load failed:', err.message));
  ensureMessagesRunning().catch((err) => console.warn('Messages.app check failed:', err.message));
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  stopPolling();
  closeDb();
  wss.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  stopPolling();
  closeDb();
  wss.close();
  server.close(() => process.exit(0));
});

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
