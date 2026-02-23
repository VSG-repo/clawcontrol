import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_auth
from services.models import get_model_stack

router = APIRouter()

OPENCLAW_CONFIG = Path.home() / ".openclaw" / "openclaw.json"

_routing_state = {
    "primary_model_id": None,
    "fallback_model_ids": [],
    "manual_override": {
        "enabled": False,
        "model_id": None,
        "requests_remaining": 0,
    },
}


class ManualOverrideUpdate(BaseModel):
    enabled: Optional[bool] = None
    model_id: Optional[str] = None
    requests_remaining: Optional[int] = None


class RoutingUpdate(BaseModel):
    primary_model_id: Optional[str] = None
    fallback_model_ids: Optional[list[str]] = None
    manual_override: Optional[ManualOverrideUpdate] = None


class HeartbeatUpdate(BaseModel):
    enabled: bool
    interval_seconds: int


def _default_config() -> dict:
    return {
        "agents": {
            "defaults": {
                "model": {
                    "primary": None,
                    "fallbacks": [],
                }
            }
        },
        "dashboard": {
            "routing": {
                "manual_override": {
                    "enabled": False,
                    "model_id": None,
                    "requests_remaining": 0,
                }
            }
        },
        "heartbeat": {
            "enabled": False,
            "interval_seconds": 60,
        },
    }


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
    if not OPENCLAW_CONFIG.exists():
        config = _default_config()
        _atomic_write_json(OPENCLAW_CONFIG, config)
        return config

    try:
        with OPENCLAW_CONFIG.open("r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read routing config: {e}")

    if not isinstance(config, dict):
        config = {}

    return config


def _routing_from_config(config: dict) -> dict:
    agents = config.setdefault("agents", {})
    defaults = agents.setdefault("defaults", {})
    model = defaults.setdefault("model", {})

    dashboard = config.setdefault("dashboard", {})
    routing = dashboard.setdefault("routing", {})

    manual = routing.setdefault("manual_override", {})

    primary = model.get("primary")
    fallbacks = model.get("fallbacks", [])

    if not isinstance(fallbacks, list):
        fallbacks = []

    manual_enabled = bool(manual.get("enabled", False))
    manual_model = manual.get("model_id")
    manual_requests = manual.get("requests_remaining", 0)
    if not isinstance(manual_requests, int) or manual_requests < 0:
        manual_requests = 0

    return {
        "primary_model_id": primary,
        "fallback_model_ids": [m for m in fallbacks if isinstance(m, str)],
        "manual_override": {
            "enabled": manual_enabled,
            "model_id": manual_model if isinstance(manual_model, str) or manual_model is None else None,
            "requests_remaining": manual_requests,
        },
    }


def _apply_routing_to_config(config: dict, routing: dict) -> dict:
    agents = config.setdefault("agents", {})
    defaults = agents.setdefault("defaults", {})
    model = defaults.setdefault("model", {})

    dashboard = config.setdefault("dashboard", {})
    routing_cfg = dashboard.setdefault("routing", {})

    model["primary"] = routing["primary_model_id"]
    model["fallbacks"] = routing["fallback_model_ids"]
    routing_cfg["manual_override"] = routing["manual_override"]

    return config


def _heartbeat_from_config(config: dict) -> dict:
    heartbeat = config.setdefault("heartbeat", {})

    enabled = bool(heartbeat.get("enabled", False))
    interval_seconds = heartbeat.get("interval_seconds", 60)
    if not isinstance(interval_seconds, int):
        interval_seconds = 60
    interval_seconds = max(30, min(1800, interval_seconds))

    return {
        "enabled": enabled,
        "interval_seconds": interval_seconds,
    }


def _apply_heartbeat_to_config(config: dict, heartbeat: dict) -> dict:
    config["heartbeat"] = {
        "enabled": heartbeat["enabled"],
        "interval_seconds": heartbeat["interval_seconds"],
    }
    return config


def _validate_payload(body: RoutingUpdate) -> None:
    if body.fallback_model_ids is not None:
        if any((not isinstance(mid, str) or not mid.strip()) for mid in body.fallback_model_ids):
            raise HTTPException(status_code=400, detail="fallback_model_ids must be non-empty strings")
        if len(set(body.fallback_model_ids)) != len(body.fallback_model_ids):
            raise HTTPException(status_code=400, detail="fallback_model_ids must be unique")

    if body.primary_model_id is not None and not body.primary_model_id.strip():
        raise HTTPException(status_code=400, detail="primary_model_id must be a non-empty string")

    if body.manual_override is not None:
        mo = body.manual_override
        if mo.requests_remaining is not None and mo.requests_remaining < 0:
            raise HTTPException(status_code=400, detail="requests_remaining must be >= 0")
        if mo.model_id is not None and not mo.model_id.strip():
            raise HTTPException(status_code=400, detail="model_id must be a non-empty string")


@router.get("/api/routing")
def get_routing(_=Depends(require_auth)):
    config = _load_config()
    routing = _routing_from_config(config)

    _routing_state.update(routing)

    # Ensure missing defaults are persisted to disk.
    updated_config = _apply_routing_to_config(config, routing)
    _atomic_write_json(OPENCLAW_CONFIG, updated_config)

    stack = get_model_stack()
    return {
        "routing": routing,
        "models": stack["models"],
    }


@router.post("/api/routing")
def update_routing(body: RoutingUpdate, _=Depends(require_auth)):
    _validate_payload(body)

    config = _load_config()
    routing = _routing_from_config(config)

    if body.primary_model_id is not None:
        routing["primary_model_id"] = body.primary_model_id

    if body.fallback_model_ids is not None:
        routing["fallback_model_ids"] = body.fallback_model_ids

    if body.manual_override is not None:
        update = body.manual_override.model_dump(exclude_none=True)
        routing["manual_override"] = {
            **routing["manual_override"],
            **update,
        }

    updated_config = _apply_routing_to_config(config, routing)
    _atomic_write_json(OPENCLAW_CONFIG, updated_config)

    _routing_state.update(routing)

    return {
        "ok": True,
        "routing": routing,
    }


@router.get("/api/heartbeat")
def get_heartbeat(_=Depends(require_auth)):
    config = _load_config()
    heartbeat = _heartbeat_from_config(config)

    updated_config = _apply_heartbeat_to_config(config, heartbeat)
    _atomic_write_json(OPENCLAW_CONFIG, updated_config)

    return {
        "ok": True,
        "heartbeat": heartbeat,
    }


@router.post("/api/heartbeat")
def update_heartbeat(body: HeartbeatUpdate, _=Depends(require_auth)):
    if body.interval_seconds < 30 or body.interval_seconds > 1800:
        raise HTTPException(status_code=400, detail="interval_seconds must be between 30 and 1800")

    config = _load_config()
    heartbeat = {
        "enabled": bool(body.enabled),
        "interval_seconds": int(body.interval_seconds),
    }

    updated_config = _apply_heartbeat_to_config(config, heartbeat)
    _atomic_write_json(OPENCLAW_CONFIG, updated_config)

    return {
        "ok": True,
        "heartbeat": heartbeat,
    }
