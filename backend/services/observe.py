"""
Observability services for the Phase 2 hub:
  Sessions  — openclaw sessions --json (subprocess)
  Cron      — ~/.openclaw/cron/jobs.json (direct file read)
  Queue     — /tmp/openclaw/*.log (delivery event parser)
  Activity  — ~/.openclaw/agents/main/sessions/*.jsonl (event stream reader)

Design notes:
  - No writes to any config file; no dashboard/heartbeat top-level keys.
  - Cron is a direct file read (no subprocess) — data is identical to CLI output.
  - Delivery queue uses best-effort log parsing; empty until channels are wired.
  - Activity JSONL reading is limited to sessions active within the last hour
    to keep the endpoint fast on 5-second polling.
"""
import json
import re
import subprocess
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

# ── Paths ─────────────────────────────────────────────────────────────────────

_HOME         = Path.home()
_SESSIONS_DIR = _HOME / ".openclaw" / "agents" / "main" / "sessions"
_CRON_JOBS    = _HOME / ".openclaw" / "cron" / "jobs.json"
_APPROVALS    = _HOME / ".openclaw" / "exec-approvals.json"
_LOG_DIR      = Path("/tmp/openclaw")

# ── Sessions ──────────────────────────────────────────────────────────────────

def _session_status(age_ms: int) -> str:
    if age_ms < 5 * 60_000:        # < 5 min
        return "active"
    if age_ms < 24 * 3_600_000:   # < 24 h
        return "idle"
    return "archived"


def get_sessions(status_filter: Optional[str] = None) -> list[dict]:
    try:
        r = subprocess.run(
            ["openclaw", "sessions", "--json"],
            capture_output=True, text=True, timeout=15,
        )
        if r.returncode != 0:
            return []
        data = json.loads(r.stdout)
    except Exception:
        return []

    out = []
    for s in data.get("sessions", []):
        age_ms = int(s.get("ageMs", 0))
        status = _session_status(age_ms)
        if status_filter and status != status_filter:
            continue

        updated_ms = s.get("updatedAt")
        out.append({
            "key":            s.get("key", ""),
            "session_id":     s.get("sessionId", ""),
            "model":          s.get("model", ""),
            "model_provider": s.get("modelProvider", ""),
            "agent_id":       s.get("agentId", "main"),
            "kind":           s.get("kind", "direct"),
            "status":         status,
            "age_ms":         age_ms,
            "last_activity":  (
                datetime.fromtimestamp(updated_ms / 1000, tz=timezone.utc).isoformat()
                if updated_ms else None
            ),
            "input_tokens":   s.get("inputTokens", 0),
            "output_tokens":  s.get("outputTokens", 0),
            "total_tokens":   s.get("totalTokens", 0),
            "context_tokens": s.get("contextTokens"),
        })

    return out


# ── Cron / Tasks ──────────────────────────────────────────────────────────────

def get_cron() -> list[dict]:
    try:
        with _CRON_JOBS.open() as f:
            data = json.load(f)
    except Exception:
        return []

    out = []
    for job in data.get("jobs", []):
        state    = job.get("state", {})
        next_ms  = state.get("nextRunAtMs")
        last_ms  = state.get("lastRunAtMs")
        payload_msg = ""
        if isinstance(job.get("payload"), dict):
            payload_msg = job["payload"].get("message", "")[:120]

        out.append({
            "id":                 job.get("id", ""),
            "name":               job.get("name", ""),
            "enabled":            bool(job.get("enabled", False)),
            "schedule":           job.get("schedule", {}).get("expr", ""),
            "schedule_kind":      job.get("schedule", {}).get("kind", "cron"),
            "agent_id":           job.get("agentId", "main"),
            "session_target":     job.get("sessionTarget", "isolated"),
            "payload_preview":    payload_msg,
            "last_run":           (
                datetime.fromtimestamp(last_ms / 1000, tz=timezone.utc).isoformat()
                if last_ms else None
            ),
            "next_run":           (
                datetime.fromtimestamp(next_ms / 1000, tz=timezone.utc).isoformat()
                if next_ms else None
            ),
            "last_status":        state.get("lastStatus"),   # "success" | "error" | None
            "last_duration_ms":   state.get("lastDurationMs"),
            "consecutive_errors": state.get("consecutiveErrors", 0),
            "last_error":         state.get("lastError"),
        })

    return out


# ── Delivery Queue ────────────────────────────────────────────────────────────

_LOG_LINE_RE = re.compile(
    r'^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)'
    r'\s+\[(?P<tag>[^\]]+)\]'
    r'\s+(?P<msg>.+)$'
)
_DELIVERY_TAGS = frozenset({"channel", "telegram", "discord", "slack", "deliver", "queue"})
_DELIVERY_KW   = re.compile(
    r'deliver|dispatch|queued|retry|quarantin|channel.*error|error.*channel'
    r'|send.*fail|fail.*send',
    re.IGNORECASE,
)
_TARGET_PATS = [
    re.compile(p) for p in (r'to=(\S+)', r'chat_id=(\S+)', r'user=(\S+)', r'target=(\S+)')
]


def _delivery_status(msg: str) -> str:
    lo = msg.lower()
    if "quarantin" in lo:
        return "quarantined"
    if any(w in lo for w in ("fail", "error", "refused", "blocked", "reject")):
        return "failed"
    if any(w in lo for w in ("retry", "retrying", "pending", "queue")):
        return "pending"
    if any(w in lo for w in ("delivered", "sent", "ok", "success", "dispatch")):
        return "delivered"
    return "pending"


def _parse_delivery_line(line: str) -> Optional[dict]:
    m = _LOG_LINE_RE.match(line.rstrip())
    if not m:
        return None

    tag = m.group("tag").lower()
    msg = m.group("msg")

    is_delivery = any(t in tag for t in _DELIVERY_TAGS) or bool(_DELIVERY_KW.search(msg))
    if not is_delivery:
        return None

    try:
        ts = datetime.fromisoformat(m.group("ts").replace("Z", "+00:00"))
    except Exception:
        return None

    id_m  = re.search(r'(?:conn|msg|id)=([a-f0-9-]{8,36})', msg)
    ev_id = id_m.group(1) if id_m else f"dl-{int(ts.timestamp() * 1000)}"

    channel = tag.split("/")[0]
    if channel not in ("telegram", "discord", "slack", "channel"):
        channel = "gateway"

    target = "unknown"
    for pat in _TARGET_PATS:
        t_m = pat.search(msg)
        if t_m:
            target = t_m.group(1)[:40]
            break

    retry_m = re.search(r'retry[:\s=]+(\d+)', msg, re.IGNORECASE)

    return {
        "id":          ev_id,
        "ts":          ts.isoformat(),
        "channel":     channel,
        "target":      target,
        "status":      _delivery_status(msg),
        "retry_count": int(retry_m.group(1)) if retry_m else 0,
        "message":     msg[:200],
    }


def get_delivery_queue(
    status_filter: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    events: list[dict] = []
    today = date.today()

    for delta in (0, 1):
        log_path = _LOG_DIR / f"openclaw-{(today - timedelta(days=delta)).isoformat()}.log"
        if not log_path.exists():
            continue
        try:
            with log_path.open(errors="replace") as f:
                for line in f:
                    ev = _parse_delivery_line(line)
                    if ev and (not status_filter or ev["status"] == status_filter):
                        events.append(ev)
        except Exception:
            continue

    seen: set[str] = set()
    unique: list[dict] = []
    for ev in sorted(events, key=lambda e: e["ts"], reverse=True):
        if ev["id"] not in seen:
            seen.add(ev["id"])
            unique.append(ev)

    return unique[:limit]


# ── Activity ──────────────────────────────────────────────────────────────────

_SUMMARY_MAX = 120


def _summarize_tool(name: str, args: dict) -> str:
    if name == "exec":
        return f"exec: {args.get('command', '')}"[:_SUMMARY_MAX]
    if name == "process":
        return f"process.{args.get('action', '')}: {args.get('sessionId', '')}"[:_SUMMARY_MAX]
    if name in ("read_file", "readFile", "Read"):
        return f"read: {args.get('path', '')}"[:_SUMMARY_MAX]
    if name in ("write_file", "writeFile", "Write"):
        return f"write: {args.get('path', '')}"[:_SUMMARY_MAX]
    if name in ("web_search", "webSearch", "WebSearch"):
        return f"search: {args.get('query', '')}"[:_SUMMARY_MAX]
    first = next((str(v) for v in args.values() if isinstance(v, str)), "")
    return f"{name}: {first}"[:_SUMMARY_MAX] if first else name


def _read_tail(session_id: str, n: int = 80) -> list[dict]:
    path = _SESSIONS_DIR / f"{session_id}.jsonl"
    if not path.exists():
        return []
    try:
        lines  = path.read_text(errors="replace").splitlines()
        events = []
        for line in lines[-n:]:
            try:
                events.append(json.loads(line))
            except Exception:
                pass
        return events
    except Exception:
        return []


def _extract_actions(events: list[dict]) -> list[dict]:
    """
    Forward pass pairing toolCall → toolResult by ID.
    Returns up to 20 most-recent actions, newest first.
    """
    actions: list[dict]      = []
    pending: dict[str, dict] = {}

    for ev in events:
        if ev.get("type") != "message":
            continue
        msg  = ev.get("message", {})
        role = msg.get("role", "")
        ts   = ev.get("timestamp", "")

        if role == "assistant":
            for item in msg.get("content", []):
                if not isinstance(item, dict) or item.get("type") != "toolCall":
                    continue
                call_id = item.get("id", "")
                name    = item.get("name", "")
                args    = item.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {}
                action = {
                    "id":             ev.get("id", ""),
                    "tool_call_id":   call_id,
                    "type":           "tool_call",
                    "tool_name":      name,
                    "summary":        _summarize_tool(name, args),
                    "status":         "running",
                    "duration_ms":    None,
                    "exit_code":      None,
                    "timestamp":      ts,
                    "result_preview": None,
                }
                pending[call_id] = action
                actions.append(action)

        elif role == "toolResult":
            call_id  = msg.get("toolCallId", "")
            details  = msg.get("details", {})
            d_status = details.get("status", "completed")
            is_error = bool(msg.get("isError")) or details.get("exitCode", 0) != 0

            if d_status == "running":
                mapped = "running"
            elif is_error:
                mapped = "error"
            else:
                mapped = "completed"

            if call_id in pending:
                a = pending[call_id]
                a["status"]      = mapped
                a["duration_ms"] = details.get("durationMs")
                a["exit_code"]   = details.get("exitCode")
                content = msg.get("content", [])
                if content and isinstance(content[0], dict):
                    a["result_preview"] = content[0].get("text", "")[:100] or None

    return list(reversed(actions))[:20]


def _current_task(events: list[dict]) -> Optional[str]:
    for ev in reversed(events):
        msg = ev.get("message", {})
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, str):
            return content[:200]
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    return item.get("text", "")[:200]
    return None


def _build_tree(sessions: list[dict]) -> list[dict]:
    """
    Depth-annotated tree from session key patterns:
      agent:X:main          → root (depth 0)
      agent:X:cron:UUID     → child of agent:X:main (depth 1)
      agent:X:cron:U:run:U  → child of agent:X:cron:UUID (depth 2)
      agent:X:<other>:UUID  → child of agent:X:main (depth 1)
    """
    by_key:   dict[str, dict]      = {s["key"]: s for s in sessions}
    children: dict[str, list[str]] = {s["key"]: [] for s in sessions}
    roots:    list[str]            = []

    for s in sessions:
        key   = s["key"]
        parts = key.split(":")

        if len(parts) == 3 and parts[2] == "main":
            roots.append(key)
        elif len(parts) == 4 and parts[2] == "cron":
            parent = f"{parts[0]}:{parts[1]}:main"
            if parent in children:
                children[parent].append(key)
            else:
                roots.append(key)
        elif len(parts) == 6 and parts[4] == "run":
            parent = ":".join(parts[:4])
            if parent in children:
                children[parent].append(key)
            else:
                roots.append(key)
        elif len(parts) == 4:
            parent = f"{parts[0]}:{parts[1]}:main"
            if parent in children:
                children[parent].append(key)
            else:
                roots.append(key)
        else:
            roots.append(key)

    def node(key: str, depth: int = 0) -> Optional[dict]:
        s = by_key.get(key)
        if not s:
            return None
        return {
            **s,
            "depth": depth,
            "children": [
                n for c in children.get(key, [])
                if (n := node(c, depth + 1)) is not None
            ],
        }

    return [n for k in roots if (n := node(k)) is not None]


def _load_approvals() -> list[dict]:
    try:
        data = json.loads(_APPROVALS.read_text())
    except Exception:
        return []
    entries = []
    for agent_id, rules in data.get("agents", {}).items():
        for rule in (rules.get("allowlist") or []):
            entries.append({
                "agent_id":   agent_id,
                "pattern":    rule.get("pattern", ""),
                "scope":      rule.get("scope", ""),
                "granted_at": rule.get("grantedAt"),
            })
    return entries


def get_activity() -> dict:
    all_sessions = get_sessions()
    one_hour_ms  = 3_600_000
    day_ms       = 24 * 3_600_000

    # Enrich recently-active sessions with JSONL action stream
    for s in all_sessions:
        if s["age_ms"] < one_hour_ms and s.get("session_id"):
            events            = _read_tail(s["session_id"], n=80)
            s["actions"]      = _extract_actions(events)
            s["current_task"] = _current_task(events)
        else:
            s["actions"]      = []
            s["current_task"] = None

    recent = [s for s in all_sessions if s["age_ms"] < day_ms]

    return {
        "agents":            _build_tree(recent),
        "pending_approvals": _load_approvals(),
        "as_of":             datetime.now(tz=timezone.utc).isoformat(),
    }
