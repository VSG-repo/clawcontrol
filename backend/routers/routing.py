"""
Model Routing Controls router — Phase 4

Config split:
  openclaw.json        — agents.defaults.model (primary + fallbacks) — read/written here
  clawcontrol.json     — manual_override, heartbeat — read/written here
"""
import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_auth
from services.models import get_model_stack

router = APIRouter()

OPENCLAW_CONFIG    = Path.home() / ".openclaw" / "openclaw.json"
CLAWCONTROL_CONFIG = Path.home() / ".openclaw" / "clawcontrol.json"

_routing_state = {
    "primary_model_id": None,
    "fallback_model_ids": [],
    "manual_override": {
        "enabled": False,
        "model_id": None,
        "requests_remaining": 0,
    },
}


# ── Pydantic models ───────────────────────────────────────────────────────────

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


class IntentRuleUpdate(BaseModel):
    id: str
    target_model: str


class IntentRoutingUpdate(BaseModel):
    enabled: Optional[bool] = None
    rules: Optional[list[IntentRuleUpdate]] = None


# ── IO helpers ────────────────────────────────────────────────────────────────

def _atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    tmp_path.replace(path)


def _load_json(path: Path, context: str = "config") -> dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read {context}: {e}")
    return data if isinstance(data, dict) else {}


def _load_openclaw() -> dict:
    return _load_json(OPENCLAW_CONFIG, "openclaw.json")


def _load_cc() -> dict:
    return _load_json(CLAWCONTROL_CONFIG, "clawcontrol.json")


# ── Routing logic ─────────────────────────────────────────────────────────────

def _default_openclaw() -> dict:
    return {"agents": {"defaults": {"model": {"primary": None, "fallbacks": []}}}}


def _default_cc() -> dict:
    return {
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


def _routing_from_configs(oc: dict, cc: dict) -> dict:
    # Model stack lives in openclaw.json
    model = oc.get("agents", {}).get("defaults", {}).get("model", {})
    primary   = model.get("primary")
    fallbacks = model.get("fallbacks", [])
    if not isinstance(fallbacks, list):
        fallbacks = []

    # Manual override lives in clawcontrol.json
    manual = cc.get("dashboard", {}).get("routing", {}).get("manual_override", {})
    manual_enabled  = bool(manual.get("enabled", False))
    manual_model    = manual.get("model_id")
    manual_requests = manual.get("requests_remaining", 0)
    if not isinstance(manual_requests, int) or manual_requests < 0:
        manual_requests = 0

    return {
        "primary_model_id":  primary,
        "fallback_model_ids": [m for m in fallbacks if isinstance(m, str)],
        "manual_override": {
            "enabled":            manual_enabled,
            "model_id":           manual_model if isinstance(manual_model, str) or manual_model is None else None,
            "requests_remaining": manual_requests,
        },
    }


def _apply_routing(oc: dict, cc: dict, routing: dict) -> None:
    """Write model stack to openclaw.json; write override to clawcontrol.json."""
    # openclaw.json — agents.defaults.model
    agents   = oc.setdefault("agents", {})
    defaults = agents.setdefault("defaults", {})
    model    = defaults.setdefault("model", {})
    model["primary"]   = routing["primary_model_id"]
    model["fallbacks"] = routing["fallback_model_ids"]
    _atomic_write_json(OPENCLAW_CONFIG, oc)

    # clawcontrol.json — dashboard.routing.manual_override
    dash    = cc.setdefault("dashboard", {})
    routing_cfg = dash.setdefault("routing", {})
    routing_cfg["manual_override"] = routing["manual_override"]
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)


# ── Intent routing logic ──────────────────────────────────────────────────────

_DEFAULT_INTENT_RULES: list[dict] = [
    {
        "id": "has_image",
        "label": "Image Detected",
        "description": "Message contains an image attachment",
        "target_model": "openrouter/qwen/qwen3.5-flash-02-23",
        "priority": 1,
    },
    {
        "id": "has_code",
        "label": "Code Detected",
        "description": "Message contains code fences (```) or code keywords",
        "target_model": "openai-codex/gpt-5.1-codex-max",
        "priority": 2,
    },
    {
        "id": "short_routine",
        "label": "Short / Routine",
        "description": "Estimated token count < 200, no code or image detected",
        "target_model": "openrouter/openai/gpt-oss-20b",
        "priority": 3,
    },
]

_KNOWN_INTENT_IDS = {r["id"] for r in _DEFAULT_INTENT_RULES}


def _intent_routing_from_cc(cc: dict) -> dict:
    ir = cc.get("intent_routing", {})
    if not isinstance(ir, dict):
        return {"enabled": False, "rules": list(_DEFAULT_INTENT_RULES)}
    enabled = bool(ir.get("enabled", False))
    rules = ir.get("rules")
    if not isinstance(rules, list):
        rules = list(_DEFAULT_INTENT_RULES)
    else:
        rules = [r for r in rules if isinstance(r, dict) and r.get("id") in _KNOWN_INTENT_IDS]
        if len(rules) != len(_DEFAULT_INTENT_RULES):
            rules = list(_DEFAULT_INTENT_RULES)
    return {"enabled": enabled, "rules": sorted(rules, key=lambda r: r.get("priority", 99))}


def _apply_intent_routing_to_cc(cc: dict, intent: dict) -> None:
    cc["intent_routing"] = intent
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)


# ── Heartbeat logic ───────────────────────────────────────────────────────────

def _heartbeat_from_cc(cc: dict) -> dict:
    hb = cc.get("heartbeat", {})
    enabled  = bool(hb.get("enabled", False))
    interval = hb.get("interval_seconds", 60)
    if not isinstance(interval, int):
        interval = 60
    interval = max(30, min(1800, interval))
    return {"enabled": enabled, "interval_seconds": interval}


def _apply_heartbeat_to_cc(cc: dict, heartbeat: dict) -> None:
    cc["heartbeat"] = heartbeat
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)


# ── Validation ────────────────────────────────────────────────────────────────

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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/routing")
def get_routing(_=Depends(require_auth)):
    oc = _load_openclaw()
    cc = _load_cc()
    routing = _routing_from_configs(oc, cc)
    _routing_state.update(routing)
    # Persist any missing defaults
    _apply_routing(oc, cc, routing)
    stack = get_model_stack()
    return {"routing": routing, "models": stack["models"]}


@router.post("/api/routing")
def update_routing(body: RoutingUpdate, _=Depends(require_auth)):
    _validate_payload(body)

    oc = _load_openclaw()
    cc = _load_cc()
    routing = _routing_from_configs(oc, cc)

    if body.primary_model_id is not None:
        routing["primary_model_id"] = body.primary_model_id

    if body.fallback_model_ids is not None:
        routing["fallback_model_ids"] = body.fallback_model_ids

    if body.manual_override is not None:
        update = body.manual_override.model_dump(exclude_none=True)
        routing["manual_override"] = {**routing["manual_override"], **update}

    _apply_routing(oc, cc, routing)
    _routing_state.update(routing)

    return {"ok": True, "routing": routing}


@router.get("/api/heartbeat")
def get_heartbeat(_=Depends(require_auth)):
    cc = _load_cc()
    heartbeat = _heartbeat_from_cc(cc)
    _apply_heartbeat_to_cc(cc, heartbeat)
    return {"ok": True, "heartbeat": heartbeat}


@router.post("/api/heartbeat")
def update_heartbeat(body: HeartbeatUpdate, _=Depends(require_auth)):
    if body.interval_seconds < 30 or body.interval_seconds > 1800:
        raise HTTPException(status_code=400, detail="interval_seconds must be between 30 and 1800")

    cc = _load_cc()
    heartbeat = {
        "enabled":            bool(body.enabled),
        "interval_seconds":   int(body.interval_seconds),
    }
    _apply_heartbeat_to_cc(cc, heartbeat)

    return {"ok": True, "heartbeat": heartbeat}


@router.get("/api/routing/intent")
def get_intent_routing(_=Depends(require_auth)):
    cc = _load_cc()
    intent = _intent_routing_from_cc(cc)
    _apply_intent_routing_to_cc(cc, intent)
    return {"ok": True, "intent_routing": intent}


@router.post("/api/routing/intent")
def update_intent_routing(body: IntentRoutingUpdate, _=Depends(require_auth)):
    cc = _load_cc()
    intent = _intent_routing_from_cc(cc)

    if body.enabled is not None:
        intent["enabled"] = bool(body.enabled)

    if body.rules is not None:
        rule_map = {r["id"]: r for r in intent["rules"]}
        for upd in body.rules:
            if upd.id in rule_map and upd.target_model.strip():
                rule_map[upd.id]["target_model"] = upd.target_model.strip()
        intent["rules"] = sorted(rule_map.values(), key=lambda r: r.get("priority", 99))

    _apply_intent_routing_to_cc(cc, intent)
    return {"ok": True, "intent_routing": intent}
