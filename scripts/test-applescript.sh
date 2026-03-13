#!/bin/bash
# Manual AppleScript test snippets for iMessage Bridge
# Run these from the MacBook terminal to verify AppleScript access.

echo "=== Test 1: Check if Messages.app is running ==="
osascript -e 'tell application "System Events" to return exists process "Messages"'

echo ""
echo "=== Test 2: List chat count ==="
osascript -e 'tell application "Messages" to return count of chats'

echo ""
echo "=== Test 3: Get first chat name ==="
osascript -e 'tell application "Messages" to return name of chat 1'

echo ""
echo "=== Test 4: Check chat.db access ==="
if [ -r "$HOME/Library/Messages/chat.db" ]; then
  echo "chat.db is readable"
  sqlite3 "$HOME/Library/Messages/chat.db" "SELECT COUNT(*) FROM message;" 2>/dev/null && echo "SQLite query succeeded" || echo "SQLite query failed (may need Full Disk Access)"
else
  echo "chat.db is NOT readable (grant Full Disk Access to Terminal)"
fi

echo ""
echo "=== Test 5: Sample recent messages from chat.db ==="
sqlite3 "$HOME/Library/Messages/chat.db" "
  SELECT m.ROWID, m.text, m.is_from_me, m.service, h.id as handle
  FROM message m
  LEFT JOIN handle h ON h.ROWID = m.handle_id
  ORDER BY m.date DESC
  LIMIT 5;
" 2>/dev/null || echo "Query failed"

echo ""
echo "Done. If tests fail, check System Settings > Privacy & Security permissions."
