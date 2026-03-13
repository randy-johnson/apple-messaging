const conversationList = document.getElementById('conversation-list');
const messagesContainer = document.getElementById('messages');
const chatTitle = document.getElementById('chat-title');
const chatService = document.getElementById('chat-service');
const composeForm = document.getElementById('compose');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let conversations = [];
let activeConversationId = null;
let activeConversation = null;

// Notification sound
const notifSound = new Audio('/sounds/notification.wav');

// --- WebSocket ---
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}`);

ws.addEventListener('message', (e) => {
  const event = JSON.parse(e.data);
  if (event.type === 'new_message') {
    handleNewMessage(event.conversationId, event.message);
  }
});

ws.addEventListener('close', () => {
  console.log('WebSocket disconnected, reconnecting in 5s...');
  setTimeout(() => location.reload(), 5000);
});

// --- API Helpers ---
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Load Conversations ---
async function loadConversations() {
  try {
    conversations = await fetchJSON('/api/conversations');
    renderConversations();
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

function renderConversations() {
  conversationList.innerHTML = '';
  for (const conv of conversations) {
    const el = document.createElement('div');
    el.className = 'conversation-item' + (conv.id === activeConversationId ? ' active' : '');
    el.dataset.id = conv.id;

    const timeStr = conv.lastMessageDate ? formatTime(conv.lastMessageDate) : '';
    const unreadBadge = conv.unreadCount > 0
      ? `<span class="unread-badge">${conv.unreadCount}</span>`
      : '';

    el.innerHTML = `
      <div class="conv-top">
        <span class="conv-name">${escapeHtml(conv.displayName)}${unreadBadge}</span>
        <span class="conv-time">${timeStr}</span>
      </div>
      <div class="conv-preview">${escapeHtml(conv.lastMessage)}</div>
    `;

    el.addEventListener('click', () => selectConversation(conv));
    conversationList.appendChild(el);
  }
}

// --- Select Conversation ---
async function selectConversation(conv) {
  activeConversationId = conv.id;
  activeConversation = conv;

  chatTitle.textContent = conv.displayName;
  chatService.textContent = conv.serviceName || '';
  chatService.className = conv.serviceName || '';
  composeForm.classList.remove('hidden');

  renderConversations(); // Update active state

  try {
    const messages = await fetchJSON(`/api/conversations/${conv.id}/messages`);
    renderMessages(messages);
    scrollToBottom();
  } catch (err) {
    console.error('Failed to load messages:', err);
    messagesContainer.innerHTML = '<p style="color: var(--text-secondary); padding: 20px;">Failed to load messages.</p>';
  }
}

// --- Render Messages ---
function renderMessages(messages) {
  messagesContainer.innerHTML = '';
  let lastDate = '';

  for (const msg of messages) {
    const msgDate = new Date(msg.date).toLocaleDateString();
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.textContent = formatDateLabel(msg.date);
      messagesContainer.appendChild(sep);
    }

    const el = document.createElement('div');
    const isSms = msg.service === 'SMS';

    if (msg.isReaction) {
      el.className = 'message reaction';
      el.textContent = msg.text;
    } else if (msg.isFromMe) {
      el.className = 'message from-me' + (isSms ? ' sms' : '');
      el.innerHTML = `
        <div class="msg-text">${escapeHtml(msg.text)}</div>
        <div class="msg-time">${formatMessageTime(msg.date)}</div>
      `;
    } else {
      el.className = 'message received';
      el.innerHTML = `
        <div class="msg-sender">${escapeHtml(msg.sender)}</div>
        <div class="msg-text">${escapeHtml(msg.text)}</div>
        <div class="msg-time">${formatMessageTime(msg.date)}</div>
      `;
    }

    messagesContainer.appendChild(el);
  }
}

// --- Handle New Message (WebSocket) ---
function handleNewMessage(conversationId, message) {
  // Update conversation list
  const conv = conversations.find(c => c.id === conversationId);
  if (conv) {
    conv.lastMessage = message.text;
    conv.lastMessageDate = message.date;
    if (conversationId !== activeConversationId) {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    }
    // Move to top
    conversations.sort((a, b) => (b.lastMessageDate || 0) - (a.lastMessageDate || 0));
    renderConversations();
  } else {
    // New conversation appeared — reload list
    loadConversations();
  }

  // If this conversation is active, append the message
  if (conversationId === activeConversationId) {
    appendMessage(message);
    scrollToBottom();
  }

  // Play notification sound for messages from others
  if (!message.isFromMe) {
    notifSound.play().catch(() => {});
  }
}

function appendMessage(msg) {
  const el = document.createElement('div');
  const isSms = msg.service === 'SMS';

  if (msg.isReaction) {
    el.className = 'message reaction';
    el.textContent = msg.text;
  } else if (msg.isFromMe) {
    el.className = 'message from-me' + (isSms ? ' sms' : '');
    el.innerHTML = `
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="msg-time">${formatMessageTime(msg.date)}</div>
    `;
  } else {
    el.className = 'message received';
    el.innerHTML = `
      <div class="msg-sender">${escapeHtml(msg.sender)}</div>
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="msg-time">${formatMessageTime(msg.date)}</div>
    `;
  }

  messagesContainer.appendChild(el);
}

// --- Send Message ---
composeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeConversation) return;

  sendBtn.disabled = true;
  messageInput.disabled = true;

  try {
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: activeConversation.chatIdentifier,
        service: activeConversation.serviceName || 'iMessage',
        text,
      }),
    });
    messageInput.value = '';
  } catch (err) {
    console.error('Failed to send message:', err);
    alert('Failed to send message. Check the server logs.');
  } finally {
    sendBtn.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
});

// --- Utilities ---
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDateLabel(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// --- Init ---
loadConversations();

// Refresh conversation list every 30s
setInterval(loadConversations, 30000);
