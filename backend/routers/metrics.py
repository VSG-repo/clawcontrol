from fastapi import APIRouter, Depends
from auth import require_auth
from services.system_metrics import get_metrics

router = APIRouter()


@router.get("/api/metrics")
def system_metrics(_=Depends(require_auth)):
    return get_metrics()
