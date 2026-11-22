from typing import Dict, Any, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.supabase import get_supabase_admin_client

# Standard HTTP Bearer scheme
security_scheme = HTTPBearer(auto_error=False)


async def get_current_user_from_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Dict[str, Any]:
    """
    Extracts and validates Supabase JWT from the Authorization Bearer header.
    Returns user payload or raises 401 Unauthorized.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    supabase_admin = get_supabase_admin_client()
    if not supabase_admin:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service connection is not configured.",
        )

    try:
        # Verify user token with Supabase Auth
        user_res = supabase_admin.auth.get_user(token)
        if not user_res or not user_res.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id = str(user_res.user.id)
        email = str(user_res.user.email or "")

        # Fetch profile role directly from PostgreSQL public.profiles
        profile_res = supabase_admin.from_("profiles").select("id, role, full_name").eq("id", user_id).single().execute()
        
        if not profile_res.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account has no associated database profile.",
            )

        return {
            "id": user_id,
            "email": email,
            "role": profile_res.data.get("role"),
            "full_name": profile_res.data.get("full_name"),
            "access_token": token,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_admin_user(
    current_user: Dict[str, Any] = Depends(get_current_user_from_token),
) -> Dict[str, Any]:
    """
    Enforces that the authenticated caller has the 'admin' role.
    Rejects faculty, students, or unassigned roles with 403 Forbidden.
    """
    user_role = current_user.get("role")
    if user_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Administrative privileges required. (Current role: '{user_role}')",
        )
    return current_user


async def get_current_faculty_user(
    current_user: Dict[str, Any] = Depends(get_current_user_from_token),
) -> Dict[str, Any]:
    user_role = current_user.get("role")
    if user_role != "faculty":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Faculty privileges required.",
        )
    return current_user


async def get_current_student_user(
    current_user: Dict[str, Any] = Depends(get_current_user_from_token),
) -> Dict[str, Any]:
    user_role = current_user.get("role")
    if user_role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Student privileges required.",
        )
    return current_user
