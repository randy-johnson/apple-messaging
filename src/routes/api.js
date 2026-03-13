import { Router } from 'express';
import { getConversations, getMessages } from '../messagePoller.js';
import { sendMessage } from '../applescript.js';
import { reloadContacts } from '../contacts.js';

const router = Router();

// List all conversations
router.get('/conversations', (req, res) => {
  try {
    const conversations = getConversations();
    res.json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', (req, res) => {
  try {
    const chatId = parseInt(req.params.id, 10);
    const limit = parseInt(req.query.limit, 10) || 100;
    const before = req.query.before ? parseInt(req.query.before, 10) : null;

    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const messages = getMessages(chatId, limit, before);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a message
router.post('/send', async (req, res) => {
  try {
    const { handle, service, text } = req.body;

    if (!handle || !text) {
      return res.status(400).json({ error: 'handle and text are required' });
    }

    const svc = service || 'iMessage';
    if (svc !== 'iMessage' && svc !== 'SMS') {
      return res.status(400).json({ error: 'service must be "iMessage" or "SMS"' });
    }

    const result = await sendMessage(handle, svc, text);
    res.json(result);
  } catch (err) {
    console.error('Error sending message:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reload contacts cache
router.post('/contacts/reload', async (req, res) => {
  try {
    await reloadContacts();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reload contacts' });
  }
});

export default router;
