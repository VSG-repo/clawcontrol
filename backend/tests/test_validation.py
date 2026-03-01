"""
Input validation tests.

All mutations require X-Requested-With (CSRF) and Authorization (auth).
The TestClient host is "testclient" so both middleware layers are active.

422 Unprocessable Entity is Pydantic/FastAPI's response for failed field validation.
"""
import pytest

CSRF = {"X-Requested-With": "XMLHttpRequest"}


# ── helpers ────────────────────────────────────────────────────────────────────

def post(client, url, body, auth_headers):
    return client.post(url, json=body, headers={**auth_headers, **CSRF})


def put(client, url, body, auth_headers):
    return client.put(url, json=body, headers={**auth_headers, **CSRF})


# ── auth / login ──────────────────────────────────────────────────────────────

def test_login_password_too_long(client):
    """Password exceeding 128 chars → 422."""
    resp = client.post(
        "/api/auth/login",
        json={"password": "x" * 129},
        headers=CSRF,
    )
    assert resp.status_code == 422


def test_login_empty_password(client):
    """Empty password string → 422."""
    resp = client.post("/api/auth/login", json={"password": ""}, headers=CSRF)
    assert resp.status_code == 422


# ── chat ──────────────────────────────────────────────────────────────────────

def test_chat_message_too_long(client, auth_headers):
    """Message exceeding 32 000 chars → 422."""
    resp = post(client, "/api/chat/send", {"message": "x" * 32_001}, auth_headers)
    assert resp.status_code == 422


def test_chat_context_id_bad_format(client, auth_headers):
    """context_id that is not a valid UUID → 422."""
    resp = post(client, "/api/chat/send",
                {"message": "hi", "context_id": "not-a-uuid"}, auth_headers)
    assert resp.status_code == 422


def test_chat_too_many_attachments(client, auth_headers):
    """More than 10 attachments → 422."""
    att = {"type": "file", "name": "f.txt", "data": "data:text/plain;base64,aGk="}
    resp = post(client, "/api/chat/send",
                {"message": "hi", "attachments": [att] * 11}, auth_headers)
    assert resp.status_code == 422


def test_chat_attachment_bad_type(client, auth_headers):
    """Attachment type not in Literal['image','file'] → 422."""
    att = {"type": "video", "name": "clip.mp4", "data": "data:video/mp4;base64,aGk="}
    resp = post(client, "/api/chat/send",
                {"message": "hi", "attachments": [att]}, auth_headers)
    assert resp.status_code == 422


def test_chat_attachment_empty_name(client, auth_headers):
    """Attachment with empty name → 422."""
    att = {"type": "file", "name": "", "data": "data:text/plain;base64,aGk="}
    resp = post(client, "/api/chat/send",
                {"message": "hi", "attachments": [att]}, auth_headers)
    assert resp.status_code == 422


# ── cron ─────────────────────────────────────────────────────────────────────

def test_cron_schedule_shell_injection(client, auth_headers):
    """Cron schedule with shell metacharacters → 422."""
    body = {
        "name": "job", "agentId": "a1",
        "schedule": "* * * * *; rm -rf /",
        "directive": "do stuff",
    }
    resp = post(client, "/api/cron", body, auth_headers)
    assert resp.status_code == 422


def test_cron_schedule_too_few_fields(client, auth_headers):
    """Cron schedule with only 3 fields → 422."""
    body = {
        "name": "job", "agentId": "a1",
        "schedule": "* * *",
        "directive": "do stuff",
    }
    resp = post(client, "/api/cron", body, auth_headers)
    assert resp.status_code == 422


def test_cron_schedule_valid_macro(client, auth_headers):
    """@daily is a valid cron macro — validation must not reject it (→ not 422)."""
    body = {
        "name": "daily-job", "agentId": "a1",
        "schedule": "@daily",
        "directive": "run daily task",
    }
    resp = post(client, "/api/cron", body, auth_headers)
    assert resp.status_code != 422


def test_cron_schedule_unknown_macro(client, auth_headers):
    """Unknown @ macro → 422."""
    body = {
        "name": "job", "agentId": "a1",
        "schedule": "@every5min",
        "directive": "do stuff",
    }
    resp = post(client, "/api/cron", body, auth_headers)
    assert resp.status_code == 422


def test_cron_directive_too_long(client, auth_headers):
    """Directive exceeding 16 000 chars → 422."""
    body = {
        "name": "job", "agentId": "a1",
        "schedule": "* * * * *",
        "directive": "x" * 16_001,
    }
    resp = post(client, "/api/cron", body, auth_headers)
    assert resp.status_code == 422


# ── agents ────────────────────────────────────────────────────────────────────

def test_agent_status_invalid(client, auth_headers):
    """status not in Literal['idle','running','error','stopped'] → 422."""
    body = {"name": "MyAgent", "model": "gpt-4o", "status": "unknown"}
    resp = post(client, "/api/agents", body, auth_headers)
    assert resp.status_code == 422


def test_agent_name_too_long(client, auth_headers):
    """Agent name exceeding 100 chars → 422."""
    body = {"name": "x" * 101, "model": "gpt-4o"}
    resp = post(client, "/api/agents", body, auth_headers)
    assert resp.status_code == 422


def test_agent_system_prompt_too_long(client, auth_headers):
    """systemPrompt exceeding 16 000 chars → 422."""
    body = {"name": "Agent", "model": "gpt-4o", "systemPrompt": "x" * 16_001}
    resp = post(client, "/api/agents", body, auth_headers)
    assert resp.status_code == 422


# ── notifications ─────────────────────────────────────────────────────────────

def test_notifications_credit_floor_negative(client, auth_headers):
    """credit_floor below 0 → 422."""
    resp = post(client, "/api/notifications/settings",
                {"credit_floor": -1.0}, auth_headers)
    assert resp.status_code == 422


def test_notifications_cpu_temp_too_high(client, auth_headers):
    """cpu_temp_threshold above 200°C → 422."""
    resp = post(client, "/api/notifications/settings",
                {"cpu_temp_threshold": 201.0}, auth_headers)
    assert resp.status_code == 422


def test_notifications_probe_failures_zero(client, auth_headers):
    """probe_failures=0 is below ge=1 → 422."""
    resp = post(client, "/api/notifications/settings",
                {"probe_failures": 0}, auth_headers)
    assert resp.status_code == 422


# ── orders ────────────────────────────────────────────────────────────────────

def test_order_directive_too_long(client, auth_headers):
    """Directive exceeding 16 000 chars → 422."""
    body = {"agentId": "a1", "agentName": "Agent", "directive": "x" * 16_001}
    resp = post(client, "/api/orders", body, auth_headers)
    assert resp.status_code == 422


def test_order_agent_name_too_long(client, auth_headers):
    """agentName exceeding 100 chars → 422."""
    body = {"agentId": "a1", "agentName": "x" * 101, "directive": "do it"}
    resp = post(client, "/api/orders", body, auth_headers)
    assert resp.status_code == 422


# ── logs query params ─────────────────────────────────────────────────────────

def test_logs_search_too_long(client, auth_headers):
    """search param exceeding 200 chars → 422."""
    resp = client.get(
        f"/api/logs?search={'x' * 201}",
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ── prompts / templates ───────────────────────────────────────────────────────

def test_prompt_content_too_long(client, auth_headers):
    """Prompt content exceeding 64 000 chars → 422."""
    resp = post(client, "/api/prompts",
                {"title": "T", "content": "x" * 64_001}, auth_headers)
    assert resp.status_code == 422


def test_prompt_send_too_many_variables(client, auth_headers, monkeypatch):
    """More than 50 variables in PromptSend → 422.

    We monkeypatch the prompts data so an ID exists to avoid a 404 short-circuit.
    """
    import routers.prompts as pr
    fake_id = "00000000-0000-0000-0000-000000000001"
    monkeypatch.setattr(
        pr, "_load_data",
        lambda: {"prompts": [{"id": fake_id, "content": "{{x}}"}], "templates": []}
    )
    big_vars = {f"var{i}": "val" for i in range(51)}
    resp = post(client, f"/api/prompts/{fake_id}/send", {"variables": big_vars}, auth_headers)
    assert resp.status_code == 422


def test_template_type_invalid(client, auth_headers):
    """template_type not in Literal → 422."""
    resp = post(client, "/api/templates",
                {"title": "T", "content": "c", "template_type": "unknown_type"}, auth_headers)
    assert resp.status_code == 422
