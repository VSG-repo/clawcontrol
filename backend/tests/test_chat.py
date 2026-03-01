"""
Chat service unit tests.

The first five tests exercise _build_multimodal_content() directly — no HTTP,
no network, no fixtures required.

test_attachment_size_limit sends a >20 MB payload via the HTTP endpoint and
verifies that the streaming error event is emitted before any network call is
made (the size guard runs before the OpenRouter request).
"""
import base64
import json

import pytest

from services.chat import _build_multimodal_content


# ── helpers ──────────────────────────────────────────────────────────────────

def _data_uri(text: str, mime: str = "text/plain") -> str:
    """Return a base64 data-URI for the given text."""
    b64 = base64.b64encode(text.encode()).decode()
    return f"data:{mime};base64,{b64}"


# ── unit tests ────────────────────────────────────────────────────────────────

def test_build_multimodal_text_only():
    """No attachments → plain string unchanged."""
    result = _build_multimodal_content("hello world", [])
    assert result == "hello world"


def test_build_multimodal_image():
    """Image attachment → content array with an image_url part."""
    att = {
        "type": "image",
        "name": "photo.png",
        "data": "data:image/png;base64,abc123",
    }
    result = _build_multimodal_content("describe this", [att])

    assert isinstance(result, list), "Expected a content array for image attachments"
    types = {part["type"] for part in result}
    assert "image_url" in types
    text_parts = [p for p in result if p["type"] == "text"]
    assert text_parts, "Expected at least one text part"
    assert "describe this" in text_parts[0]["text"]


def test_build_multimodal_file():
    """Text-file attachment → plain string with file content prepended."""
    file_content = "line one\nline two\nline three"
    att = {
        "type": "file",
        "name": "notes.txt",
        "data": _data_uri(file_content),
    }
    result = _build_multimodal_content("check this file", [att])

    assert isinstance(result, str), "File-only attachments must return a plain string"
    assert "notes.txt" in result
    assert "line one" in result
    assert "check this file" in result


def test_build_multimodal_mixed():
    """Image + file → content array containing prepended file text and image_url."""
    file_att = {
        "type": "file",
        "name": "data.csv",
        "data": _data_uri("col1,col2\n1,2"),
    }
    img_att = {
        "type": "image",
        "name": "chart.jpg",
        "data": "data:image/jpeg;base64,imgdata==",
    }
    result = _build_multimodal_content("look at both", [file_att, img_att])

    assert isinstance(result, list)
    text_parts = [p for p in result if p["type"] == "text"]
    assert text_parts
    combined_text = text_parts[0]["text"]
    assert "col1,col2" in combined_text   # file content present
    assert "look at both" in combined_text  # original message present
    assert any(p["type"] == "image_url" for p in result)


def test_build_multimodal_binary_fallback():
    """Non-UTF-8 binary file → fallback note, no crash."""
    binary = bytes([0xFF, 0xFE, 0x00, 0x01])  # invalid UTF-8
    b64 = base64.b64encode(binary).decode()
    att = {
        "type": "file",
        "name": "dump.bin",
        "data": f"data:application/octet-stream;base64,{b64}",
    }
    result = _build_multimodal_content("analyse this", [att])

    assert isinstance(result, str)
    assert "dump.bin" in result
    assert "binary file, contents not shown" in result


# ── integration test ──────────────────────────────────────────────────────────

def test_attachment_size_limit(client, auth_headers):
    """
    Attachments exceeding 20 MB trigger a streaming error event.

    OPENROUTER_API_KEY is set to a fake value by conftest so the size check
    (which runs before any network call) is reached and emits the error.
    """
    from services.chat import _ATTACHMENT_SIZE_LIMIT

    # One byte over the limit
    big_data = "A" * (_ATTACHMENT_SIZE_LIMIT + 1)

    resp = client.post(
        "/api/chat/send",
        json={
            "message": "hi",
            "attachments": [{"type": "file", "name": "big.bin", "data": big_data}],
        },
        headers={**auth_headers, "X-Requested-With": "XMLHttpRequest"},
    )

    assert resp.status_code == 200  # StreamingResponse always returns 200

    # Parse SSE lines looking for the size-limit error event
    found_error = False
    for line in resp.text.splitlines():
        if line.startswith("data: "):
            try:
                event = json.loads(line[6:])
                if event.get("type") == "error" and "20 MB" in event.get("message", ""):
                    found_error = True
                    break
            except Exception:
                pass

    assert found_error, (
        "Expected a '20 MB size limit' error event in SSE stream. "
        f"Got: {resp.text[:300]}"
    )
