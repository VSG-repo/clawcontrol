"""
Orders router — Agents Factory Step 2
Orders stored in clawcontrol.json under "orders" array.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import require_auth

router = APIRouter(prefix="/api/orders", tags=["orders"])

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


def _load_cc() -> dict:
    if not CLAWCONTROL_CONFIG.exists():
        return {}
    try:
        with CLAWCONTROL_CONFIG.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read clawcontrol.json: {e}")


def _get_orders(cc: dict) -> list:
    orders = cc.get("orders", [])
    return orders if isinstance(orders, list) else []


# ── Pydantic models ────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    agentId:   str
    agentName: str
    directive: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", dependencies=[Depends(require_auth)])
def create_order(body: OrderCreate):
    agent_id = body.agentId.strip()
    if not agent_id:
        raise HTTPException(status_code=400, detail="agentId must not be empty")
    agent_name = body.agentName.strip()
    if not agent_name:
        raise HTTPException(status_code=400, detail="agentName must not be empty")
    directive = body.directive.strip()
    if not directive:
        raise HTTPException(status_code=400, detail="directive must not be empty")

    order = {
        "id":        str(uuid4()),
        "agentId":   agent_id,
        "agentName": agent_name,
        "directive": directive,
        "status":    "sent",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }

    cc = _load_cc()
    orders = _get_orders(cc)
    orders.append(order)
    cc["orders"] = orders
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)

    return {"ok": True, "order": order}


@router.get("", dependencies=[Depends(require_auth)])
def get_orders(
    limit:   int            = Query(default=50, ge=1, le=500),
    agentId: Optional[str]  = Query(default=None),
):
    cc = _load_cc()
    orders = _get_orders(cc)

    # Filter by agentId if provided
    if agentId:
        orders = [o for o in orders if o.get("agentId") == agentId]

    # Sort newest first
    orders = sorted(orders, key=lambda o: o.get("timestamp", ""), reverse=True)

    return {"orders": orders[:limit], "total": len(orders)}


@router.delete("/{order_id}", dependencies=[Depends(require_auth)])
def delete_order(order_id: str):
    cc = _load_cc()
    orders = _get_orders(cc)
    before = len(orders)
    orders = [o for o in orders if o.get("id") != order_id]

    if len(orders) == before:
        raise HTTPException(status_code=404, detail=f"Order not found: {order_id}")

    cc["orders"] = orders
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)
    return {"ok": True, "deleted": True, "id": order_id}


@router.delete("", dependencies=[Depends(require_auth)])
def clear_orders():
    cc = _load_cc()
    cc["orders"] = []
    _atomic_write_json(CLAWCONTROL_CONFIG, cc)
    return {"ok": True, "cleared": True}
