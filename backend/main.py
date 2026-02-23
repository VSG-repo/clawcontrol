"""
WAGZ Control Panel — FastAPI Backend
Phase 1: System Status & Health Monitoring
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import verify_password, create_token, decode_token, require_auth, get_token_from_header
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
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# Routers
app.include_router(status_router.router)
app.include_router(metrics_router.router)
app.include_router(credits_router.router)
app.include_router(models_router.router)
app.include_router(logs_router.router)
app.include_router(notifications_router.router)
app.include_router(chat_router.router)
app.include_router(routing_router.router)


# Auth endpoints
class LoginRequest(BaseModel):
    password: str


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_token({"sub": "wagz"})
    return {"token": token}


@app.get("/api/auth/verify")
async def verify(token: str = Depends(get_token_from_header)):
    if not token or not decode_token(token):
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"ok": True}


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
