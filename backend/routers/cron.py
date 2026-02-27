"""
Cron router — Agents Factory Step 3
System cron jobs read from openclaw.json "cron" key (read-only).
Custom cron jobs stored in clawcontrol.json under "cron" array.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_auth

router = APIRouter(prefix="/api/cron", tags=["cron"])

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


def _load_json(path: Path, label: str) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read {label}: {e}")


def _load_openclaw() -> dict:
    return _load_json(OPENCLAW_CONFIG, "openclaw.json")


def _load_cc() -> dict:
    return _load_json(CLAWCONTROL_CONFIG, "clawcontrol.json")


# ── Cron helpers ───────────────────────────────────────────────────────────────

def _get_system_jobs(oc: dict) -> list:
    """
    Extract system cron jobs from openclaw.json["cron"].
    Accepts either a list or a dict of named entries.
    """
    raw = oc.get("cron")
    if not raw:
        return []

    jobs = []
    if isinstance(raw, list):
        entries = raw
    elif isinstance(raw, dict):
        entries = list(raw.values())
    else:
        return []

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        job = dict(entry)
        job.setdefault("id", str(uuid4()))
        job["source"]   = "system"
        job["editable"] = False
        jobs.append(job)

    return jobs


def _get_custom_jobs(cc: dict) -> list:
    jobs = cc.get("cron", [])
    return jobs if isinstance(jobs, list) else []


# ── Pydantic models ────────────────────────────────────────────────────────────

class CronCreate(BaseModel):
    name:        str
    agentId:     str
    schedule:    str
    directive:   str
    description: Optional[str] = ""
    enabled:     Optional[bool] = True


class CronUpdate(BaseModel):
    name:        Optional[str]  = None
    agentId:     Optional[str]  = None
    schedule:    Optional[str]  = None
    directive:   Optional[str]  = None
    description: Optional[str]  = None
    enabled:     Optional[bool] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(require_auth)])
def get_cron():
    oc = _load_openclaw()
    cc = _load_cc()

    system_jobs = _get_system_jobs(oc)
    custom_jobs = [
        {**job, "source": "custom", "editable": True}
        for job in _get_custom_jobs(cc)
    ]

    return {"system": system_jobs, "custom": custom_jobs}


@router.post("", dependencies=[Depends(require_auth)])
def create_cron(body: CronCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name must not be empty")
    agent_id = body.agentId.strip()
    if not agent_id:
        raise HTTPException(status_code=400, detail="agentId must not be empty")
    schedule = body.schedule.strip()
    if not schedule:
        raise HTTPException(status_code=400, detail="schedule must not be empty")
    directive = body.directive.strip()
    if not directive:
        raise HTTPException(status_code=400, detail="directive must not be empty")

    job = {
        "id":          str(uuid4()),
        "name":        name,
        "agentId":     agent_id,
        "schedule":    schedule,
        "directive":   directive,
        "description": (body.description or "").strip(),
        "enabled":     body.enabled if body.enabled is not None else True,
        "source":      "custom",
        "editable":    True,
        "createdAt":   datetime.now(tz=timezone.utc).isoformat(),
        "lastRun":     None,
        "nextRun":     None,
    }

    cc = _load_cc()
    jobs = _get_custom_jobs(cc)
    jobs.append(job)
    cc["cron"] = jobs
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)

    return {"ok": True, "job": job}


@router.put("/{job_id}", dependencies=[Depends(require_auth)])
def update_cron(job_id: str, body: CronUpdate):
    cc = _load_cc()
    jobs = _get_custom_jobs(cc)

    for job in jobs:
        if job.get("id") == job_id:
            if body.name is not None:
                n = body.name.strip()
                if not n:
                    raise HTTPException(status_code=400, detail="name must not be empty")
                job["name"] = n
            if body.agentId is not None:
                a = body.agentId.strip()
                if not a:
                    raise HTTPException(status_code=400, detail="agentId must not be empty")
                job["agentId"] = a
            if body.schedule is not None:
                s = body.schedule.strip()
                if not s:
                    raise HTTPException(status_code=400, detail="schedule must not be empty")
                job["schedule"] = s
            if body.directive is not None:
                d = body.directive.strip()
                if not d:
                    raise HTTPException(status_code=400, detail="directive must not be empty")
                job["directive"] = d
            if body.description is not None:
                job["description"] = body.description.strip()
            if body.enabled is not None:
                job["enabled"] = body.enabled

            cc["cron"] = jobs
            _atomic_write_json(CLAWCONTROL_CONFIG, cc)
            return {"ok": True, "job": {**job, "source": "custom", "editable": True}}

    # Check if it's a system job being edited
    oc = _load_openclaw()
    system_ids = {j.get("id") for j in _get_system_jobs(oc)}
    if job_id in system_ids:
        raise HTTPException(status_code=403, detail="System cron jobs are read-only")

    raise HTTPException(status_code=404, detail=f"Cron job not found: {job_id}")


@router.put("/{job_id}/toggle", dependencies=[Depends(require_auth)])
def toggle_cron(job_id: str):
    cc = _load_cc()
    jobs = _get_custom_jobs(cc)

    for job in jobs:
        if job.get("id") == job_id:
            job["enabled"] = not bool(job.get("enabled", True))
            cc["cron"] = jobs
            _atomic_write_json(CLAWCONTROL_CONFIG, cc)
            return {"ok": True, "job": {**job, "source": "custom", "editable": True}}

    oc = _load_openclaw()
    system_ids = {j.get("id") for j in _get_system_jobs(oc)}
    if job_id in system_ids:
        raise HTTPException(status_code=403, detail="System cron jobs are read-only")

    raise HTTPException(status_code=404, detail=f"Cron job not found: {job_id}")


@router.delete("/{job_id}", dependencies=[Depends(require_auth)])
def delete_cron(job_id: str):
    cc = _load_cc()
    jobs = _get_custom_jobs(cc)
    before = len(jobs)
    jobs = [j for j in jobs if j.get("id") != job_id]

    if len(jobs) == before:
        oc = _load_openclaw()
        system_ids = {j.get("id") for j in _get_system_jobs(oc)}
        if job_id in system_ids:
            raise HTTPException(status_code=403, detail="System cron jobs cannot be deleted")
        raise HTTPException(status_code=404, detail=f"Cron job not found: {job_id}")

    cc["cron"] = jobs
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)
    return {"ok": True, "deleted": True, "id": job_id}
