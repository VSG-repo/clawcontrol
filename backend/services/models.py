"""
Model stack reader — parses ~/.openclaw/openclaw.json to return the live
model configuration: primary, fallback chain, tier assignments, auth status.
"""
import json
import os
from typing import Optional

OPENCLAW_CONFIG = os.path.expanduser("~/.openclaw/openclaw.json")


def _short_name(model_id: str) -> str:
    """openrouter/openai/gpt-oss-20b  →  gpt-oss-20b"""
    return model_id.split("/")[-1]


def _provider(model_id: str) -> str:
    """openrouter/openai/gpt-oss-20b  →  openrouter"""
    return model_id.split("/")[0]


def _tier_from_alias(alias: str) -> Optional[str]:
    """'Tier-2-Heavy' → 'T2', None / unknown → None"""
    if not alias:
        return None
    parts = alias.split("-")
    if len(parts) >= 2 and parts[0] == "Tier":
        try:
            return f"T{int(parts[1])}"
        except ValueError:
            pass
    return None


def _auth_status(model_id: str, profiles: dict) -> str:
    provider = _provider(model_id)
    for key in profiles:
        if key.startswith(f"{provider}:"):
            return "connected"
    return "missing_key"


def get_model_stack() -> dict:
    """
    Returns:
        {
          "primary": { model dict } | None,
          "models":  [ model dicts ordered: primary, fallbacks, other tiers ]
        }

    Each model dict:
        model_id, name, alias, tier, role, is_primary, provider, auth_status
    """
    try:
        with open(OPENCLAW_CONFIG, "r") as f:
            config = json.load(f)
    except Exception:
        return {"primary": None, "models": []}

    agents   = config.get("agents", {})
    defaults = agents.get("defaults", {})
    model_cfg = defaults.get("model", {})
    models_meta = defaults.get("models", {})
    profiles = config.get("auth", {}).get("profiles", {})

    primary_id = model_cfg.get("primary")
    fallbacks  = model_cfg.get("fallbacks", [])

    # Ordered: primary → fallbacks → anything else in models_meta (T2/T3/T4)
    seen = set()
    ordered_ids = []
    for mid in ([primary_id] if primary_id else []) + fallbacks:
        if mid and mid not in seen:
            ordered_ids.append(mid)
            seen.add(mid)
    for mid in models_meta:
        if mid not in seen:
            ordered_ids.append(mid)
            seen.add(mid)

    models = []
    fallback_counter = 0
    for mid in ordered_ids:
        meta  = models_meta.get(mid, {})
        alias = meta.get("alias", "")
        tier  = _tier_from_alias(alias)
        is_primary = mid == primary_id

        if is_primary:
            role = "primary"
        elif mid in fallbacks:
            fallback_counter += 1
            role = f"fallback-{fallback_counter}"
        else:
            role = "available"

        models.append({
            "model_id":    mid,
            "name":        _short_name(mid),
            "alias":       alias,
            "tier":        tier,
            "role":        role,
            "is_primary":  is_primary,
            "provider":    _provider(mid),
            "auth_status": _auth_status(mid, profiles),
        })

    primary = next((m for m in models if m["is_primary"]), None)
    return {"primary": primary, "models": models}
