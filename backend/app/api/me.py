"""
IndustryMind — /me endpoint (R2)
Returns the current authenticated user's profile.
Feature-flagged: works in all AUTH_MODE values.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import AuthUser, get_current_user
from app.core.config import settings
from app.core.database import get_db

router = APIRouter(tags=["auth"])


@router.get("/me")
async def get_me(user: AuthUser = Depends(get_current_user)):
    """Return current user info. In AUTH_MODE=none, returns anonymous user."""
    full_name = None
    if settings.auth_mode == "supabase":
        try:
            db = get_db()
            res = (
                db.table("profiles")
                .select("full_name")
                .eq("user_id", user.user_id)
                .limit(1)
                .execute()
            )
            if res.data:
                full_name = res.data[0].get("full_name")
        except Exception:
            full_name = None

    return {
        "user_id": user.user_id,
        "email": user.email,
        "full_name": full_name,
        "role": user.role,
        "factory_id": user.factory_id or settings.default_factory_id,
        "branch_id": user.branch_id,
        "auth_mode": settings.auth_mode,
    }
