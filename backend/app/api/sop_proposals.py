"""
IndustryMind — SOP Proposals API (R7)
Allows submitting and reviewing SOP modification and addendum proposals.
Feature-flagged: requires SOP_PROPOSALS_ENABLED=true.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import AuthUser, require_role, get_current_user
from app.core.authz import resolve_factory_id
from app.api.tips import _get_user_display_name
from app.models.schemas import ProposalOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sop-proposals", tags=["sop-proposals"])


def _check_enabled():
    if not settings.sop_proposals_enabled:
        raise HTTPException(
            status_code=501,
            detail="SOP proposals feature is not enabled (set SOP_PROPOSALS_ENABLED=true)",
        )


class ProposalCreate(BaseModel):
    title: str
    machine_id: Optional[str] = None
    document_id: Optional[str] = None
    current_sop_step: Optional[str] = None
    proposed_addition: str
    safety_impact: Optional[str] = None


class ProposalReview(BaseModel):
    status: str  # approved | rejected | merged
    review_notes: Optional[str] = None


@router.get("")
async def list_proposals(
    status: Optional[str] = None,
    machine_id: Optional[str] = None,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    _check_enabled()
    db = get_db()
    query = (
        db.table("sop_proposals")
        .select("*")
        .eq("factory_id", resolve_factory_id(user))
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", status)
    if machine_id:
        query = query.eq("machine_id", machine_id)

    result = query.execute()
    return {"proposals": result.data, "total": len(result.data)}


@router.post("", response_model=ProposalOut)
async def create_proposal(
    body: ProposalCreate,
    user: AuthUser = Depends(get_current_user),
):
    _check_enabled()
    db = get_db()
    data = {
        "factory_id": resolve_factory_id(user),
        "machine_id": body.machine_id,
        "document_id": body.document_id,
        "proposed_by": _get_user_display_name(db, user),
        "title": body.title,
        "current_sop_step": body.current_sop_step,
        "proposed_addition": body.proposed_addition,
        "safety_impact": body.safety_impact,
        "status": "pending",
    }
    result = db.table("sop_proposals").insert(data).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create SOP proposal")
    return result.data[0]


@router.patch("/{proposal_id}/review", response_model=ProposalOut)
async def review_proposal(
    proposal_id: str,
    body: ProposalReview,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    _check_enabled()
    if body.status not in ("approved", "rejected", "merged"):
        raise HTTPException(400, "Status must be approved, rejected, or merged")

    db = get_db()
    update_data = {
        "status": body.status,
        "reviewed_by": _get_user_display_name(db, user),
        "review_notes": body.review_notes,
    }
    result = (
        db.table("sop_proposals")
        .update(update_data)
        .eq("id", proposal_id)
        .eq("factory_id", resolve_factory_id(user))
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Proposal not found or access denied")
    return result.data[0]
