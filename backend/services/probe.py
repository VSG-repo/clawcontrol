"""
Synthetic health probe — sends a minimal test to OpenClaw every 5 minutes.
"""
import asyncio
import os
import time
import httpx
from datetime import datetime, timezone
from typing import Optional

OPENCLAW_HOST = os.getenv("OPENCLAW_HOST", "localhost")
OPENCLAW_CONTROL_PORT = int(os.getenv("OPENCLAW_CONTROL_PORT", "18792"))
PROBE_INTERVAL = 300  # 5 minutes

# Shared state
_probe_state = {
    "result": None,
    "timestamp": None,
    "latency_ms": None,
    "consecutive_failures": 0,
}


async def run_probe() -> dict:
    # Health check: GET http://localhost:18792/ → "OK" (HTTP 200, plain text)
    url = f"http://{OPENCLAW_HOST}:{OPENCLAW_CONTROL_PORT}/"
    start = time.monotonic()
    result = "FAIL"
    latency_ms = None
    error = None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            latency_ms = round((time.monotonic() - start) * 1000)
            if resp.status_code == 200 and resp.text.strip() == "OK":
                result = "PASS"
            else:
                error = f"HTTP {resp.status_code}: {resp.text.strip()[:40]}"
    except httpx.ConnectError:
        error = "Connection refused"
        latency_ms = round((time.monotonic() - start) * 1000)
    except Exception as e:
        error = str(e)[:80]
        latency_ms = round((time.monotonic() - start) * 1000)

    ts = datetime.now(timezone.utc).isoformat()

    if result == "PASS":
        _probe_state["consecutive_failures"] = 0
    else:
        _probe_state["consecutive_failures"] += 1

    _probe_state.update({
        "result": result,
        "timestamp": ts,
        "latency_ms": latency_ms,
        "error": error,
    })

    return get_probe_state()


def get_probe_state() -> dict:
    return dict(_probe_state)


async def probe_loop():
    """Background task — probe every 5 minutes."""
    await asyncio.sleep(10)  # Small delay on startup
    while True:
        await run_probe()
        await asyncio.sleep(PROBE_INTERVAL)
