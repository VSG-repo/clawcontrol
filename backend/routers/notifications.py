from fastapi import APIRouter, Depends
from pydantic import BaseModel
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
    credit_floor: Optional[float] = None
    burn_ceiling_24h: Optional[float] = None
    cpu_temp_threshold: Optional[float] = None
    probe_failures: Optional[int] = None


@router.post("/settings")
async def update_settings(body: SettingsUpdate):
    notif_svc.update_settings(body.model_dump(exclude_none=True))
    return notif_svc.get_settings()
