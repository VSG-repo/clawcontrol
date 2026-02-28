"""
Chat service — SSE streaming proxy to OpenClaw /v1/chat/completions.

Flow:
  1. Read gateway token + port from ~/.openclaw/openclaw.json
  2. POST to http://localhost:<port>/v1/chat/completions with streaming
  3. Yield SSE data lines: start | chunk | done | error events
  4. Detect failover: response.model != requested_model_id
  5. Estimate tokens from char count (OpenClaw returns usage:{0,0,0})
  6. Estimate cost from per-model rate table
"""
import base64
import json
import os
import time
import uuid
from typing import AsyncIterator, Optional

import httpx

OPENCLAW_CONFIG  = os.path.expanduser("~/.openclaw/openclaw.json")
OPENROUTER_URL   = "https://openrouter.ai/api/v1/chat/completions"

# USD per 1M tokens (input_rate, output_rate)
_MODEL_RATES: dict[str, tuple[float, float]] = {
    "openrouter/anthropic/claude-sonnet-4.6": (3.0, 15.0),
    "openrouter/anthropic/claude-opus-4.6":   (15.0, 75.0),
    "openrouter/openai/gpt-4o":               (2.5, 10.0),
    "xai/grok-4":                              (3.0, 15.0),
    # Default for unknown / internal models
    "__default__": (0.5, 1.5),
}


def _load_openrouter_key() -> str:
    """Read OPENROUTER_API_KEY from backend/.env (already loaded by dotenv at startup)."""
    return os.environ.get("OPENROUTER_API_KEY", "")


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _estimate_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    rates = _MODEL_RATES.get(model_id, _MODEL_RATES["__default__"])
    return (prompt_tokens / 1_000_000) * rates[0] + (completion_tokens / 1_000_000) * rates[1]


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


_TEXT_MIME_TYPES = {"text/plain", "text/csv", "text/markdown", "text/html",
                    "application/json", "application/xml", "text/xml"}
_TEXT_EXTENSIONS = {".txt", ".csv", ".md", ".markdown", ".json", ".xml", ".html", ".htm", ".log"}

_ATTACHMENT_SIZE_LIMIT = 20 * 1024 * 1024  # 20 MB of base64 characters


def _build_multimodal_content(text: str, attachments: list[dict]) -> list[dict]:
    """
    Convert a plain-text user message + attachments into the OpenAI vision
    content array format.  Text files are inlined into the text part;
    images become image_url parts.
    """
    text_prefix = ""
    image_parts: list[dict] = []

    for att in attachments:
        att_type = att.get("type", "")
        name = att.get("name", "file")
        raw = att.get("data", "")
        mime = att.get("mime", "")

        if att_type == "image":
            image_parts.append({"type": "image_url", "image_url": {"url": raw}})
        else:
            # Determine whether this file can be inlined as text
            ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
            is_text = mime in _TEXT_MIME_TYPES or ext in _TEXT_EXTENSIONS
            if is_text:
                try:
                    # Strip data-URI prefix if present (e.g. "data:text/csv;base64,...")
                    payload = raw.split(",", 1)[1] if "," in raw else raw
                    decoded = base64.b64decode(payload).decode("utf-8", errors="replace")
                    text_prefix += f"[Attached file: {name}]\n{decoded}\n\n"
                except Exception:
                    text_prefix += f"[Attached file: {name} — could not decode]\n\n"
            else:
                text_prefix += f"[Attached file: {name} (binary, not inlined)]\n\n"

    content: list[dict] = [{"type": "text", "text": text_prefix + text}]
    content.extend(image_parts)
    return content


async def stream_chat(
    messages: list[dict],
    model_id: Optional[str],
    request_id: str,
    attachments: Optional[list[dict]] = None,
) -> AsyncIterator[str]:
    """
    Async generator yielding SSE-formatted strings.
    Events: start, chunk, done, error.
    """
    api_key = _load_openrouter_key()
    if not api_key:
        yield _sse({"type": "error", "message": "OPENROUTER_API_KEY is not set in backend/.env"})
        return

    requested_model_id = model_id or "openrouter/openai/gpt-oss-20b"

    # OpenRouter model IDs don't include the "openrouter/" namespace prefix
    openrouter_model_id = requested_model_id.removeprefix("openrouter/")

    # ── Attachment processing ─────────────────────────────────────────────────
    if attachments:
        # Size guard: sum of base64 character lengths
        total_b64_size = sum(len(a.get("data", "")) for a in attachments)
        if total_b64_size > _ATTACHMENT_SIZE_LIMIT:
            yield _sse({"type": "error", "message": "Attachments exceed the 20 MB size limit"})
            return

        # Rebuild messages with multimodal content on the last user turn
        messages = list(messages)  # work on a copy
        for i in range(len(messages) - 1, -1, -1):
            if messages[i]["role"] == "user" and isinstance(messages[i].get("content"), str):
                messages[i] = {
                    **messages[i],
                    "content": _build_multimodal_content(messages[i]["content"], attachments),
                }
                break

    body = {
        "model": openrouter_model_id,
        "messages": messages,
        "stream": True,
    }

    # Estimate prompt tokens from input messages
    prompt_text = " ".join(
        m.get("content", "") for m in messages if isinstance(m.get("content"), str)
    )
    prompt_tokens = _estimate_tokens(prompt_text)

    start_time = time.monotonic()
    full_text = ""
    response_model_id: Optional[str] = None
    failover: bool = False
    failover_from: Optional[str] = None
    finish_reason: Optional[str] = None
    chat_id: Optional[str] = None
    first_chunk = True

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=5.0)
        ) as client:
            async with client.stream(
                "POST",
                OPENROUTER_URL,
                json=body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "ClawControl",
                },
            ) as resp:
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    yield _sse({
                        "type": "error",
                        "message": f"Gateway returned HTTP {resp.status_code}",
                        "detail": err_body.decode(errors="replace")[:300],
                    })
                    return

                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        chunk = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    if first_chunk:
                        first_chunk = False
                        chat_id = chunk.get("id", request_id)
                        # OpenClaw echoes back the model that actually handled the request
                        response_model_id = chunk.get("model") or requested_model_id

                        failover = (
                            bool(response_model_id)
                            and response_model_id != openrouter_model_id
                        )
                        failover_from = requested_model_id if failover else None

                        yield _sse({
                            "type": "start",
                            "id": chat_id,
                            "request_id": request_id,
                            "model_id": response_model_id,
                            "model": response_model_id.split("/")[-1],
                            "requested_model_id": requested_model_id,
                            "failover": failover,
                            "failover_from": failover_from,
                        })

                    for choice in chunk.get("choices", []):
                        delta = choice.get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            full_text += text
                            yield _sse({"type": "chunk", "id": chat_id, "delta": text})
                        fr = choice.get("finish_reason")
                        if fr:
                            finish_reason = fr

    except httpx.ConnectError:
        yield _sse({"type": "error", "message": "Cannot connect to OpenClaw gateway — is it running?"})
        return
    except httpx.TimeoutException:
        yield _sse({"type": "error", "message": "Gateway request timed out after 120s"})
        return
    except Exception as exc:
        yield _sse({"type": "error", "message": str(exc)})
        return

    # Done event — emitted after the stream closes cleanly
    latency_ms = int((time.monotonic() - start_time) * 1000)
    completion_tokens = _estimate_tokens(full_text)
    cost = _estimate_cost(
        response_model_id or requested_model_id,
        prompt_tokens,
        completion_tokens,
    )

    yield _sse({
        "type": "done",
        "id": chat_id or request_id,
        "request_id": request_id,
        "model_id": response_model_id or requested_model_id,
        "failover": failover,
        "failover_from": failover_from,
        "finish_reason": finish_reason or "stop",
        "token_estimate": prompt_tokens + completion_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_estimate_usd": round(cost, 8),
        "latency_ms": latency_ms,
    })
