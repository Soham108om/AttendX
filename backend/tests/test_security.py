from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import app.core.security as security
from app.core.config import settings


STATIC_ROLE_TOKENS = (
    "test-admin-token",
    "test-faculty-token",
    "test-student-token",
)
APPLICATION_ENVIRONMENTS = (
    "development",
    "staging",
    "production",
    "test",
    "custom",
)


class FakeProfileQuery:
    def select(self, *args):
        return self

    def eq(self, *args):
        return self

    def single(self):
        return self

    def execute(self):
        return SimpleNamespace(
            data={"role": "student", "full_name": "Verified User"},
        )


class FakeSupabaseAdmin:
    def __init__(self, user):
        self.user = user
        self.auth = SimpleNamespace(get_user=self.get_user)

    def get_user(self, token):
        self.received_token = token
        return SimpleNamespace(user=self.user)

    def from_(self, table):
        assert table == "profiles"
        return FakeProfileQuery()


@pytest.mark.asyncio
@pytest.mark.parametrize("app_env", APPLICATION_ENVIRONMENTS)
@pytest.mark.parametrize("token", STATIC_ROLE_TOKENS)
async def test_static_role_tokens_are_rejected_in_every_runtime(
    monkeypatch,
    app_env,
    token,
):
    monkeypatch.setattr(settings, "APP_ENV", app_env)
    admin = FakeSupabaseAdmin(user=None)
    monkeypatch.setattr(security, "get_supabase_admin_client", lambda: admin)
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=token,
    )

    with pytest.raises(HTTPException) as exc:
        await security.get_current_user_from_token(credentials)

    assert exc.value.status_code == 401
    assert admin.received_token == token


@pytest.mark.asyncio
async def test_supabase_verified_jwt_returns_profile_role(monkeypatch):
    user_id = uuid4()
    token = "supabase-verified-jwt"
    admin = FakeSupabaseAdmin(
        user=SimpleNamespace(id=user_id, email="verified@example.invalid"),
    )
    monkeypatch.setattr(security, "get_supabase_admin_client", lambda: admin)
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=token,
    )

    result = await security.get_current_user_from_token(credentials)

    assert admin.received_token == token
    assert result == {
        "id": str(user_id),
        "email": "verified@example.invalid",
        "role": "student",
        "full_name": "Verified User",
        "access_token": token,
    }
