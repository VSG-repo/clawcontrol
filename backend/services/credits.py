"""
OpenRouter credit balance and burn rate tracking.
"""
import asyncio
import os
import time
from collections import deque
from datetime import datetime, timezone
from typing import Optional
import httpx

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
CREDIT_CHECK_INTERVAL = 60  # Every minute
CREDIT_ALERT_FLOOR = float(os.getenv("CREDIT_ALERT_FLOOR", "5.0"))
DAILY_BURN_CEILING = float(os.getenv("DAILY_BURN_CEILING", "10.0"))

# Rolling history — 24 hourly buckets + 7 daily buckets
_burn_history_24h: deque = deque(maxlen=24)
_burn_history_7d: deque = deque(maxlen=7)

_credits_state = {
    "balance": None,
    "burn_1h": None,
    "burn_24h": None,
    "runway_days": None,
    "burn_history_24h": [],
    "burn_history_7d": [],
    "token_usage_today": 0,
    "cost_per_model": {},
    "errors": {"401": 0, "429": 0, "5xx": 0},
    "circuit_breaker_active": False,
    "last_updated": None,
}

_last_balance: Optional[float] = None
_last_balance_time: Optional[float] = None


async def fetch_balance() -> Optional[float]:
    if not OPENROUTER_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/auth/key",
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                # OpenRouter returns { data: { limit, usage, ... } }
                d = data.get("data", data)
                limit = d.get("limit")
                usage = d.get("usage", 0)
                if limit is not None:
                    return round(limit - usage, 6)
                # Some endpoints return credits directly
                return d.get("credits") or d.get("balance")
            elif resp.status_code == 401:
                _credits_state["errors"]["401"] += 1
            elif resp.status_code == 429:
                _credits_state["errors"]["429"] += 1
            else:
                _credits_state["errors"]["5xx"] += 1
    except Exception:
        pass
    return None


def _update_burn_rates(new_balance: float, prev_balance: float, elapsed_sec: float):
    if elapsed_sec <= 0:
        return
    burned = prev_balance - new_balance
    burn_rate_per_hour = (burned / elapsed_sec) * 3600

    _burn_history_24h.append(round(max(burned, 0), 6))
    _credits_state["burn_history_24h"] = list(_burn_history_24h)

    # 1h burn: last 60 readings (1 per min) → sum
    recent = list(_burn_history_24h)
    _credits_state["burn_1h"] = round(sum(recent[-60:]), 6) if recent else 0
    _credits_state["burn_24h"] = round(sum(recent), 6) if recent else 0

    daily_burn = _credits_state["burn_24h"]
    if daily_burn > 0:
        _credits_state["runway_days"] = round(new_balance / (daily_burn / (len(recent) / 60 / 24) if len(recent) > 0 else daily_burn), 1)
    else:
        _credits_state["runway_days"] = None


async def credits_loop():
    global _last_balance, _last_balance_time
    await asyncio.sleep(5)
    while True:
        balance = await fetch_balance()
        now = time.monotonic()

        if balance is not None:
            if _last_balance is not None and _last_balance_time is not None:
                _update_burn_rates(balance, _last_balance, now - _last_balance_time)
            _last_balance = balance
            _last_balance_time = now
            _credits_state["balance"] = balance
            _credits_state["last_updated"] = datetime.now(timezone.utc).isoformat()

        await asyncio.sleep(CREDIT_CHECK_INTERVAL)


def get_credits_state() -> dict:
    return dict(_credits_state)


def record_model_cost(model: str, cost: float):
    """Called by request middleware to track per-model cost."""
    existing = _credits_state["cost_per_model"].get(model, 0)
    _credits_state["cost_per_model"][model] = round(existing + cost, 6)


def record_error(code: str):
    """Track 401/429/5xx errors."""
    key = "5xx" if code.startswith("5") else code
    if key in _credits_state["errors"]:
        _credits_state["errors"][key] += 1
