"""
IndustryMind — Escalation API
POST /escalations/, GET /escalations/, PATCH /escalations/{id}
"""

from __future__ import annotations

import logging
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile

from app.core.database import get_db
from app.core.config import settings
from app.core.auth import AuthUser, get_current_user, require_role
from app.core.authz import resolve_factory_id
from app.api.tips import get_display_name_by_id
from app.models.schemas import (
    EscalationOut,
    EscalationUpdate,
    EscalationListItemOut,
    EscalationDetailOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/escalations", tags=["Escalations"])


@router.get("/", response_model=List[EscalationListItemOut])
async def list_escalations(
    status: Optional[str] = None,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    query = db.table("escalation_tickets").select("*").eq(
        "factory_id", resolve_factory_id(user)
    )
    if status:
        query = query.eq("status", status)

    result = query.order("created_at", desc=True).execute()
    tickets = result.data or []
    if not tickets:
        return []

    query_ids = list({t["query_id"] for t in tickets if t.get("query_id")})
    query_map = {}
    if query_ids:
        q_res = db.table("queries").select("id, machine_id, user_id").in_("id", query_ids).execute()
        for q in (q_res.data or []):
            query_map[q["id"]] = q

    machine_ids = list({q["machine_id"] for q in query_map.values() if q.get("machine_id")})
    machine_map = {}
    if machine_ids:
        m_res = db.table("machines").select("id, name").in_("id", machine_ids).execute()
        for m in (m_res.data or []):
            machine_map[m["id"]] = m.get("name")

    user_ids = {q["user_id"] for q in query_map.values() if q.get("user_id")}
    user_map = {}
    for uid in user_ids:
        user_map[uid] = get_display_name_by_id(db, uid)

    out = []
    for t in tickets:
        t_dict = dict(t)
        q = query_map.get(t.get("query_id"))
        t_dict["machine_name"] = machine_map.get(q.get("machine_id")) if q and q.get("machine_id") else None
        t_dict["worker_name"] = user_map.get(q.get("user_id")) if q and q.get("user_id") else None
        out.append(t_dict)

    return out


@router.post("/")
async def create_escalation(
    query_id: str,
    ai_drafted_brief: Optional[str] = None,
    priority: str = "normal",
    user: AuthUser = Depends(get_current_user),
):
    db = get_db()
    result = db.table("escalation_tickets").insert({
        "factory_id": resolve_factory_id(user),
        "query_id": query_id,
        "ai_drafted_brief": ai_drafted_brief,
        "priority": priority,
    }).execute()
    return result.data[0] if result.data else {"status": "created"}


@router.post("/{ticket_id}/image")
async def upload_escalation_image(
    ticket_id: str,
    image: UploadFile = File(...),
    user: AuthUser = Depends(get_current_user),
):
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if not image.content_type or image.content_type.lower() not in allowed_types:
        raise HTTPException(400, "Unsupported image type")
    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large, max 10MB")

    db = get_db()

    # Verify the ticket exists and belongs to the caller's factory
    ticket = db.table("escalation_tickets").select("id, factory_id").eq(
        "id", ticket_id
    ).single().execute()
    if not ticket.data:
        raise HTTPException(404, "Escalation ticket not found")
    if ticket.data["factory_id"] != resolve_factory_id(user):
        raise HTTPException(403, "Not authorized for this ticket")

    safe_filename = image.filename or "photo.jpg"
    storage_key = f"escalation-images/{ticket_id}/{safe_filename}"
    try:
        db.storage.from_(settings.supabase_bucket).upload(
            storage_key,
            image_bytes,
            {"content-type": image.content_type or "image/jpeg"},
        )
        db.table("escalation_tickets").update(
            {"image_storage_key": storage_key}
        ).eq("id", ticket_id).execute()
    except Exception as e:
        logger.error("Failed to store escalation image: %s", e)
        raise HTTPException(500, f"Image upload failed: {e}")

    return {"status": "uploaded", "image_storage_key": storage_key}



@router.get("/{ticket_id}", response_model=EscalationDetailOut)
async def get_escalation(
    ticket_id: str,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    result = db.table("escalation_tickets").select("*").eq(
        "id", ticket_id
    ).single().execute()
    if not result.data:
        raise HTTPException(404, "Escalation ticket not found")

    ticket = dict(result.data)
    if ticket["factory_id"] != resolve_factory_id(user):
        raise HTTPException(403, "Cannot view escalations outside your factory")

    query_row = None
    if ticket.get("query_id"):
        q_res = (
            db.table("queries")
            .select("machine_id, user_id, query_text, response_summary, evidence_pack, image_storage_key")
            .eq("id", ticket["query_id"])
            .limit(1)
            .execute()
        )
        if q_res.data:
            query_row = q_res.data[0]

    if not query_row:
        image_url = None
        if ticket.get("image_storage_key"):
            try:
                signed = db.storage.from_(settings.supabase_bucket).create_signed_url(
                    ticket["image_storage_key"], 3600
                )
                image_url = signed.get("signedURL", signed.get("signedUrl"))
            except Exception as e:
                logger.warning("Failed to generate signed URL for escalation image %s: %s", ticket["image_storage_key"], e)
                image_url = None
        ticket.update({
            "machine_name": None,
            "worker_name": None,
            "question_text": None,
            "ai_response": None,
            "sources": [],
            "image_url": image_url,
        })
        return ticket

    machine_name = None
    if query_row.get("machine_id"):
        m_res = db.table("machines").select("name").eq("id", query_row["machine_id"]).limit(1).execute()
        if m_res.data and m_res.data[0].get("name"):
            machine_name = m_res.data[0]["name"]

    worker_name = None
    if query_row.get("user_id"):
        worker_name = get_display_name_by_id(db, query_row["user_id"])

    sources = []
    seen = set()
    evidence_pack = query_row.get("evidence_pack") or []
    if isinstance(evidence_pack, list):
        for ev in evidence_pack:
            if isinstance(ev, dict) and ev.get("filename"):
                fn = ev["filename"]
                pn = ev.get("page_number")
                src_str = f"{fn} p.{pn}" if pn is not None else fn
                if src_str not in seen:
                    seen.add(src_str)
                    sources.append(src_str)

    ticket.update({
        "machine_name": machine_name,
        "worker_name": worker_name,
        "question_text": query_row.get("query_text"),
        "ai_response": query_row.get("response_summary"),
        "sources": sources,
    })

    # Resolve image_url: ticket attachment takes precedence over query image
    storage_path = None
    if ticket.get("image_storage_key"):
        storage_path = ticket["image_storage_key"]
    elif query_row and query_row.get("image_storage_key"):
        storage_path = query_row["image_storage_key"]

    image_url = None
    if storage_path:
        try:
            signed = db.storage.from_(settings.supabase_bucket).create_signed_url(storage_path, 3600)
            image_url = signed.get("signedURL", signed.get("signedUrl"))
        except Exception as e:
            logger.warning("Failed to generate signed URL for escalation image %s: %s", storage_path, e)
            image_url = None

    ticket["image_url"] = image_url
    return ticket


@router.patch("/{ticket_id}")
async def update_escalation(
    ticket_id: str,
    body: EscalationUpdate,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    ticket_res = (
        db.table("escalation_tickets")
        .select("factory_id")
        .eq("id", ticket_id)
        .limit(1)
        .execute()
    )
    if not ticket_res.data:
        raise HTTPException(404, "Escalation ticket not found")

    if ticket_res.data[0]["factory_id"] != resolve_factory_id(user):
        raise HTTPException(403, "Cannot update escalations outside your factory")

    update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if body.status:
        update["status"] = body.status
        if body.status == "resolved":
            update["resolved_at"] = datetime.now(timezone.utc).isoformat()
    if body.assigned_to is not None:
        update["assigned_to"] = body.assigned_to
    if body.expert_edited_brief is not None:
        update["expert_edited_brief"] = body.expert_edited_brief
    if body.resolution_notes is not None:
        update["resolution_notes"] = body.resolution_notes

    db.table("escalation_tickets").update(update).eq("id", ticket_id).execute()
    return {"status": "updated"}
