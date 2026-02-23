"""
Notification engine — evaluates system state against thresholds,
maintains an in-memory alert feed, supports dismissal.
"""
import uuid
from datetime import datetime, timezone

_DEFAULT_SETTINGS = {
    "credit_floor": 5.0,         # alert if balance < $N
    "burn_ceiling_24h": 10.0,    # alert if 24h burn > $N
    "cpu_temp_threshold": 85.0,  # alert if CPU temp > N°C
    "probe_failures": 2,         # alert if consecutive failures >= N
}

_settings: dict = dict(_DEFAULT_SETTINGS)
_notifications: list[dict] = []
_dismissed: set[str] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _active_keys() -> set[str]:
    return {n["key"] for n in _notifications if n["id"] not in _dismissed}


def _add(level: str, title: str, message: str, key: str) -> None:
    if key in _active_keys():
        return
    notif = {
        "id": str(uuid.uuid4()),
        "key": key,
        "level": level,   # 'error' | 'warn' | 'info'
        "title": title,
        "message": message,
        "ts": _now(),
    }
    _notifications.append(notif)
    if len(_notifications) > 200:
        _notifications.pop(0)


def _resolve(key: str) -> None:
    for n in _notifications:
        if n["key"] == key and n["id"] not in _dismissed:
            _dismissed.add(n["id"])


def evaluate(state: dict) -> None:
    credits = state.get("credits", {})
    hardware = state.get("hardware", {})
    probe = state.get("probe", {})
    gateway = state.get("gateway", {})
    s = _settings

    # Credit floor
    balance = credits.get("balance")
    if balance is not None:
        if balance < s["credit_floor"]:
            _add("error", "Low Credit Balance",
                 f"OpenRouter balance ${balance:.2f} — below the ${s['credit_floor']:.2f} floor.",
                 "credit_floor")
        else:
            _resolve("credit_floor")

    # Burn ceiling
    burn = credits.get("burn_24h")
    if burn is not None:
        if burn > s["burn_ceiling_24h"]:
            _add("warn", "High Burn Rate",
                 f"24h burn ${burn:.4f} exceeds ceiling ${s['burn_ceiling_24h']:.2f}.",
                 "burn_ceiling")
        else:
            _resolve("burn_ceiling")

    # CPU temp
    temp = hardware.get("cpu_temp")
    if temp:
        if temp > s["cpu_temp_threshold"]:
            _add("warn", "CPU Temperature High",
                 f"CPU at {temp:.1f}°C — threshold is {s['cpu_temp_threshold']:.0f}°C.",
                 "cpu_temp")
        else:
            _resolve("cpu_temp")

    # CPU throttle
    if hardware.get("cpu_throttled"):
        _add("error", "CPU Throttling Active",
             "CPU thermal throttle engaged — performance reduced.",
             "cpu_throttle")
    else:
        _resolve("cpu_throttle")

    # Gateway offline
    if gateway.get("status") == "offline":
        _add("error", "Gateway Offline",
             "OpenClaw gateway is not responding on control port 18792.",
             "gateway_offline")
    else:
        _resolve("gateway_offline")

    # Probe failures
    failures = (probe or {}).get("consecutive_failures", 0) or 0
    if failures >= s["probe_failures"]:
        _add("error", "Health Probe Failing",
             f"Synthetic probe failed {failures} consecutive time(s).",
             "probe_failures")
    else:
        _resolve("probe_failures")

    # API errors
    errors = credits.get("errors", {})
    if (errors.get("401") or 0) > 0:
        _add("error", "API Auth Error",
             f'{errors["401"]} HTTP 401 errors — check API keys.',
             "api_401")
    if (errors.get("429") or 0) > 0:
        _add("warn", "API Rate Limited",
             f'{errors["429"]} HTTP 429 errors from provider.',
             "api_429")
    if (errors.get("5xx") or 0) > 0:
        _add("warn", "API Server Errors",
             f'{errors["5xx"]} HTTP 5xx errors from provider.',
             "api_5xx")


def get_notifications() -> list[dict]:
    return [n for n in _notifications if n["id"] not in _dismissed]


def get_count() -> int:
    return len(get_notifications())


def dismiss(notif_id: str) -> None:
    _dismissed.add(notif_id)


def dismiss_all() -> None:
    for n in _notifications:
        _dismissed.add(n["id"])


def get_settings() -> dict:
    return dict(_settings)


def update_settings(new: dict) -> None:
    for k, v in new.items():
        if k in _settings and v is not None:
            _settings[k] = v
