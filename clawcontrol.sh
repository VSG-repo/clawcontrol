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

# Open as standalone app window
CHROME=""
for cmd in google-chrome google-chrome-stable chromium-browser chromium microsoft-edge; do
  if command -v "$cmd" &>/dev/null; then
    CHROME="$cmd"
    break
  fi
done

if [ -n "$CHROME" ]; then
  "$CHROME" --app=http://localhost:3000 --no-first-run --no-default-browser-check --user-data-dir="$HOME/.config/clawcontrol-browser" 2>/dev/null &
else
  xdg-open http://localhost:3000 &
fi
