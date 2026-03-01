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

# Vision-capable models (checked against stripped openrouter_model_id, i.e. no "openrouter/" prefix)
VISION_MODELS: frozenset = frozenset({
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
    "google/gemini-2.5-pro-preview-06-05",
    "anthropic/claude-sonnet-4-20250514",
    "anthropic/claude-opus-4-20250115",
    "auto",          # openrouter/auto — routes to a capable model automatically
})

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


_ATTACHMENT_SIZE_LIMIT = 20 * 1024 * 1024  # 20 MB of base64 characters

_CLAWCONTROL_CONFIG = os.path.expanduser("~/.openclaw/clawcontrol.json")

_CODE_KEYWORDS: frozenset[str] = frozenset({
    "def ", "function ", "class ", "import ", "const ", "let ", "var ",
    "return ", "SELECT ", "FROM ", "WHERE ",
})


def _load_intent_routing() -> dict:
    """Read intent_routing from clawcontrol.json. Returns disabled config on any error."""
    try:
        with open(_CLAWCONTROL_CONFIG, "r", encoding="utf-8") as f:
            data = json.load(f)
        ir = data.get("intent_routing", {})
        return ir if isinstance(ir, dict) else {}
    except Exception:
        return {}


def _classify_intent(messages: list[dict], has_images: bool) -> Optional[str]:
    """
    Rule-based intent classifier. Returns a rule id or None if no rule matches.
    Priority: has_image > has_code > short_routine.
    """
    if has_images:
        return "has_image"

    # Extract last user message text for code detection
    last_user_text = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            last_user_text = content if isinstance(content, str) else ""
            break

    if "```" in last_user_text or any(kw in last_user_text for kw in _CODE_KEYWORDS):
        return "has_code"

    # Token estimate across full conversation for routine detection
    all_text = " ".join(
        m.get("content", "") for m in messages if isinstance(m.get("content"), str)
    )
    if _estimate_tokens(all_text) < 200:
        return "short_routine"

    return None


def _build_multimodal_content(text: str, attachments: list[dict]):
    """
    Convert a plain-text user message + attachments into message content.
    - Text/decodable files: base64-decoded and prepended as text.
    - Images: added as image_url content parts.
    - Returns a plain str when there are no image attachments (model compatibility).
    - Returns a content array (list[dict]) only when image_url parts are present.
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
            # Strip data-URI prefix before decoding (e.g. "data:text/plain;base64,...")
            payload = raw.split(",", 1)[1] if "," in raw else raw
            try:
                decoded_bytes = base64.b64decode(payload)
                decoded = decoded_bytes.decode("utf-8")
                text_prefix += f"The user attached a file named '{name}' with the following contents:\n---\n{decoded}\n---\n\n"
            except UnicodeDecodeError:
                text_prefix += f"[Attached file: {name} — binary file, contents not shown]\n\n"
            except Exception:
                text_prefix += f"[Attached file: {name} — binary file, contents not shown]\n\n"

    full_text = text_prefix + text

    # Only use content array format when there are actual image attachments.
    # Plain string keeps compatibility with non-vision models.
    if not image_parts:
        return full_text

    content: list[dict] = [{"type": "text", "text": full_text}]
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

    # ── Intent-aware routing ──────────────────────────────────────────────────
    has_images = bool(attachments and any(a.get("type") == "image" for a in attachments))
    intent_routed: bool = False
    intent_rule_id: Optional[str] = None

    _ir = _load_intent_routing()
    if _ir.get("enabled"):
        _rule_id = _classify_intent(messages, has_images)
        if _rule_id is not None:
            _rule_map = {r["id"]: r for r in _ir.get("rules", []) if isinstance(r, dict)}
            _matched = _rule_map.get(_rule_id)
            if _matched and _matched.get("target_model", "").strip():
                intent_routed = True
                intent_rule_id = _rule_id
                requested_model_id = _matched["target_model"]
                openrouter_model_id = requested_model_id.removeprefix("openrouter/")

    # ── Vision model routing ──────────────────────────────────────────────────
    auto_switched: bool = False
    auto_switched_from: Optional[str] = None

    if has_images and openrouter_model_id not in VISION_MODELS:
        # Current model doesn't support vision — find a configured vision model
        from services.models import get_model_stack
        stack = get_model_stack()
        vision_candidate: Optional[str] = None
        for m in stack["models"]:
            stripped = m["model_id"].removeprefix("openrouter/")
            if stripped in VISION_MODELS:
                vision_candidate = m["model_id"]
                break

        if vision_candidate is None:
            yield _sse({
                "type": "error",
                "message": (
                    "This model doesn't support images. Add a vision-capable model "
                    "(e.g. gpt-4o, gemini-2.0-flash) in your routing config, or use 'auto'."
                ),
            })
            return

        auto_switched = True
        auto_switched_from = requested_model_id
        requested_model_id = vision_candidate
        openrouter_model_id = vision_candidate.removeprefix("openrouter/")

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
                    err_text = err_body.decode(errors="replace")
                    yield _sse({
                        "type": "error",
                        "message": f"Gateway returned HTTP {resp.status_code}",
                        "detail": err_text[:300],
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
                            "auto_switched": auto_switched,
                            "auto_switched_from": auto_switched_from,
                            "intent_routed": intent_routed,
                            "intent_rule_id": intent_rule_id,
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
