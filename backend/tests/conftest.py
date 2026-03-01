"""
Shared pytest fixtures for the WAGZ backend test suite.

Env vars are set BEFORE importing the app so that load_dotenv() (which never
overrides pre-existing env vars) and module-level os.getenv() calls in
auth.py / services all pick up the test values.
"""
import os

# Pin deterministic values before any app module is imported
os.environ.setdefault("WAGZ_PASSWORD",   "testpassword")
os.environ.setdefault("WAGZ_SECRET_KEY", "test-secret-key-for-tests")
os.environ.setdefault("OPENROUTER_API_KEY", "sk-or-fake-test-key")

import pytest
from fastapi.testclient import TestClient

from main import app      # noqa: E402  (must come after env setup)
from auth import create_token  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Synchronous TestClient whose requests appear from host 'testclient'
    (not localhost), so auth and CSRF middleware are fully enforced."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def auth_token():
    """A valid JWT for the test session, signed with the test secret key."""
    return create_token({"sub": "wagz"})


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    """Authorization header dict ready to merge into any request."""
    return {"Authorization": f"Bearer {auth_token}"}
