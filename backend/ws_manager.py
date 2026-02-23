"""
WebSocket connection manager.
Broadcasts live data to all connected clients every 2 seconds.
"""
import asyncio
import json
import time
from typing import Set
from fastapi import WebSocket

_connections: Set[WebSocket] = set()
_prev_net_bytes_sent = None
_prev_net_time = None


async def connect(ws: WebSocket):
    await ws.accept()
    _connections.add(ws)


def disconnect(ws: WebSocket):
    _connections.discard(ws)


async def broadcast(data: dict):
    if not _connections:
        return
    msg = json.dumps(data)
    dead = set()
    for ws in list(_connections):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    for ws in dead:
        _connections.discard(ws)


async def live_data_loop():
    """Push live metrics to all WS clients every 2 seconds."""
    global _prev_net_bytes_sent, _prev_net_time
    import psutil
    from services.system_metrics import get_metrics, get_cpu_temp
    from services.openclaw import get_gateway_status
    from services.probe import get_probe_state
    from services.credits import get_credits_state
    from services.models import get_model_stack
    import services.notifications as notif_svc

    while True:
        await asyncio.sleep(2)
        if not _connections:
            continue
        try:
            # Hardware metrics
            hw = get_metrics()

            # Network rate (bytes/sec delta)
            try:
                net = psutil.net_io_counters()
                now = time.monotonic()
                if _prev_net_bytes_sent is not None and _prev_net_time is not None:
                    elapsed = now - _prev_net_time
                    if elapsed > 0:
                        rate_mbps = (net.bytes_sent - _prev_net_bytes_sent) / elapsed / 1024 / 1024
                        hw["net_outbound_mbps"] = round(max(rate_mbps, 0), 3)
                _prev_net_bytes_sent = net.bytes_sent
                _prev_net_time = now
            except Exception:
                pass

            gw = get_gateway_status()
            probe = get_probe_state()
            credits = get_credits_state()
            stack = get_model_stack()
            primary = stack["primary"]

            # Evaluate notifications against current state
            notif_svc.evaluate({
                "gateway": gw,
                "probe": probe,
                "hardware": hw,
                "credits": credits,
            })

            payload = {
                "gateway": gw,
                "probe": probe,
                "hardware": hw,
                "credits": {k: v for k, v in credits.items()},
                "model": {
                    "tier":        primary["tier"] if primary else None,
                    "name":        primary["name"] if primary else None,
                    "model_id":    primary["model_id"] if primary else None,
                    "role":        primary["role"] if primary else None,
                    "latency_p50": None,
                    "latency_p95": None,
                    "queue_depth": 0,
                    "tps":         None,
                },
                "notification_count": notif_svc.get_count(),
                "tiers": stack["models"],
            }
            await broadcast(payload)
        except Exception as e:
            pass  # Don't crash the loop on metric errors
