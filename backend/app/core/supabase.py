from typing import Optional
from supabase import create_client, Client
from app.core.config import settings


_supabase_client: Optional[Client] = None
_supabase_admin_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    """
    Returns public/anon Supabase client.
    Returns None if credentials have not been configured yet (placeholder-safe).
    """
    global _supabase_client
    if _supabase_client is None:
        if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
            _supabase_client = create_client(
                supabase_url=settings.SUPABASE_URL,
                supabase_key=settings.SUPABASE_ANON_KEY,
            )
    return _supabase_client


def get_supabase_admin_client() -> Optional[Client]:
    """
    Returns backend service-role Supabase client for privileged backend tasks.
    NEVER exposed to frontend clients.
    Returns None if credentials have not been configured yet.
    """
    global _supabase_admin_client
    if _supabase_admin_client is None:
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
            _supabase_admin_client = create_client(
                supabase_url=settings.SUPABASE_URL,
                supabase_key=settings.SUPABASE_SERVICE_ROLE_KEY,
            )
    return _supabase_admin_client


def get_supabase_user_client(access_token: str) -> Optional[Client]:
    """
    Creates a short-lived anon Supabase client scoped to a verified user access token.
    Used for RPCs that must derive auth.uid() and preserve the caller's database ownership.
    """
    if not access_token:
        return None
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        return None
    client = create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_ANON_KEY,
    )
    client.postgrest.auth(access_token)
    return client
