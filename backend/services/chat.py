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
import json
import os
import time
import uuid
from typing import AsyncIterator, Optional

import httpx

OPENCLAW_CONFIG = os.path.expanduser("~/.openclaw/openclaw.json")

# USD per 1M tokens (input_rate, output_rate)
_MODEL_RATES: dict[str, tuple[float, float]] = {
    "openrouter/anthropic/claude-sonnet-4.6": (3.0, 15.0),
    "openrouter/anthropic/claude-opus-4.6":   (15.0, 75.0),
    "openrouter/openai/gpt-4o":               (2.5, 10.0),
    "xai/grok-4":                              (3.0, 15.0),
    # Default for unknown / internal models
    "__default__": (0.5, 1.5),
}


def _load_gateway_config() -> tuple[int, str]:
    try:
        with open(OPENCLAW_CONFIG, "r") as f:
            config = json.load(f)
        gw = config.get("gateway", {})
        port = gw.get("port", 18789)
        token = gw.get("auth", {}).get("token", "")
        return port, token
    except Exception:
        return 18789, ""


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _estimate_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    rates = _MODEL_RATES.get(model_id, _MODEL_RATES["__default__"])
    return (prompt_tokens / 1_000_000) * rates[0] + (completion_tokens / 1_000_000) * rates[1]


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def stream_chat(
    messages: list[dict],
    model_id: Optional[str],
    request_id: str,
) -> AsyncIterator[str]:
    """
    Async generator yielding SSE-formatted strings.
    Events: start, chunk, done, error.
    """
    port, token = _load_gateway_config()
    url = f"http://localhost:{port}/v1/chat/completions"

    requested_model_id = model_id or "openrouter/openai/gpt-oss-20b"

    body = {
        "model": requested_model_id,
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
                url,
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
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
                            and response_model_id != requested_model_id
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
