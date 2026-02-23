"""
OpenClaw gateway status via process detection and HTTP health check.

Architecture:
  Port 18789 — Web UI (SPA), serves HTML for all GET paths
  Port 18792 — Browser control API; GET / → "OK" (HTTP 200) when alive

Status is determined by:
  1. pgrep for "openclaw-gateway" process
  2. HTTP GET http://localhost:18792/ confirming the control port responds
"""
import os
import hashlib
import time
import httpx
import psutil
from datetime import datetime, timezone
from typing import Optional


OPENCLAW_CONTROL_HOST = os.getenv("OPENCLAW_HOST", "localhost")
OPENCLAW_CONTROL_PORT = int(os.getenv("OPENCLAW_CONTROL_PORT", "18792"))
PROCESS_NAME = "openclaw-gateway"


def _find_gateway_process() -> Optional[psutil.Process]:
    for proc in psutil.process_iter(["pid", "name", "cmdline", "create_time"]):
        try:
            name = proc.info["name"] or ""
            if PROCESS_NAME in name:
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None


def get_gateway_status() -> dict:
    proc = _find_gateway_process()
    process_alive = proc is not None

    # HTTP liveness check against the control port
    http_ok = False
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"http://{OPENCLAW_CONTROL_HOST}:{OPENCLAW_CONTROL_PORT}/")
            http_ok = resp.status_code == 200 and resp.text.strip() == "OK"
    except Exception:
        pass

    status = "online" if (process_alive and http_ok) else "offline"

    # Uptime from process create_time
    uptime_sec = None
    last_restart = None
    if proc is not None:
        try:
            create_time = proc.info["create_time"]
            now = time.time()
            uptime_sec = now - create_time
            dt = datetime.fromtimestamp(create_time, tz=timezone.utc)
            last_restart = dt.isoformat()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    # Restart count not available without systemd — use None
    config_hash = _get_config_hash()

    return {
        "status": status,
        "uptime": uptime_sec,
        "restart_count": None,
        "last_restart": last_restart,
        "config_hash": config_hash,
    }


def _get_config_hash() -> Optional[str]:
    candidates = [
        "/home/wagz/.openclaw/openclaw.json",
        "/etc/openclaw/config.yaml",
        "/etc/openclaw/config.json",
        "/opt/openclaw/config.yaml",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    return hashlib.md5(f.read()).hexdigest()[:12]
            except Exception:
                pass
    return None
