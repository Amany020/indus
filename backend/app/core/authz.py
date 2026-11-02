"""
IndustryMind — Factory Scope Helper (R3)
Resolves the current factory context for multi-tenant queries.
Feature-flagged: when TENANCY_ENFORCED=false, always returns default_factory_id.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException

from app.core.config import settings
from app.core.auth import AuthUser

logger = logging.getLogger(__name__)


def resolve_factory_id(user: AuthUser, requested_factory_id: Optional[str] = None) -> str:
    """
    Determine which factory_id to use for a request.

    - TENANCY_ENFORCED=false → always use default_factory_id (hackathon mode)
    - TENANCY_ENFORCED=true  → use user's factory_id from membership,
      or requested_factory_id if admin
    """
    if not settings.tenancy_enforced:
        return settings.default_factory_id

    # User's assigned factory from membership
    user_factory = user.factory_id or settings.default_factory_id

    # If no specific factory requested, use user's assigned one
    if not requested_factory_id:
        return user_factory

    # Admin can access any factory
    if user.role == "admin":
        return requested_factory_id

    # Non-admin must access their own factory
    if requested_factory_id != user_factory:
        raise HTTPException(
            status_code=403,
            detail="You can only access your assigned factory",
        )

    return requested_factory_id
