from fastapi import APIRouter, Depends
from auth import require_auth
from services.models import get_model_stack

router = APIRouter()


@router.get("/api/models")
def models(_=Depends(require_auth)):
    stack = get_model_stack()
    primary = stack["primary"]
    return {
        "active": {
            "tier":        primary["tier"] if primary else None,
            "name":        primary["name"] if primary else None,
            "model_id":    primary["model_id"] if primary else None,
            "role":        primary["role"] if primary else None,
            "latency_p50": None,
            "latency_p95": None,
            "queue_depth": 0,
            "tps":         None,
        },
        "models": stack["models"],
    }
