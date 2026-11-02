"""
IndustryMind — Change-Impact Engine API (R9)
Evaluates and tracks potential impacts when manuals/SOPs are updated.
Feature-flagged: requires CHANGE_IMPACT_ENABLED=true.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user, UserContext
from app.core.authz import resolve_factory_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/change-impact", tags=["change-impact"])


def _check_enabled():
    if not settings.change_impact_enabled:
        raise HTTPException(
            status_code=501,
            detail="Change-impact engine is not enabled (set CHANGE_IMPACT_ENABLED=true)",
        )


class ImpactReview(BaseModel):
    review_status: str  # accepted | rejected | deferred
    reviewed_notes: Optional[str] = None


@router.get("")
async def list_impacts(
    document_id: Optional[str] = None,
    review_status: Optional[str] = None,
    user: UserContext = Depends(get_current_user),
):
    _check_enabled()
    db = get_db()
    query = (
        db.table("document_revision_impacts")
        .select("*")
        .eq("factory_id", resolve_factory_id(user))
        .order("created_at", desc=True)
    )
    if document_id:
        query = query.eq("source_document_id", document_id)
    if review_status:
        query = query.eq("review_status", review_status)

    result = query.execute()
    return {"impacts": result.data, "total": len(result.data)}


@router.post("/analyze")
async def analyze_document_revision(
    body: dict,
    user: UserContext = Depends(get_current_user),
):
    """
    Simulates or generates impact records for a document revision.
    """
    _check_enabled()
    document_id = body.get("document_id")
    new_revision = body.get("new_revision", "rev-next")
    old_revision = body.get("old_revision", "rev-prior")

    if not document_id:
        raise HTTPException(400, "document_id is required")

    db = get_db()
    factory_id = resolve_factory_id(user)

    # Check for knowledge entities / evidence linked to this document
    ev_res = (
        db.table("knowledge_evidence")
        .select("*, relationship:knowledge_relationships!relationship_id(source_entity_id, relationship_type, target_entity_id)")
        .eq("document_id", document_id)
        .execute()
    )

    impacts_created = []
    evidence_items = ev_res.data or []

    for ev in evidence_items:
        impact_data = {
            "factory_id": factory_id,
            "source_document_id": document_id,
            "old_revision": old_revision,
            "new_revision": new_revision,
            "affected_entity_type": "knowledge_relationship",
            "affected_entity_id": ev.get("relationship_id"),
            "affected_entity_name": f"Section {ev.get('section_reference', 'General')}",
            "impact_reason": f"Linked evidence in section '{ev.get('section_reference')}' may require re-validation.",
            "review_status": "pending",
        }
        res = db.table("document_revision_impacts").insert(impact_data).execute()
        if res.data:
            impacts_created.append(res.data[0])

    return {
        "status": "analysis_complete",
        "potential_impacts_found": len(evidence_items),
        "impacts": impacts_created,
    }


@router.patch("/{impact_id}/review")
async def review_impact(
    impact_id: str,
    body: ImpactReview,
    user: UserContext = Depends(get_current_user),
):
    _check_enabled()
    if body.review_status not in ("accepted", "rejected", "deferred"):
        raise HTTPException(400, "review_status must be accepted, rejected, or deferred")

    db = get_db()
    result = (
        db.table("document_revision_impacts")
        .update({
            "review_status": body.review_status,
            "reviewed_by": user.email or user.user_id,
        })
        .eq("id", impact_id)
        .eq("factory_id", resolve_factory_id(user))
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Impact record not found or access denied")
    return result.data[0]
