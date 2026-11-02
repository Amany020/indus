"""
IndustryMind — Expert Tips API
POST /tips/ (submit), GET /tips/ (list), PATCH /tips/{id}/review
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.auth import AuthUser, get_current_user, require_role
from app.core.authz import resolve_factory_id
from app.models.schemas import TipCreate, TipReview, TipOut

router = APIRouter(prefix="/tips", tags=["Tips"])


def _get_user_display_name(db, user: AuthUser) -> str:
    """Derive display name: profiles.full_name -> user.email -> user.user_id."""
    try:
        prof_res = (
            db.table("profiles")
            .select("full_name")
            .eq("user_id", user.user_id)
            .limit(1)
            .execute()
        )
        if prof_res.data and prof_res.data[0].get("full_name"):
            return prof_res.data[0]["full_name"]
    except Exception:
        pass
    return user.email or user.user_id


def get_display_name_by_id(db, user_id: str) -> str:
    """Resolve display name for an ARBITRARY user_id (not the current
    request's authenticated user). Used when a reviewer needs to see
    the identity of the worker who originally submitted a query.
    Mirrors _get_user_display_name's profiles lookup but takes a raw
    user_id instead of an AuthUser, since no AuthUser/email exists for
    a user other than the one currently authenticated."""
    try:
        prof_res = (
            db.table("profiles")
            .select("full_name")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if prof_res.data and prof_res.data[0].get("full_name"):
            return prof_res.data[0]["full_name"]
    except Exception:
        pass
    return user_id


@router.get("/", response_model=List[TipOut])
async def list_tips(
    machine_id: Optional[str] = None,
    status: Optional[str] = None,
    user: AuthUser = Depends(get_current_user),
):
    db = get_db()
    query = db.table("tips").select("*").eq("factory_id", resolve_factory_id(user))

    if machine_id:
        query = query.eq("machine_id", machine_id)
    if status:
        query = query.eq("status", status)

    result = query.order("created_at", desc=True).execute()
    return result.data or []


@router.post("/")
async def submit_tip(
    body: TipCreate,
    user: AuthUser = Depends(get_current_user),
):
    db = get_db()
    submitted_by = _get_user_display_name(db, user)

    result = db.table("tips").insert({
        "factory_id": resolve_factory_id(user),
        "machine_id": body.machine_id,
        "submitted_by": submitted_by,
        "tip_text": body.tip_text,
        "related_query_id": body.related_query_id,
        "status": "pending_review",
    }).execute()

    return result.data[0] if result.data else {"status": "submitted"}


@router.patch("/{tip_id}/review")
async def review_tip(
    tip_id: str,
    body: TipReview,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "Status must be 'approved' or 'rejected'")

    if body.status == "rejected" and not body.review_notes:
        raise HTTPException(400, "Review notes required when rejecting")

    db = get_db()
    tip_res = (
        db.table("tips")
        .select("factory_id")
        .eq("id", tip_id)
        .limit(1)
        .execute()
    )
    if not tip_res.data:
        raise HTTPException(404, "Tip not found")

    if tip_res.data[0]["factory_id"] != resolve_factory_id(user):
        raise HTTPException(403, "Cannot review tips outside your factory")

    reviewer_name = _get_user_display_name(db, user)

    db.table("tips").update({
        "status": body.status,
        "reviewer": reviewer_name,
        "review_notes": body.review_notes,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", tip_id).execute()

    return {"status": body.status}
