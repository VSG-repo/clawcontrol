from fastapi import APIRouter, Depends
from auth import require_auth
from services.openclaw import get_gateway_status
from services.probe import get_probe_state, run_probe
import asyncio

router = APIRouter()


@router.get("/api/status")
async def gateway_status(_=Depends(require_auth)):
    return get_gateway_status()


@router.get("/api/health-probe")
async def health_probe(_=Depends(require_auth)):
    return get_probe_state()


@router.post("/api/probe/run")
async def trigger_probe(_=Depends(require_auth)):
    result = await run_probe()
    return result
