"""
Rate-limiting tests for the auth endpoints.

Each test uses a unique X-Forwarded-For IP so it gets its own clean bucket
and doesn't share state with other tests or with the session-scoped client.

Limits under test (defined in main.py):
  POST /api/auth/login   — 10 / 60 s
  GET  /api/auth/verify  — 60 / 60 s
  GET  /api/auth/auto    — 20 / 60 s

All non-auth endpoints are NOT rate-limited; this is confirmed by the last test.
"""
import pytest

CSRF = {"X-Requested-With": "XMLHttpRequest"}


# ── helpers ────────────────────────────────────────────────────────────────────

def _ip(n: int) -> dict:
    """Return an X-Forwarded-For header dict for a unique test IP."""
    return {"X-Forwarded-For": f"192.0.2.{n}"}   # 192.0.2.0/24 is TEST-NET-1


# ── login ──────────────────────────────────────────────────────────────────────

def test_login_allows_up_to_limit(client):
    """First 10 login attempts all return 200 or 401 — never 429."""
    headers = {**CSRF, **_ip(1)}
    for _ in range(10):
        resp = client.post("/api/auth/login", json={"password": "wrong"}, headers=headers)
        assert resp.status_code in (200, 401), f"Unexpected {resp.status_code} before limit"


def test_login_rate_limited_after_limit(client):
    """11th login attempt within the same window returns 429."""
    headers = {**CSRF, **_ip(2)}
    for _ in range(10):
        client.post("/api/auth/login", json={"password": "wrong"}, headers=headers)

    resp = client.post("/api/auth/login", json={"password": "wrong"}, headers=headers)
    assert resp.status_code == 429


def test_login_429_has_retry_after_header(client):
    """429 response includes a Retry-After header with a positive integer value."""
    headers = {**CSRF, **_ip(3)}
    for _ in range(10):
        client.post("/api/auth/login", json={"password": "wrong"}, headers=headers)

    resp = client.post("/api/auth/login", json={"password": "wrong"}, headers=headers)
    assert resp.status_code == 429
    assert "retry-after" in resp.headers
    assert int(resp.headers["retry-after"]) > 0


def test_login_different_ips_have_independent_buckets(client):
    """Exhausting the limit for one IP does not affect a different IP."""
    # Exhaust IP 10
    headers_10 = {**CSRF, **_ip(10)}
    for _ in range(10):
        client.post("/api/auth/login", json={"password": "wrong"}, headers=headers_10)
    assert client.post("/api/auth/login", json={"password": "wrong"}, headers=headers_10).status_code == 429

    # IP 11 should still be clean
    headers_11 = {**CSRF, **_ip(11)}
    resp = client.post("/api/auth/login", json={"password": "wrong"}, headers=headers_11)
    assert resp.status_code in (200, 401)


# ── verify ─────────────────────────────────────────────────────────────────────

def test_verify_rate_limited_after_limit(client):
    """61st verify call within the window returns 429."""
    headers = _ip(20)
    for _ in range(60):
        client.get("/api/auth/verify", headers=headers)

    resp = client.get("/api/auth/verify", headers=headers)
    assert resp.status_code == 429


# ── auto ───────────────────────────────────────────────────────────────────────

def test_auto_rate_limited_after_limit(client):
    """21st auto-login call within the window returns 429."""
    headers = _ip(30)
    for _ in range(20):
        client.get("/api/auth/auto", headers=headers)

    resp = client.get("/api/auth/auto", headers=headers)
    assert resp.status_code == 429


# ── non-auth endpoints are not rate-limited ────────────────────────────────────

def test_status_endpoint_not_rate_limited(client):
    """Rapid repeated calls to a non-auth endpoint never return 429."""
    headers = _ip(40)
    for _ in range(30):
        resp = client.get("/api/status", headers=headers)
        assert resp.status_code != 429, "Non-auth endpoint should not be rate-limited"
