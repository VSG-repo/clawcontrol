"""
WAGZ Control Panel — FastAPI Backend
Phase 1: System Status & Health Monitoring
"""
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()


def _migrate_to_clawcontrol():
    """
    One-time migration: move ClawControl-specific keys ('heartbeat', 'dashboard')
    from ~/.openclaw/openclaw.json into ~/.openclaw/clawcontrol.json so OpenClaw
    doesn't flag them as unrecognised config.

    Skipped if clawcontrol.json already exists (migration already done).
    """
    openclaw_path    = Path.home() / ".openclaw" / "openclaw.json"
    clawcontrol_path = Path.home() / ".openclaw" / "clawcontrol.json"

    if clawcontrol_path.exists():
        return  # already migrated

    if not openclaw_path.exists():
        return  # nothing to migrate

    try:
        with openclaw_path.open("r", encoding="utf-8") as f:
            oc_data = json.load(f)
    except Exception:
        return

    if not isinstance(oc_data, dict):
        return

    if "heartbeat" not in oc_data and "dashboard" not in oc_data:
        return  # no ClawControl keys present — nothing to do

    cc_data = {}
    if "heartbeat" in oc_data:
        cc_data["heartbeat"] = oc_data.pop("heartbeat")
    if "dashboard" in oc_data:
        cc_data["dashboard"] = oc_data.pop("dashboard")

    try:
        # Write clawcontrol.json first
        clawcontrol_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = clawcontrol_path.with_suffix(".json.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(cc_data, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(clawcontrol_path)

        # Then write cleaned openclaw.json
        tmp = openclaw_path.with_suffix(".json.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(oc_data, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(openclaw_path)
    except Exception:
        pass  # don't crash startup on migration failure


_migrate_to_clawcontrol()

import asyncio
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth import verify_password, create_token, decode_token, require_auth, get_token_from_header
from services.rate_limiter import limiter as _rate_limiter
from ws_manager import connect, disconnect, live_data_loop
from services.probe import probe_loop
from services.credits import credits_loop

import routers.status as status_router
import routers.metrics as metrics_router
import routers.credits as credits_router
import routers.models as models_router
import routers.logs as logs_router
import routers.notifications as notifications_router
import routers.chat as chat_router
import routers.routing as routing_router
import routers.observe as observe_router
import routers.keys as keys_router
import routers.skills as skills_router
import routers.prompts as prompts_router
import routers.agents as agents_router
import routers.orders as orders_router
import routers.cron as cron_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background tasks
    tasks = [
        asyncio.create_task(live_data_loop()),
        asyncio.create_task(probe_loop()),
        asyncio.create_task(credits_loop()),
    ]
    yield
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="WAGZ Control Panel API", lifespan=lifespan)

# CORS — locked to frontend dev port + same-origin production
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    """
    Require X-Requested-With: XMLHttpRequest on all mutating requests.
    Exemptions:
      - GET / HEAD / OPTIONS (safe methods)
      - Localhost clients (already trusted by require_auth)
      - WebSocket upgrades
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return await call_next(request)

    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return await call_next(request)

    if request.headers.get("X-Requested-With") != "XMLHttpRequest":
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=403,
            content={"detail": "CSRF check failed: missing X-Requested-With header"},
        )

    return await call_next(request)

# Routers
app.include_router(status_router.router)
app.include_router(metrics_router.router)
app.include_router(credits_router.router)
app.include_router(models_router.router)
app.include_router(logs_router.router)
app.include_router(notifications_router.router)
app.include_router(chat_router.router)
app.include_router(routing_router.router)
app.include_router(observe_router.router)
app.include_router(keys_router.router)
app.include_router(skills_router.router)
app.include_router(prompts_router.router)
app.include_router(agents_router.router)
app.include_router(orders_router.router)
app.include_router(cron_router.router)


# ── Auth rate-limiting helpers ────────────────────────────────────────────────

def _client_ip(request: Request) -> str:
    """
    Return the IP address used as the rate-limit key.
    X-Forwarded-For is checked first so tests can inject a spoofed IP;
    in production the app is local-only so this header is never set externally.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate(request: Request, prefix: str, limit: int, window: int = 60) -> None:
    key = f"{prefix}:{_client_ip(request)}"
    allowed, retry_after = _rate_limiter.check(key, limit=limit, window=window)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests — please try again later.",
            headers={"Retry-After": str(retry_after)},
        )


# Auth endpoints
class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    # 10 attempts per minute per IP — strict enough to block brute-force
    _check_rate(request, "login", limit=10, window=60)
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_token({"sub": "wagz"})
    return {"token": token}


@app.get("/api/auth/verify")
async def verify(request: Request, token: str = Depends(get_token_from_header)):
    # 60 per minute — called automatically on every page load
    _check_rate(request, "verify", limit=60, window=60)
    if not token or not decode_token(token):
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"ok": True}


@app.get("/api/auth/auto")
async def auto_login(request: Request):
    """Return a token automatically for localhost connections (no password needed)."""
    # 20 per minute — called on startup / token refresh
    _check_rate(request, "auto", limit=20, window=60)
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Auto-login only available on localhost")
    token = create_token({"sub": "wagz"})
    return {"token": token}


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = None):
    # Auth check for WS
    from fastapi import Query
    # Token comes as query param: /ws?token=...
    # We need to extract it from query string
    token_val = ws.query_params.get("token")
    if not token_val or not decode_token(token_val):
        await ws.close(code=4001)
        return

    await connect(ws)
    try:
        while True:
            # Keep connection alive — client shouldn't need to send
            data = await ws.receive_text()
    except WebSocketDisconnect:
        disconnect(ws)
    except Exception:
        disconnect(ws)


@app.get("/health")
async def health():
    return {"status": "ok"}
