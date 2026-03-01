from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional
from auth import require_auth
import services.notifications as notif_svc

router = APIRouter(prefix="/api/notifications", dependencies=[Depends(require_auth)])


@router.get("")
async def get_notifications():
    return {"notifications": notif_svc.get_notifications()}


@router.post("/dismiss/{notif_id}")
async def dismiss(notif_id: str):
    notif_svc.dismiss(notif_id)
    return {"ok": True}


@router.post("/dismiss-all")
async def dismiss_all():
    notif_svc.dismiss_all()
    return {"ok": True}


@router.get("/settings")
async def get_settings():
    return notif_svc.get_settings()


class SettingsUpdate(BaseModel):
    credit_floor:       Optional[float] = Field(None, ge=0.0, le=10_000.0)
    burn_ceiling_24h:   Optional[float] = Field(None, ge=0.0, le=10_000.0)
    cpu_temp_threshold: Optional[float] = Field(None, ge=0.0, le=200.0)
    probe_failures:     Optional[int]   = Field(None, ge=1, le=100)


@router.post("/settings")
async def update_settings(body: SettingsUpdate):
    notif_svc.update_settings(body.model_dump(exclude_none=True))
    return notif_svc.get_settings()
