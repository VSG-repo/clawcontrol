"""
Log reader service — journald (gateway runtime) + config-audit.jsonl.

Level classification is derived from message content since openclaw-gateway
logs everything at journald PRIORITY 6 (info).
"""
import json
import re
import subprocess
from datetime import datetime, timezone
from typing import Optional

import psutil

AUDIT_LOG_PATH = "/home/wagz/.openclaw/logs/config-audit.jsonl"

_ERROR_RE = re.compile(
    r'(?:lane task error|Error:|HTTP 5\d\d|fatal|unhandled|crash|exception)',
    re.IGNORECASE,
)
_WARN_RE = re.compile(
    r'(?:HTTP 4\d\d|429|warning|cooldown|fail|disconnect.*1006|pairing required)',
    re.IGNORECASE,
)


def _classify(msg: str) -> str:
    if _ERROR_RE.search(msg):
        return "ERROR"
    if _WARN_RE.search(msg):
        return "WARN"
    return "INFO"


def _gateway_pid() -> Optional[int]:
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            if "openclaw-gateway" in (proc.info["name"] or ""):
                return proc.info["pid"]
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None


def _journal_logs(
    limit: int,
    level_filter: Optional[str],
    search: Optional[str],
    since: Optional[datetime],
) -> list[dict]:
    pid = _gateway_pid()
    if not pid:
        return []

    cmd = [
        "journalctl", f"_PID={pid}",
        "--no-pager", "--output", "json",
        "-n", str(min(limit * 6, 6000)),
    ]
    if since:
        cmd += ["--since", since.strftime("%Y-%m-%d %H:%M:%S UTC")]

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            return []
    except Exception:
        return []

    entries = []
    for line in r.stdout.splitlines():
        try:
            d = json.loads(line)
            msg = d.get("MESSAGE", "")
            if not msg:
                continue
            ts_us = int(d.get("__REALTIME_TIMESTAMP", 0))
            ts = datetime.fromtimestamp(ts_us / 1_000_000, tz=timezone.utc)
            lvl = _classify(msg)

            if level_filter and lvl != level_filter:
                continue
            if search and search.lower() not in msg.lower():
                continue

            entries.append({
                "id": f"j-{ts_us}",
                "ts": ts.isoformat(),
                "level": lvl,
                "source": "gateway",
                "message": msg,
            })
        except Exception:
            continue

    return entries


def _audit_logs(
    search: Optional[str],
    since: Optional[datetime],
) -> list[dict]:
    try:
        with open(AUDIT_LOG_PATH, "r") as f:
            lines = f.readlines()
    except Exception:
        return []

    entries = []
    for line in lines:
        try:
            d = json.loads(line)
            ts = datetime.fromisoformat(d["ts"].replace("Z", "+00:00"))
            if since and ts < since:
                continue

            # Build readable message from argv — drop node binary + flags
            argv = d.get("argv", [])
            parts = []
            for arg in argv:
                if arg in ("/usr/bin/node", "--disable-warning=ExperimentalWarning"):
                    continue
                if arg.endswith("openclaw") or arg.endswith("openclaw.mjs") or "dist/index.js" in arg:
                    continue
                parts.append(arg)
            cmd_str = " ".join(parts)
            event = d.get("event", "config.write")
            result = d.get("result", "")
            msg = f"[config-audit] {event}: {cmd_str}" + (f" → {result}" if result else "")

            if search and search.lower() not in msg.lower():
                continue

            entries.append({
                "id": f"a-{d['ts']}",
                "ts": ts.isoformat(),
                "level": "INFO",
                "source": "audit",
                "message": msg,
            })
        except Exception:
            continue

    return entries


def get_logs(
    limit: int = 200,
    offset: int = 0,
    level: Optional[str] = None,  # INFO | WARN | ERROR | None=all
    search: Optional[str] = None,
    since_iso: Optional[str] = None,
    sources: str = "gateway,audit",
) -> dict:
    since: Optional[datetime] = None
    if since_iso:
        try:
            since = datetime.fromisoformat(since_iso)
        except Exception:
            pass

    # Level filter only applied to gateway logs (audit logs are always INFO)
    level_filter = level.upper() if level and level.upper() not in ("ALL", "") else None

    all_entries: list[dict] = []
    if "gateway" in sources:
        all_entries += _journal_logs(limit + offset, level_filter, search, since)
    if "audit" in sources:
        # Don't filter audit logs by level — they're always INFO context
        audit = _audit_logs(search, since)
        if not level_filter or level_filter == "INFO":
            all_entries += audit

    all_entries.sort(key=lambda e: e["ts"])
    total = len(all_entries)
    page = all_entries[offset:offset + limit]
    return {
        "logs": page,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": (offset + limit) < total,
    }
