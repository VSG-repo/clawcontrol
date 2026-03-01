"""
CSRF middleware tests.

The middleware (in main.py) rules:
  - GET / HEAD / OPTIONS: always pass through.
  - Localhost clients (127.0.0.1, ::1): exempt.
  - All other mutations without X-Requested-With: XMLHttpRequest → 403.

TestClient reports host "testclient" so localhost exemption does NOT apply,
giving us clean coverage of the CSRF enforcement path.
"""


def test_post_without_csrf_header_rejected(client):
    """POST from non-localhost without X-Requested-With → 403 CSRF error."""
    resp = client.post("/api/chat/send", json={"message": "hi"})
    assert resp.status_code == 403
    assert "CSRF" in resp.json().get("detail", "")


def test_post_with_csrf_header_accepted(client, auth_headers):
    """POST with the X-Requested-With header is not rejected for CSRF.

    The response may be 200 (SSE stream) or something else if the endpoint
    has its own error, but it must NOT be a 403 CSRF rejection.
    """
    resp = client.post(
        "/api/chat/send",
        json={"message": "hi"},
        headers={**auth_headers, "X-Requested-With": "XMLHttpRequest"},
    )
    assert resp.status_code != 403


def test_get_without_csrf_header_allowed(client):
    """GET requests pass CSRF check regardless of headers.

    Without auth the endpoint returns 401, but CSRF (403) must not trigger.
    """
    resp = client.get("/api/status")
    assert resp.status_code == 401   # auth rejected, not CSRF
    assert resp.status_code != 403
