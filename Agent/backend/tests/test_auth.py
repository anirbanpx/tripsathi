"""
Unit tests for auth.py — JWT create/decode, get_current_user guard.

Run:
    pytest tests/test_auth.py -v -m unit
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _set_jwt_secret(monkeypatch):
    """Use a fixed secret so tests are deterministic."""
    monkeypatch.setenv("JWT_SECRET", "test-secret-for-unit-tests")
    import auth
    monkeypatch.setattr(auth, "_SECRET", "test-secret-for-unit-tests")


# ---------------------------------------------------------------------------
# create_app_token / decode_app_token
# ---------------------------------------------------------------------------

class TestJwtRoundtrip:

    @pytest.mark.unit
    def test_roundtrip_returns_expected_claims(self):
        from auth import create_app_token, decode_app_token
        token = create_app_token("usr_abc123", "user@example.com")
        payload = decode_app_token(token)
        assert payload["sub"] == "usr_abc123"
        assert payload["email"] == "user@example.com"

    @pytest.mark.unit
    def test_token_is_string(self):
        from auth import create_app_token
        token = create_app_token("usr_xyz", "a@b.com")
        assert isinstance(token, str)
        assert len(token) > 20

    @pytest.mark.unit
    def test_invalid_token_raises_401(self):
        from auth import decode_app_token
        with pytest.raises(HTTPException) as exc_info:
            decode_app_token("not.a.valid.token")
        assert exc_info.value.status_code == 401

    @pytest.mark.unit
    def test_tampered_token_raises_401(self):
        from auth import create_app_token, decode_app_token
        token = create_app_token("usr_abc", "x@y.com")
        tampered = token[:-4] + "XXXX"
        with pytest.raises(HTTPException) as exc_info:
            decode_app_token(tampered)
        assert exc_info.value.status_code == 401

    @pytest.mark.unit
    def test_expired_token_raises_401(self, monkeypatch):
        from jose import jwt as jose_jwt
        import auth
        past_exp = datetime.now(timezone.utc) - timedelta(minutes=1)
        expired_token = jose_jwt.encode(
            {"sub": "usr_x", "email": "x@y.com", "exp": past_exp},
            "test-secret-for-unit-tests",
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc_info:
            auth.decode_app_token(expired_token)
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# get_current_user
# ---------------------------------------------------------------------------

class TestGetCurrentUser:

    @pytest.mark.unit
    def test_missing_header_raises_401(self):
        from auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(authorization=None)
        assert exc_info.value.status_code == 401
        assert "missing_auth_header" in exc_info.value.detail

    @pytest.mark.unit
    def test_wrong_scheme_raises_401(self):
        from auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(authorization="Basic abc123")
        assert exc_info.value.status_code == 401

    @pytest.mark.unit
    def test_valid_bearer_returns_user_dict(self):
        from auth import create_app_token, get_current_user
        token = create_app_token("usr_good", "good@example.com")
        result = get_current_user(authorization=f"Bearer {token}")
        assert result["sub"] == "usr_good"
        assert result["email"] == "good@example.com"

    @pytest.mark.unit
    def test_invalid_bearer_token_raises_401(self):
        from auth import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(authorization="Bearer invalid.token.here")
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# verify_google_token
# ---------------------------------------------------------------------------

class TestVerifyGoogleToken:

    @pytest.mark.unit
    def test_invalid_google_token_raises_401(self):
        from auth import verify_google_token
        with pytest.raises(HTTPException) as exc_info:
            verify_google_token("not-a-real-google-token")
        assert exc_info.value.status_code == 401
        assert "invalid_google_token" in exc_info.value.detail

    @pytest.mark.unit
    def test_valid_google_token_returns_user_fields(self):
        from auth import verify_google_token
        fake_info = {
            "sub": "google_sub_123",
            "email": "real@gmail.com",
            "name": "Real User",
            "picture": "https://example.com/avatar.jpg",
        }
        with patch("auth.id_token.verify_oauth2_token", return_value=fake_info):
            result = verify_google_token("fake-valid-token")
        assert result["sub"] == "google_sub_123"
        assert result["email"] == "real@gmail.com"
        assert result["name"] == "Real User"
        assert result["picture"] == "https://example.com/avatar.jpg"
