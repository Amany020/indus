"""
IndustryMind — Authentication Module (R2)
Supports three modes controlled by AUTH_MODE env var:
  - "none"     : No auth (hackathon default). All requests pass through.
  - "supabase" : Verify Supabase JWT from Authorization header.
  - "header"   : Trust X-User-Id / X-User-Role headers (dev/testing only).

Feature-flagged: when AUTH_MODE=none, no auth is enforced.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)


class AuthUser(BaseModel):
    """Authenticated user context."""
    user_id: str
    email: Optional[str] = None
    role: str = "worker"  # worker | supervisor | admin | viewer | expert
    factory_id: Optional[str] = None
    branch_id: Optional[str] = None


UserContext = AuthUser


# ─── Anonymous user (AUTH_MODE=none) ─────────────────────────────────────────

ANON_USER = AuthUser(
    user_id="anon",
    email=None,
    role="worker",
    factory_id=settings.default_factory_id,
)


# ─── Supabase JWT verification ──────────────────────────────────────────────

_supabase_jwks = None


def _verify_supabase_jwt(token: str) -> dict:
    """Verify a Supabase JWT and return the payload."""
    try:
        import jwt as pyjwt
        from jwt import PyJWKClient

        global _supabase_jwks
        if _supabase_jwks is None:
            jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
            _supabase_jwks = PyJWKClient(jwks_url, cache_keys=True)

        signing_key = _supabase_jwks.get_signing_key_from_jwt(token)
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            options={"verify_exp": True},
            leeway=60,
        )
        return payload
    except ImportError:
        logger.error("PyJWT not installed. Run: pip install PyJWT[crypto]")
        raise HTTPException(status_code=500, detail="Auth library not available")
    except Exception as e:
        logger.warning("JWT verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _get_membership(db, user_id: str) -> Optional[dict]:
    """Look up user's membership and role."""
    try:
        result = (
            db.table("memberships")
            .select("factory_id, role, branch_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.warning("Membership lookup failed: %s", e)
    return None


# ─── Dependency: get current user ───────────────────────────────────────────

async def get_current_user(request: Request) -> AuthUser:
    """
    FastAPI dependency that returns the authenticated user.
    Behavior depends on AUTH_MODE setting.
    """
    mode = settings.auth_mode

    # ── No auth (hackathon default) ──────────────────────────────────────
    if mode == "none":
        return ANON_USER

    # ── Header-based auth (dev/testing) ──────────────────────────────────
    if mode == "header":
        user_id = request.headers.get("X-User-Id", "")
        role = request.headers.get("X-User-Role", "worker")
        factory_id = request.headers.get(
            "X-Factory-Id", settings.default_factory_id
        )
        branch_id = request.headers.get("X-Branch-Id") or None
        if not user_id:
            raise HTTPException(status_code=401, detail="X-User-Id header required")
        return AuthUser(
            user_id=user_id,
            role=role,
            factory_id=factory_id,
            branch_id=branch_id,
        )

    # ── Supabase JWT auth ────────────────────────────────────────────────
    if mode == "supabase":
        token = ""
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        elif request.query_params.get("token"):
            token = request.query_params.get("token")

        if not token:
            raise HTTPException(
                status_code=401,
                detail="Authorization: Bearer <token> required",
            )
        payload = _verify_supabase_jwt(token)

        user_id = payload.get("sub", "")
        email = payload.get("email")

        # Look up membership for role + factory
        from app.core.database import get_db
        db = get_db()
        membership = _get_membership(db, user_id)

        if membership:
            return AuthUser(
                user_id=user_id,
                email=email,
                role=membership["role"],
                factory_id=membership["factory_id"],
                branch_id=membership.get("branch_id"),
            )
        else:
            raise HTTPException(
                status_code=403,
                detail="No factory membership found for this account",
            )

    raise HTTPException(status_code=500, detail=f"Unknown AUTH_MODE: {mode}")


# ─── Role guards ────────────────────────────────────────────────────────────

ROLE_ALIASES = {
    "supervisor": "reviewer",
}


def normalize_role(role: str) -> str:
    """Map a raw DB/auth role to its canonical comparison role."""
    return ROLE_ALIASES.get(role, role)


def require_role(*allowed_roles: str):
    """Dependency factory: reject users not in allowed_roles."""
    async def _guard(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if settings.auth_mode == "none":
            return user
        norm_role = normalize_role(user.role)
        is_allowed = norm_role in allowed_roles or (user.role == "expert" and "worker" in allowed_roles)
        if not is_allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user.role}' not authorized. Required: {allowed_roles}",
            )
        return user
    return _guard
