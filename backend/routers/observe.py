from fastapi import APIRouter, Depends, Query
from auth import require_auth
from services.observe import (
    get_sessions,
    get_cron,
    get_delivery_queue,
    get_activity,
)

router = APIRouter(prefix="/api/observe", dependencies=[Depends(require_auth)])


@router.get("/sessions")
def sessions(status: str = Query(default="")):
    items = get_sessions(status_filter=status or None)
    return {"sessions": items, "total": len(items)}


@router.get("/cron")
def cron():
    jobs = get_cron()
    return {"jobs": jobs, "total": len(jobs)}


@router.get("/queue")
def queue(status: str = Query(default="")):
    items = get_delivery_queue(status_filter=status or None)
    return {"events": items, "total": len(items)}


@router.get("/activity")
def activity():
    return get_activity()
