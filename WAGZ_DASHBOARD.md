# OpenClaw Control Panel — Master Build Spec
> Version: 2.0 | Last Updated: February 2026
> Read this file at the start of every session before writing any code.

---

## Project Overview

WAGZ is a personal AI assistant system (JARVIS-style) running on a GMKtec mini PC (Linux Mint). It uses OpenClaw gateway software routing tasks to a tiered AI model stack via Telegram. The goal of this dashboard is to replace VNC/SSH for routine operations — accessible from any browser on the network or via Tailscale remotely.

**Host:** GMKtec Mini PC — Linux Mint
**Gateway:** OpenClaw v2026.2.19 on port 18789
**Current interface:** Telegram Bot (@Wagzz_bot) — stays as field radio
**Dashboard:** OpenClaw Control Panel — React web app hosted on GMKtec, becomes the command center

---

## Model Stack

| Tier | Model | Role |
|------|-------|------|
| T1 Primary | GPT-OSS-20B (OpenRouter) | Default workhorse |
| T1 Fallback 1 | MiniMax M2.5 | Lightweight fallback |
| T1 Fallback 2 | GPT-OSS-120B | Heavy fallback |
| T2 | Claude Sonnet 4.6 (OpenRouter) | Coding / Agents |
| T3 | Claude Opus 4.6 (OpenRouter) | Deep Reasoning |
| T4 | Grok-4 (xAI) | Real-time Intel — pending xAI key |

---

## Tech Stack (Locked)

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 18 + Vite |
| Styling | Tailwind CSS |
| UI Components | Shadcn/ui |
| Dashboard Charts/Stats | Tremor |
| Real-time Data | WebSockets |
| Backend API | FastAPI (Python) |
| State Management | Zustand |
| Charts | Tremor built-in + Recharts |
| Theme | Dark mode default, light mode toggle |
| Auth | Basic auth — PIN/password on all routes |
| Frontend Port | 3000 |
| Backend Port | 8000 |
| Remote Access | Tailscale only — never bind to 0.0.0.0 |
| Build Tool | Vite → static files served via FastAPI or nginx |

---

## Design System (Locked — Perplexity-inspired dark theme)

| Element | Value |
|---------|-------|
| Background | #0D0D0D |
| Card background | #1A1A1A |
| Card border | #2A2A2A |
| Primary accent | #E8472A (OpenClaw orange) |
| Positive metric | #E8472A (OpenClaw orange) |
| Negative metric | #E05252 (red) |
| Warning | #E0A020 (amber) |
| Primary text | #FFFFFF |
| Secondary text | #999999 |
| Muted text | #666666 |
| Font | Inter or system sans-serif |
| Border radius | 8px cards, 6px inputs |
| Stat cards | Sparkline bottom-right, large number top-left (Perplexity market card style) |

---

## Security Rules (Non-Negotiable)

- Auth required on ALL routes — even on LAN. Basic PIN/password for v1.
- No secrets in the React bundle — backend reads from env/files only, UI gets masked status.
- All write actions (routing changes, key adds, restarts) require explicit confirmation step.
- No public port forwarding. Ever. Remote = Tailscale only.
- FastAPI binds to Tailscale IP or localhost — never 0.0.0.0 for remote.
- CORS locked down — no wildcards.
- Rate limit the chat endpoint — prevent accidental runaway loops.
- Cost circuit breaker must be active before chat or routing features go live.

---

## Build Rules

- Build one phase at a time. Do not start next phase until current phase is confirmed working.
- Test each feature on the GMKtec before marking complete.
- All write actions in UI require a confirmation modal.
- Dark mode is default — never assume light mode.
- Mobile responsive — every panel must work on phone screen.
- WebSocket connection must handle reconnect gracefully (auto-retry with backoff).
- Never hardcode API keys or secrets anywhere in frontend code.
- Config changes must be logged with timestamp + before/after values.

---

## Phase Status Tracker

| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | System Status & Health Monitoring | ✅ COMPLETE |
| Phase 2 | Logs Explorer + Notification Center | ✅ COMPLETE |
| Phase 3 | Chat Interface (Split-Pane) | ✅ COMPLETE |
| Phase 4 | Model Routing Controls | ⏳ NOT STARTED |
| Phase 5 | API Key Manager + Cost Circuit Breaker | ⏳ NOT STARTED |
| Phase 6 | Media / Content Output Viewer | ⏳ NOT STARTED |
| Phase 7 | Prompt Library + Task Queue | ⏳ NOT STARTED |
| Phase 8 | Intelligence & News Feed | ⏳ NOT STARTED |

> Update this section as phases complete. Mark as ✅ COMPLETE or 🔄 IN PROGRESS.

---

## Phase 1 — System Status & Health Monitoring

**Goal:** A dashboard you can trust. If it shows green, OpenClaw is actually working — not just running.

### Project Scaffold
- [ ] Vite + React 18 project at `/home/wagz/wagz-dashboard`
- [ ] Tailwind CSS configured
- [ ] Shadcn/ui installed and configured
- [ ] Tremor installed
- [ ] Zustand installed
- [ ] FastAPI backend at `/home/wagz/wagz-dashboard/backend`
- [ ] Basic auth middleware on all FastAPI routes
- [ ] WebSocket endpoint at `ws://localhost:8000/ws`
- [ ] CORS configured — localhost:3000 only
- [ ] Dark mode set as Tailwind default

### Gateway Status Panel
- [ ] OpenClaw gateway online / offline / restarting indicator
- [ ] Gateway uptime counter (live)
- [ ] Service restart count (from systemd)
- [ ] Last restart timestamp
- [ ] Last known good config hash

### Synthetic Health Probe
- [ ] Auto-send minimal test prompt through OpenClaw port 18789 every 5 minutes
- [ ] Confirm valid response received
- [ ] Display last probe result (PASS / FAIL) + timestamp
- [ ] Alert if probe fails 2x in a row

### Active Model Panel
- [ ] Current active tier and model name
- [ ] Response latency — p50 / p95 gauges
- [ ] Queue depth / in-flight request counter
- [ ] TPS — tokens per second for active model

### Hardware Monitoring Panel
- [ ] CPU usage % (live)
- [ ] CPU temperature (live) + throttle flag if temp exceeds threshold
- [ ] RAM usage (used / total)
- [ ] Disk usage % + inode warning
- [ ] Network: outbound bandwidth + packet loss + OpenRouter connectivity status

### Cost & Credit Panel
- [ ] Current OpenRouter credit balance — large number display (Tremor stat card)
- [ ] Burn rate — last 1h and last 24h
- [ ] Runway estimate — "X days remaining at current 24h burn rate"
- [ ] Sparkline chart — 24h and 7d burn history (Tremor)
- [ ] Token usage per request + rolling daily totals
- [ ] Cost breakdown per model
- [ ] Rate limit / error code tracker — 401 / 429 / 5xx per provider
- [ ] Cost circuit breaker status indicator

---

## Phase 2 — Logs Explorer + Notification Center

**Goal:** Forensic tools before control tools. Answers in the dashboard, not SSH.

### Logs Explorer
- [ ] Full OpenClaw gateway log browser
- [ ] Filter by level: INFO / WARN / ERROR
- [ ] Full text search
- [ ] Time range selector
- [ ] Export logs to file
- [ ] Auto-scroll with pause on hover

### Notification Center
- [ ] In-dashboard alert feed (persistent, dismissible)
- [ ] Browser push notifications (optional, user-enabled)
- [ ] Configurable thresholds:
  - Credit floor warning (default: below $5)
  - Daily burn ceiling breach
  - CPU temp threshold
  - Service crash / restart detected
  - Synthetic probe failure (2x consecutive)
  - Provider API errors (401 / 429 / 5xx)

---

## Phase 3 — Chat Interface (Split-Pane)

**Goal:** Command center chat. Telegram = field radio. Dashboard = bridge with full rendering.

### Layout
- [ ] Split-pane: conversation left, artifact/render pane right
- [ ] Right pane renders: markdown tables, code blocks, images, structured output
- [ ] Collapsible right pane for mobile/tablet

### Chat Features
- [ ] Text input + send button
- [ ] Conversation history with timestamps
- [ ] Model indicator per response (which tier responded)
- [ ] Processing / typing indicator
- [ ] Force Tier toggle per message (override routing for individual request)
- [ ] Context controls: new thread / clear context / pin message
- [ ] Copy response to clipboard
- [ ] File / image upload for multimodal queries

### GPT Recommendations for Phase 3
- [ ] **Per-response metadata drawer** — each message has an expandable detail drawer showing: model used, tier, latency, token count, cost for that message, raw request ID; drawer includes a "Jump to log" link that opens the Logs Explorer filtered to that request's timestamp
- [ ] **Failover transparency display** — if OpenClaw fell back to a secondary model mid-request, show a visible indicator on the message (e.g. "⚡ Routed via Fallback 1 — MiniMax M2.5") so failovers are never silent
- [ ] **Cost per message** — display running cost in real time as tokens stream in (estimated from token count × model rate), show final cost on completion; add a session total in the chat header

---

## Phase 4 — Model Routing Controls

**Goal:** Reconfigure the model stack without touching a config file or SSH.

- [ ] View current active model per tier
- [ ] Switch active model / tier via dropdown
- [ ] Toggle models on/off without full gateway restart
- [ ] Model auth status — connected / missing key / rate limited
- [ ] Cost display per model — input/output per 1M tokens
- [ ] Manual override: force specific tier for next N requests
- [ ] All write actions require confirmation modal
- [ ] Config change log — timestamp + old/new values

---

## Phase 5 — API Key Manager + Cost Circuit Breaker

**Goal:** Key management and cost protection without file editing.

### API Key Manager
- [ ] View configured keys — masked (last 4 chars only)
- [ ] Add / rotate keys via UI form
- [ ] Key health status — valid / expired / rate limited
- [ ] Per-provider status (OpenRouter, xAI, MiniMax, etc.)
- [ ] Designed for adding Grok-4 xAI key when available

### Cost Circuit Breaker
- [ ] Set daily spend threshold via UI
- [ ] Hard stop: gateway refuses new requests if threshold breached
- [ ] Override with explicit confirm (prevents accidental lockout)
- [ ] Threshold status visible in Phase 1 cost panel

---

## Phase 6 — Media / Content Output Viewer

**Goal:** Browse and manage generated content without SSH or file manager.

- [ ] Gallery view of generated images
- [ ] Text output log browser
- [ ] Download / copy generated content
- [ ] Tag and organize outputs by session or task
- [ ] Filter by date / model / task type

---

## Phase 7 — Prompt Library + Task Queue

**Goal:** Speed up repeat tasks and visibility into scheduled/async jobs.

### Prompt Library
- [ ] Save and manage frequently used prompts
- [ ] Tag by category: coding / research / media / contracts / marketing
- [ ] One-click send to chat
- [ ] Edit and version prompts

### Task Queue / Job Manager
- [ ] View pending / active / completed tasks
- [ ] Cancel or reprioritize queued tasks
- [ ] Job history — model used, duration, cost per task
- [ ] Scheduled task viewer (daily briefings, crypto checks, content gen, health checks)

---

## Phase 8 — Intelligence & News Feed

**Goal:** Perplexity-style discover page powered by WAGZ and Grok-4 real-time intel.

- [ ] Crypto panel — prices, % change, watchlist (CoinGecko API free tier)
- [ ] X/Twitter trends — powered by Grok-4 T4 real-time intel (requires xAI key)
- [ ] AI news feed — model releases, industry news (Brave Search API)
- [ ] Custom watchlist — track specific topics, keywords, tickers
- [ ] WAGZ-powered morning briefing digest — routed through model stack
- [ ] Topic interest selector (Tech, Crypto, AI, Markets, etc.)
- [ ] Layout: card grid left, weather + market sidebar right (Perplexity Discover style)

---

## FastAPI Backend Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/status | Gateway status, uptime, restart count |
| GET | /api/health-probe | Last synthetic probe result |
| GET | /api/models | Active model per tier + auth status (live from openclaw.json) |
| GET | /api/metrics | CPU, RAM, disk, network, temp |
| GET | /api/credits | OpenRouter balance, burn rate, runway |
| GET | /api/costs | Per-model cost breakdown, token totals |
| GET | /api/errors | Rate limit / error code breakdown |
| GET | /api/logs | Gateway + audit logs with filter/search/time-range |
| GET | /api/notifications | Active alert feed |
| POST | /api/notifications/dismiss/{id} | Dismiss a notification |
| POST | /api/notifications/dismiss-all | Dismiss all notifications |
| GET | /api/notifications/settings | Alert threshold config |
| POST | /api/notifications/settings | Update alert thresholds |
| WS | /ws | WebSocket for all live data feeds |
| POST | /api/probe/run | Manually trigger health probe |

---

## File Structure (Current)

```
/home/wagz/wagz-dashboard/
├── WAGZ_DASHBOARD.md              ← This file (master spec)
├── start.sh                       ← Starts both services
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── StatusPanel.jsx
│   │   │   ├── HealthProbe.jsx
│   │   │   ├── ModelPanel.jsx
│   │   │   ├── HardwarePanel.jsx
│   │   │   ├── CreditPanel.jsx
│   │   │   ├── StatCard.jsx
│   │   │   ├── Layout.jsx
│   │   │   └── NotificationPanel.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Logs.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Chat.jsx          ← Phase 3
│   │   │   ├── Routing.jsx       ← Phase 4
│   │   │   ├── Keys.jsx          ← Phase 5
│   │   │   ├── Media.jsx         ← Phase 6
│   │   │   ├── Prompts.jsx       ← Phase 7
│   │   │   └── News.jsx          ← Phase 8
│   │   ├── store/
│   │   │   └── useWagzStore.js
│   │   ├── hooks/
│   │   │   └── useWebSocket.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── vite.config.js
└── backend/
    ├── main.py
    ├── ws_manager.py
    ├── auth.py
    ├── routers/
    │   ├── status.py
    │   ├── metrics.py
    │   ├── credits.py
    │   ├── models.py
    │   ├── logs.py
    │   └── notifications.py
    ├── services/
    │   ├── openclaw.py
    │   ├── models.py
    │   ├── probe.py
    │   ├── system_metrics.py
    │   ├── credits.py
    │   ├── logs.py
    │   └── notifications.py
    ├── .env
    └── requirements.txt
```

---

## How To Start Each Session

1. Claude Code reads this file: `cat WAGZ_DASHBOARD.md`
2. Check Phase Status Tracker to see current phase and progress
3. Continue from last incomplete checkbox
4. Do not skip ahead to next phase until all checkboxes in current phase are complete and tested
5. Update Phase Status Tracker when phase is done

---

## Notes & Decisions Log

| Date | Note |
|------|------|
| Feb 2026 | Design reference: Perplexity Discover page — dark theme, card layout, sparkline stat cards |
| Feb 2026 | Telegram stays as field radio — OpenClaw Control Panel is command center, not replacement |
| Feb 2026 | Gemini 3.1 Pro identified as potential T3 replacement for Claude Opus 4.6 — decision pending |
| Feb 2026 | Grok-4 T4 pending xAI API key — will unlock Phase 8 news feed real-time X data |
| Feb 2026 | GPT recommendation: logs/alerts before routing controls — confirmed and locked in phase order |
| Feb 2026 | Gemini recommendation: model routing before chat — rejected, logs first is correct order |
| Feb 2026 | Phase 1 built: React 18 + Vite + Tailwind v4, FastAPI backend, JWT auth, WebSocket live data, all panels complete |
| Feb 2026 | Phase 2 built: Logs Explorer (journald + config-audit, filter/search/time-range/export/live-tail), Notification Center (bell + panel, 8 threshold types, dismiss/settings) |
| Feb 2026 | Log source: journalctl _PID=<openclaw-gateway-pid> + /home/wagz/.openclaw/logs/config-audit.jsonl. Level classified from message content (not journald priority — gateway logs everything at p6) |
| Feb 2026 | Tailwind v4 used — no tailwind.config.js, uses @theme in CSS. Tremor skipped (v3 only, Tailwind v4 incompatible). Charts use Recharts directly |
| Feb 2026 | Default password in backend/.env WAGZ_PASSWORD=changeme — change before production use |
| Feb 2026 | start.sh in project root starts both services. Backend: 127.0.0.1:8000, Frontend: localhost:3000 |
| Feb 2026 | Accent color changed from #20B2AA (teal) to #E8472A (OpenClaw orange) across all components |
| Feb 2026 | Dashboard renamed from "WAGZ Control Panel" to "OpenClaw Control Panel" throughout codebase and spec |
| Feb 2026 | T1 Primary swapped: gpt-oss-20b is now primary, MiniMax-M2.5 is Fallback 1. Model stack reads live from ~/.openclaw/openclaw.json via services/models.py |
| Feb 2026 | GPT Phase 3 recommendations added: per-response metadata drawer with log jump, failover transparency display, cost per message streaming |
| Feb 2026 | Phase 3 built: Split-pane chat (55/45), SSE via /api/chat/send, model override selector, per-response metadata drawer (latency/tokens/cost/request_id + jump-to-logs link), failover badge (⚡), session cost + token totals in header, ArtifactPane renders markdown/code/tables (react-markdown + Prism syntax highlighting). Token estimate: 4 chars ≈ 1 token. Context tracked server-side in-memory per context_id. |

> Add new notes here as decisions are made during build.
