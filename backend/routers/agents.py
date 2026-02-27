"""
Agents Factory router — Step 1
Primary agent config read from openclaw.json (read-only).
Custom agents stored in clawcontrol.json under "agents" array.
Primary agent display name stored in clawcontrol.json under "agents.primaryName".
"""
import json
import os
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_auth

router = APIRouter(prefix="/api/agents", tags=["agents"])

OPENCLAW_CONFIG    = Path.home() / ".openclaw" / "openclaw.json"
CLAWCONTROL_CONFIG = Path.home() / ".openclaw" / "clawcontrol.json"


# ── IO helpers ─────────────────────────────────────────────────────────────────

def _atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    tmp_path.replace(path)


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read {path.name}: {e}")


def _load_openclaw() -> dict:
    return _load_json(OPENCLAW_CONFIG)


def _load_cc() -> dict:
    return _load_json(CLAWCONTROL_CONFIG)


# ── Primary agent builder ──────────────────────────────────────────────────────

def _build_primary(oc: dict, cc: dict) -> dict:
    defaults = oc.get("defaults", {})
    model    = defaults.get("model", {})

    primary_name = (
        cc.get("agents", {}).get("primaryName")
        if isinstance(cc.get("agents"), dict)
        else None
    ) or "Primary Agent"

    return {
        "id":            "primary",
        "name":          primary_name,
        "primary":       True,
        "deletable":     False,
        "model": {
            "primary":   model.get("primary"),
            "fallbacks": model.get("fallbacks", []),
        },
        "workspace":     oc.get("workspace"),
        "compaction":    oc.get("compaction"),
        "maxConcurrent": oc.get("maxConcurrent"),
        "subagents":     oc.get("subagents"),
    }


# ── Custom agents helpers ──────────────────────────────────────────────────────

def _get_custom_agents(cc: dict) -> list:
    agents_block = cc.get("agents", {})
    if isinstance(agents_block, dict):
        agents = agents_block.get("list", [])
    else:
        agents = []
    return agents if isinstance(agents, list) else []


def _set_custom_agents(cc: dict, agents: list) -> None:
    if not isinstance(cc.get("agents"), dict):
        cc["agents"] = {}
    cc["agents"]["list"] = agents


# ── Pydantic models ────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    model: str
    identity: Optional[str] = None
    systemPrompt: Optional[str] = None
    skills: Optional[list[str]] = []
    status: Optional[str] = "idle"


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    identity: Optional[str] = None
    systemPrompt: Optional[str] = None
    skills: Optional[list[str]] = None
    status: Optional[str] = None


class PrimaryNameUpdate(BaseModel):
    name: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(require_auth)])
def get_agents():
    oc = _load_openclaw()
    cc = _load_cc()
    return {
        "primary": _build_primary(oc, cc),
        "custom":  _get_custom_agents(cc),
    }


@router.post("", dependencies=[Depends(require_auth)])
def create_agent(body: AgentCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name must not be empty")
    model = body.model.strip()
    if not model:
        raise HTTPException(status_code=400, detail="model must not be empty")

    agent = {
        "id":           str(uuid4()),
        "name":         name,
        "model":        model,
        "identity":     body.identity or "",
        "systemPrompt": body.systemPrompt or "",
        "skills":       body.skills or [],
        "status":       body.status or "idle",
        "primary":      False,
        "deletable":    True,
    }

    cc = _load_cc()
    agents = _get_custom_agents(cc)
    agents.append(agent)
    _set_custom_agents(cc, agents)
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)

    return {"ok": True, "agent": agent}


@router.put("/{agent_id}", dependencies=[Depends(require_auth)])
def update_agent(agent_id: str, body: AgentUpdate):
    if agent_id == "primary":
        raise HTTPException(status_code=400, detail="Use PUT /api/agents/primary/name to rename the primary agent")

    cc = _load_cc()
    agents = _get_custom_agents(cc)

    for agent in agents:
        if agent.get("id") == agent_id:
            if body.name is not None:
                n = body.name.strip()
                if not n:
                    raise HTTPException(status_code=400, detail="name must not be empty")
                agent["name"] = n
            if body.model is not None:
                m = body.model.strip()
                if not m:
                    raise HTTPException(status_code=400, detail="model must not be empty")
                agent["model"] = m
            if body.identity is not None:
                agent["identity"] = body.identity
            if body.systemPrompt is not None:
                agent["systemPrompt"] = body.systemPrompt
            if body.skills is not None:
                agent["skills"] = body.skills
            if body.status is not None:
                agent["status"] = body.status

            _set_custom_agents(cc, agents)
            _atomic_write_json(CLAWCONTROL_CONFIG, cc)
            return {"ok": True, "agent": agent}

    raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")


@router.delete("/{agent_id}", dependencies=[Depends(require_auth)])
def delete_agent(agent_id: str):
    if agent_id == "primary":
        raise HTTPException(status_code=400, detail="Cannot delete the primary agent")

    cc = _load_cc()
    agents = _get_custom_agents(cc)
    before = len(agents)
    agents = [a for a in agents if a.get("id") != agent_id]

    if len(agents) == before:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    _set_custom_agents(cc, agents)
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)
    return {"ok": True, "deleted": True, "id": agent_id}


@router.put("/primary/name", dependencies=[Depends(require_auth)])
def set_primary_name(body: PrimaryNameUpdate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name must not be empty")

    cc = _load_cc()
    if not isinstance(cc.get("agents"), dict):
        cc["agents"] = {}
    cc["agents"]["primaryName"] = name
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)

    return {"ok": True, "name": name}
