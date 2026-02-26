"""
Credentials & Keys router — Phase 5
Stores under dashboard.keys.<provider> and dashboard.circuit_breaker in clawcontrol.json.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_auth

router = APIRouter()

CLAWCONTROL_CONFIG = Path.home() / ".openclaw" / "clawcontrol.json"

PROVIDERS = {
    "openrouter": {
        "name":         "OpenRouter",
        "key_prefix":   "",
        "validate_url": "https://openrouter.ai/api/v1/auth/key",
    },
    "openai": {
        "name":         "OpenAI",
        "key_prefix":   "sk-",
        "validate_url": None,
    },
    "anthropic": {
        "name":         "Anthropic",
        "key_prefix":   "sk-ant-",
        "validate_url": None,
    },
    "xai": {
        "name":         "xAI (Grok)",
        "key_prefix":   "xai-",
        "validate_url": None,
    },
    "minimax": {
        "name":         "MiniMax",
        "key_prefix":   "",
        "validate_url": None,
    },
    "google": {
        "name":         "Google (Gemini)",
        "key_prefix":   "AI",
        "validate_url": None,
    },
    "deepseek": {
        "name":         "DeepSeek",
        "key_prefix":   "sk-",
        "validate_url": None,
    },
}


# ── Pydantic models ────────────────────────────────────────────────────────────

class AddKeyRequest(BaseModel):
    provider: str
    key: str
    label: Optional[str] = None


class RotateKeyRequest(BaseModel):
    provider: str
    key: str


class CircuitBreakerUpdate(BaseModel):
    enabled: Optional[bool] = None
    daily_limit_usd: Optional[float] = None
    hard_stop: Optional[bool] = None


# ── Config helpers (same pattern as routing.py) ────────────────────────────────

def _atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    tmp_path.replace(path)


def _load_config() -> dict:
    if not CLAWCONTROL_CONFIG.exists():
        return {}
    try:
        with CLAWCONTROL_CONFIG.open("r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read config: {e}")
    if not isinstance(config, dict):
        return {}
    return config


# ── Key helpers ────────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "•" * len(key)
    return key[:4] + "•" * (len(key) - 8) + key[-4:]


def _check_key_health(provider: str, key: str) -> str:
    """Returns: valid | invalid | rate_limited | invalid_format | unknown"""
    info = PROVIDERS.get(provider)
    if not info:
        return "unknown"

    validate_url = info.get("validate_url")

    if validate_url:
        # Try live validation first — prefix is irrelevant here
        try:
            resp = httpx.get(
                validate_url,
                headers={"Authorization": f"Bearer {key}"},
                timeout=10,
            )
            if resp.status_code == 200:
                return "valid"
            if resp.status_code == 429:
                return "rate_limited"
            if resp.status_code in (401, 403):
                return "invalid"
            return "unknown"
        except Exception:
            return "unknown"

    # No validate_url — fall back to prefix format check
    prefix = info["key_prefix"]
    if prefix and not key.startswith(prefix):
        return "invalid_format"
    return "valid"


def _get_keys(config: dict) -> dict:
    return config.setdefault("dashboard", {}).setdefault("keys", {})


def _get_circuit_breaker(config: dict) -> dict:
    cb = config.setdefault("dashboard", {}).setdefault("circuit_breaker", {})
    return {
        "enabled":         bool(cb.get("enabled", False)),
        "daily_limit_usd": float(cb.get("daily_limit_usd", 10.0)),
        "hard_stop":       bool(cb.get("hard_stop", False)),
        "spend_today_usd": float(cb.get("spend_today_usd", 0.0)),
        "last_reset":      cb.get("last_reset"),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/api/keys", dependencies=[Depends(require_auth)])
def get_keys():
    config = _load_config()
    stored = _get_keys(config)
    cb = _get_circuit_breaker(config)

    keys_out = []
    for provider_id, entry in stored.items():
        if not isinstance(entry, dict):
            continue
        keys_out.append({
            "provider":     provider_id,
            "name":         PROVIDERS.get(provider_id, {}).get("name", provider_id),
            "label":        entry.get("label", ""),
            "masked_key":   entry.get("masked_key", ""),
            "status":       entry.get("status", "unknown"),
            "added_at":     entry.get("added_at"),
            "rotated_from": entry.get("rotated_from"),
        })

    providers_out = [
        {
            "id":         pid,
            "name":       info["name"],
            "key_prefix": info["key_prefix"],
            "configured": pid in stored,
        }
        for pid, info in PROVIDERS.items()
    ]

    return {
        "keys":            keys_out,
        "providers":       providers_out,
        "circuit_breaker": cb,
    }


@router.post("/api/keys", dependencies=[Depends(require_auth)])
def add_key(body: AddKeyRequest):
    provider = body.provider.strip().lower()
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    key = body.key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="key must not be empty")

    status = _check_key_health(provider, key)

    config = _load_config()
    stored = _get_keys(config)
    stored[provider] = {
        "masked_key": _mask_key(key),
        "raw_key":    key,
        "label":      (body.label or "").strip(),
        "added_at":   datetime.now(tz=timezone.utc).isoformat(),
        "status":     status,
    }
    config["dashboard"]["keys"] = stored
    _atomic_write_json(CLAWCONTROL_CONFIG, config)

    return {
        "ok":       True,
        "provider": provider,
        "status":   status,
        "masked":   _mask_key(key),
    }


@router.post("/api/keys/rotate", dependencies=[Depends(require_auth)])
def rotate_key(body: RotateKeyRequest):
    provider = body.provider.strip().lower()
    config = _load_config()
    stored = _get_keys(config)

    if provider not in stored:
        raise HTTPException(status_code=404, detail=f"Provider not configured: {provider}")

    old_masked = stored[provider].get("masked_key", "")
    new_key = body.key.strip()
    if not new_key:
        raise HTTPException(status_code=400, detail="key must not be empty")

    status = _check_key_health(provider, new_key)

    stored[provider] = {
        "masked_key":   _mask_key(new_key),
        "raw_key":      new_key,
        "label":        stored[provider].get("label", ""),
        "added_at":     stored[provider].get("added_at"),
        "rotated_at":   datetime.now(tz=timezone.utc).isoformat(),
        "rotated_from": old_masked,
        "status":       status,
    }
    config["dashboard"]["keys"] = stored
    _atomic_write_json(CLAWCONTROL_CONFIG, config)

    return {
        "ok":       True,
        "provider": provider,
        "status":   status,
        "masked":   _mask_key(new_key),
    }


@router.delete("/api/keys/{provider}", dependencies=[Depends(require_auth)])
def delete_key(provider: str):
    provider = provider.strip().lower()
    config = _load_config()
    stored = _get_keys(config)

    if provider not in stored:
        raise HTTPException(status_code=404, detail=f"Provider not configured: {provider}")

    del stored[provider]
    config["dashboard"]["keys"] = stored
    _atomic_write_json(CLAWCONTROL_CONFIG, config)

    return {"ok": True, "provider": provider}


@router.post("/api/keys/check/{provider}", dependencies=[Depends(require_auth)])
def check_key(provider: str):
    provider = provider.strip().lower()
    config = _load_config()
    stored = _get_keys(config)

    if provider not in stored:
        raise HTTPException(status_code=404, detail=f"Provider not configured: {provider}")

    raw_key = stored[provider].get("raw_key", "")
    status = _check_key_health(provider, raw_key)

    stored[provider]["status"] = status
    config["dashboard"]["keys"] = stored
    _atomic_write_json(CLAWCONTROL_CONFIG, config)

    return {
        "ok":       True,
        "provider": provider,
        "status":   status,
    }


@router.get("/api/circuit-breaker", dependencies=[Depends(require_auth)])
def get_circuit_breaker():
    config = _load_config()
    return _get_circuit_breaker(config)


@router.post("/api/circuit-breaker", dependencies=[Depends(require_auth)])
def update_circuit_breaker(body: CircuitBreakerUpdate):
    config = _load_config()
    cb = _get_circuit_breaker(config)

    if body.enabled is not None:
        cb["enabled"] = bool(body.enabled)

    if body.daily_limit_usd is not None:
        if body.daily_limit_usd < 0.50 or body.daily_limit_usd > 500:
            raise HTTPException(
                status_code=400,
                detail="daily_limit_usd must be between 0.50 and 500",
            )
        cb["daily_limit_usd"] = body.daily_limit_usd

    if body.hard_stop is not None:
        cb["hard_stop"] = bool(body.hard_stop)

    config["dashboard"]["circuit_breaker"] = cb
    _atomic_write_json(CLAWCONTROL_CONFIG, config)

    return {"ok": True, "circuit_breaker": cb}
