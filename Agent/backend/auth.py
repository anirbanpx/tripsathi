import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException, Header
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from jose import JWTError, jwt

_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "10080"))  # 7 days


def verify_google_token(token: str) -> dict:
    try:
        info = id_token.verify_oauth2_token(token, google_requests.Request(), _CLIENT_ID)
        return {
            "sub": info["sub"],
            "email": info["email"],
            "name": info.get("name", ""),
            "picture": info.get("picture", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"invalid_google_token: {e}")


def create_app_token(user_id: str, email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "email": email, "exp": exp}, _SECRET, algorithm="HS256")


def decode_app_token(token: str) -> dict:
    try:
        return jwt.decode(token, _SECRET, algorithms=["HS256"])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"invalid_token: {e}")


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_auth_header")
    return decode_app_token(authorization[len("Bearer "):])
