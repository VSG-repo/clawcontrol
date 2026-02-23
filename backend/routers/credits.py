from fastapi import APIRouter, Depends
from auth import require_auth
from services.credits import get_credits_state

router = APIRouter()


@router.get("/api/credits")
def credits(_=Depends(require_auth)):
    return get_credits_state()


@router.get("/api/costs")
def costs(_=Depends(require_auth)):
    state = get_credits_state()
    return {
        "cost_per_model": state["cost_per_model"],
        "token_usage_today": state["token_usage_today"],
        "burn_1h": state["burn_1h"],
        "burn_24h": state["burn_24h"],
    }


@router.get("/api/errors")
def error_codes(_=Depends(require_auth)):
    state = get_credits_state()
    return state["errors"]
