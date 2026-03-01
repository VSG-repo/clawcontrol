from fastapi import APIRouter, Depends, Query
from auth import require_auth
from services.logs import get_logs

router = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])


@router.get("/logs")
async def logs(
    level: str = Query(default="ALL"),
    search: str = Query(default=""),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    since: str = Query(default=""),
    sources: str = Query(default="gateway,audit"),
):
    return get_logs(
        limit=limit,
        offset=offset,
        level=level if level not in ("ALL", "") else None,
        search=search or None,
        since_iso=since or None,
        sources=sources,
    )
