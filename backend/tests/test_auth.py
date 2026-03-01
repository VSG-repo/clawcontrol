"""
Auth endpoint tests.

TestClient host is "testclient" (not localhost), so:
  - require_auth enforces token checking on all requests.
  - /api/auth/auto returns 403 (localhost-only endpoint).

test_localhost_auto_auth uses an ASGI wrapper that spoofs scope["client"]
to ("127.0.0.1", 50000) so the localhost-only auto-login path is exercised.
"""
import pytest
from fastapi.testclient import TestClient

CSRF = {"X-Requested-With": "XMLHttpRequest"}


def test_login_returns_jwt(client):
    """Valid credentials → 200 with a token string."""
    resp = client.post(
        "/api/auth/login",
        json={"password": "testpassword"},
        headers=CSRF,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert isinstance(data["token"], str) and len(data["token"]) > 20


def test_login_rejects_bad_password(client):
    """Wrong password → 401."""
    resp = client.post(
        "/api/auth/login",
        json={"password": "wrongpassword"},
        headers=CSRF,
    )
    assert resp.status_code == 401


def test_require_auth_rejects_no_token(client):
    """GET /api/status without a token → 401 (TestClient is not localhost)."""
    resp = client.get("/api/status")
    assert resp.status_code == 401


def test_require_auth_accepts_valid_token(client, auth_headers):
    """GET /api/status with a valid Bearer token → 200."""
    resp = client.get("/api/status", headers=auth_headers)
    assert resp.status_code == 200


def test_localhost_auto_auth():
    """GET /api/auth/auto from 127.0.0.1 → 200 with a token."""
    from main import app as wagz_app

    class _LocalhostWrapper:
        """ASGI middleware that overrides scope['client'] to appear as localhost."""
        def __init__(self, inner):
            self._inner = inner

        async def __call__(self, scope, receive, send):
            if scope.get("type") in ("http", "websocket"):
                scope = {**scope, "client": ("127.0.0.1", 50000)}
            await self._inner(scope, receive, send)

    with TestClient(_LocalhostWrapper(wagz_app), raise_server_exceptions=False) as c:
        resp = c.get("/api/auth/auto")

    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert isinstance(data["token"], str) and len(data["token"]) > 20
