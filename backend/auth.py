"""
Auth: simple password → JWT token flow.
Token is passed as Bearer in Authorization header or ?token= query param for WS.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = os.getenv("WAGZ_SECRET_KEY", "changeme-set-in-env")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def get_password() -> str:
    return os.getenv("WAGZ_PASSWORD", "wagz")


def verify_password(plain: str) -> bool:
    stored = get_password()
    # Simple plaintext compare for a local system PIN
    return plain == stored


def create_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload["exp"] = expire
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_token_from_header(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    token_query: Optional[str] = Query(default=None, alias="token"),
) -> Optional[str]:
    if credentials:
        return credentials.credentials
    return token_query


def require_auth(request: Request, token: Optional[str] = Depends(get_token_from_header)):
    # Localhost connections bypass auth — only the local machine can reach 127.0.0.1:8000
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return {"sub": "wagz", "localhost": True}
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return payload
