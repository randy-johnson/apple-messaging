import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import path from 'node:path';
import { getContactName } from './contacts.js';

const DB_PATH = path.join(homedir(), 'Library/Messages/chat.db');

let db;
let lastRowId = 0;
let pollInterval = null;

function openDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
  }
  return db;
}

/**
 * Extract text from an NSAttributedString (streamtyped) blob stored in attributedBody.
 * Modern macOS stores message text here instead of the `text` column.
 */
function extractTextFromAttributedBody(blob) {
  if (!blob) return null;
  const buf = Buffer.from(blob);
  const nsStringIdx = buf.indexOf('NSString');
  if (nsStringIdx === -1) return null;

  const plusIdx = buf.indexOf(0x2b, nsStringIdx + 8);
  if (plusIdx === -1) return null;

  let pos = plusIdx + 1;
  let textLen = buf[pos];
  pos++;

  if (textLen >= 0x80) {
    const numBytes = textLen & 0x7f;
    textLen = 0;
    for (let i = 0; i < numBytes; i++) {
      textLen = (textLen << 8) | buf[pos + i];
    }
    pos += numBytes;
  }

  if (textLen === 0 || pos + textLen > buf.length) return null;

  return buf.subarray(pos, pos + textLen).toString('utf8').replace(/[\ufffc\u0000]/g, '').trim() || null;
}

/**
 * Resolve message text: prefer the `text` column, fall back to extracting from `attributedBody`.
 */
function resolveText(text, attributedBody) {
  if (text) return text;
  return extractTextFromAttributedBody(attributedBody) || '';
}

/**
 * Get all conversations with last message preview.
 */
export function getConversations() {
  const database = openDb();

  const rows = database.prepare(`
    SELECT
      c.ROWID as id,
      c.chat_identifier as chatIdentifier,
      c.display_name as displayName,
      c.service_name as serviceName,
      (
        SELECT CAST(m.date AS TEXT)
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        WHERE cmj.chat_id = c.ROWID
        ORDER BY m.date DESC
        LIMIT 1
      ) as lastMessageDate,
      (
        SELECT COUNT(*)
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        WHERE cmj.chat_id = c.ROWID AND m.is_read = 0 AND m.is_from_me = 0
      ) as unreadCount,
      (
        SELECT m.ROWID
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        WHERE cmj.chat_id = c.ROWID
        ORDER BY m.date DESC
        LIMIT 1
      ) as lastMessageRowId
    FROM chat c
    ORDER BY lastMessageDate DESC
  `).all();

  // Fetch last message text for each conversation (need attributedBody fallback)
  const msgStmt = database.prepare(
    'SELECT text, attributedBody FROM message WHERE ROWID = ?'
  );

  return rows.map(row => {
    let lastMessage = '';
    if (row.lastMessageRowId) {
      const msg = msgStmt.get(row.lastMessageRowId);
      if (msg) lastMessage = resolveText(msg.text, msg.attributedBody);
    }

    return {
      id: row.id,
      chatIdentifier: row.chatIdentifier,
      displayName: row.displayName || getContactName(row.chatIdentifier),
      serviceName: row.serviceName,
      lastMessage,
      lastMessageDate: row.lastMessageDate ? cocoaToUnix(row.lastMessageDate) : null,
      unreadCount: row.unreadCount || 0,
    };
  });
}

/**
 * Get messages for a specific conversation.
 */
export function getMessages(chatId, limit = 100, beforeRowId = null) {
  const database = openDb();

  let query = `
    SELECT
      m.ROWID as id,
      m.text,
      m.attributedBody,
      m.is_from_me as isFromMe,
      CAST(m.date AS TEXT) as date,
      m.service,
      m.handle_id as handleId,
      h.id as handle,
      m.associated_message_type as associatedMessageType,
      m.associated_message_guid as associatedMessageGuid
    FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    WHERE cmj.chat_id = ?
  `;

  const params = [chatId];

  if (beforeRowId) {
    query += ' AND m.ROWID < ?';
    params.push(beforeRowId);
  }

  query += ' ORDER BY m.date DESC LIMIT ?';
  params.push(limit);

  const rows = database.prepare(query).all(...params);

  return rows.reverse().map(row => ({
    id: row.id,
    text: resolveText(row.text, row.attributedBody),
    isFromMe: row.isFromMe === 1,
    date: cocoaToUnix(row.date),
    service: row.service,
    sender: row.isFromMe ? 'Me' : getContactName(row.handle),
    handle: row.handle,
    isReaction: row.associatedMessageType !== 0 && row.associatedMessageType !== null,
  }));
}

/**
 * Poll for new messages since the last known ROWID.
 */
export function pollNewMessages() {
  const database = openDb();

  if (lastRowId === 0) {
    const row = database.prepare('SELECT MAX(ROWID) as maxId FROM message').get();
    lastRowId = row?.maxId || 0;
    return [];
  }

  const rows = database.prepare(`
    SELECT
      m.ROWID as id,
      m.text,
      m.attributedBody,
      m.is_from_me as isFromMe,
      CAST(m.date AS TEXT) as date,
      m.service,
      m.handle_id as handleId,
      h.id as handle,
      m.associated_message_type as associatedMessageType,
      cmj.chat_id as chatId
    FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    WHERE m.ROWID > ?
    ORDER BY m.ROWID ASC
  `).all(lastRowId);

  if (rows.length > 0) {
    lastRowId = rows[rows.length - 1].id;
  }

  return rows.map(row => ({
    conversationId: row.chatId,
    message: {
      id: row.id,
      text: resolveText(row.text, row.attributedBody),
      isFromMe: row.isFromMe === 1,
      date: cocoaToUnix(row.date),
      service: row.service,
      sender: row.isFromMe ? 'Me' : getContactName(row.handle),
      handle: row.handle,
      isReaction: row.associatedMessageType !== 0 && row.associatedMessageType !== null,
    },
  }));
}

export function startPolling(onNewMessages, intervalMs = 3000) {
  pollNewMessages();

  pollInterval = setInterval(() => {
    try {
      const newMessages = pollNewMessages();
      if (newMessages.length > 0) {
        onNewMessages(newMessages);
      }
    } catch (err) {
      console.error('Polling error:', err.message);
    }
  }, intervalMs);

  console.log(`Message polling started (every ${intervalMs}ms)`);
  return pollInterval;
}

export function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('Message polling stopped');
  }
}

/**
 * Convert macOS Cocoa timestamp (nanoseconds since 2001-01-01) to Unix timestamp (ms).
 */
function cocoaToUnix(cocoaTimestamp) {
  if (!cocoaTimestamp) return null;
  const ts = typeof cocoaTimestamp === 'string' ? Number(cocoaTimestamp) : cocoaTimestamp;
  const COCOA_EPOCH_OFFSET = 978307200;
  const seconds = ts > 1e15 ? ts / 1e9 : ts;
  return Math.floor((seconds + COCOA_EPOCH_OFFSET) * 1000);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
