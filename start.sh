#!/bin/bash
# WAGZ Control Panel — Start both services
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_LOG="/tmp/wagz_backend.log"
FRONTEND_LOG="/tmp/wagz_frontend.log"

# Kill existing instances
echo "[wagz] Stopping any existing instances..."
lsof -ti:8000 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Start backend
echo "[wagz] Starting backend (port 8000)..."
cd "$BACKEND_DIR"
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend
for i in $(seq 1 10); do
  if curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo "  Backend ready"
    break
  fi
  sleep 1
done

# Start frontend
echo "[wagz] Starting frontend (port 3000)..."
cd "$FRONTEND_DIR"
npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "[wagz] ✓ WAGZ Control Panel running"
echo "  Dashboard: http://localhost:3000"
echo "  API:       http://localhost:8000"
echo "  Backend log: $BACKEND_LOG"
echo "  Frontend log: $FRONTEND_LOG"
echo ""
echo "  Default password: see backend/.env (WAGZ_PASSWORD)"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait
trap "echo ''; echo '[wagz] Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
