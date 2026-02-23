from fastapi import APIRouter, Depends, Query
from auth import require_auth
from services.logs import get_logs

router = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])


@router.get("/logs")
async def logs(
    level: str = Query(default="ALL"),
    search: str = Query(default=""),
    limit: int = Query(default=500, le=2000),
    since: str = Query(default=""),
    sources: str = Query(default="gateway,audit"),
):
    entries = get_logs(
        limit=limit,
        level=level if level not in ("ALL", "") else None,
        search=search or None,
        since_iso=since or None,
        sources=sources,
    )
    return {"logs": entries, "total": len(entries)}
