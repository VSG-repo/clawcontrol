"""
Chat router.
  POST   /api/chat/send      — SSE stream for a chat turn
  GET    /api/chat/history   — conversation history for a context_id
  DELETE /api/chat/history   — clear a conversation
  GET    /api/chat/models    — available models from openclaw.json
"""
import json
import uuid
from typing import Optional, Dict, List

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import require_auth
from services.chat import stream_chat

router = APIRouter()

# In-memory store: context_id → [message dicts]
_conversations: Dict[str, List[dict]] = {}


class SendRequest(BaseModel):
    message: str
    context_id: Optional[str] = None
    model_id: Optional[str] = None  # None = gateway picks primary
    new_thread: bool = False


@router.post("/api/chat/send")
async def chat_send(req: SendRequest, _=Depends(require_auth)):
    context_id = req.context_id or str(uuid.uuid4())

    if req.new_thread or context_id not in _conversations:
        _conversations[context_id] = []

    history = _conversations[context_id]
    # Append user message before streaming
    history.append({"role": "user", "content": req.message})
    request_id = str(uuid.uuid4())

    async def generate():
        assistant_content = ""
        done_received = False

        async for event_str in stream_chat(
            messages=list(history),
            model_id=req.model_id,
            request_id=request_id,
        ):
            # Track assistant content for history storage
            if event_str.startswith("data: "):
                try:
                    d = json.loads(event_str[6:].strip())
                    if d.get("type") == "chunk":
                        assistant_content += d.get("delta", "")
                    elif d.get("type") == "done":
                        done_received = True
                except Exception:
                    pass
            yield event_str

        # Store assistant response in history after stream completes
        if done_received and assistant_content:
            history.append({"role": "assistant", "content": assistant_content})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "X-Context-Id": context_id,
            "X-Request-Id": request_id,
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/api/chat/history")
def chat_history(context_id: str, _=Depends(require_auth)):
    return {
        "context_id": context_id,
        "messages": _conversations.get(context_id, []),
    }


@router.delete("/api/chat/history")
def chat_clear(context_id: str, _=Depends(require_auth)):
    _conversations.pop(context_id, None)
    return {"ok": True}


@router.get("/api/chat/models")
def chat_models(_=Depends(require_auth)):
    from services.models import get_model_stack
    stack = get_model_stack()
    return {"models": stack["models"], "primary": stack.get("primary")}
