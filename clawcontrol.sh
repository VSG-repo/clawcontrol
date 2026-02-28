#!/bin/bash
# ClawControl Launcher
CCDIR="$HOME/wagz-dashboard"

# Start backend if not running
if ! lsof -ti:8000 >/dev/null 2>&1; then
  cd "$CCDIR/backend" && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/wagz_backend.log 2>&1 &
fi

# Start frontend if not running
if ! lsof -ti:3000 >/dev/null 2>&1; then
  cd "$CCDIR/frontend" && npm run dev > /tmp/wagz_frontend.log 2>&1 &
  sleep 3
fi

# Open in app mode (standalone window, no browser chrome)
# Try common browser paths
if command -v google-chrome &>/dev/null; then
  google-chrome --app=http://localhost:3000 &
elif command -v google-chrome-stable &>/dev/null; then
  google-chrome-stable --app=http://localhost:3000 &
elif command -v chromium-browser &>/dev/null; then
  chromium-browser --app=http://localhost:3000 &
elif command -v microsoft-edge &>/dev/null; then
  microsoft-edge --app=http://localhost:3000 &
else
  xdg-open http://localhost:3000 &
fi
