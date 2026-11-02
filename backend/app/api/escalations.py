"""
IndustryMind — Escalation API
POST /escalations/, GET /escalations/, PATCH /escalations/{id}
Expert ticket handling: assignment, assigned/mine lists, thread view, replies
"""

from __future__ import annotations

import os
import uuid
import logging
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import settings
from app.core.auth import AuthUser, get_current_user, require_role, normalize_role
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


class EscalationAssign(BaseModel):
    expert_id: Optional[str] = None


class EscalationListItemOutResolved(EscalationListItemOut):
    assigned_expert_id: Optional[str] = None
    resolved_at: Optional[str] = None


# ─── Fixed-Path Routes (declared before parameterized /{ticket_id}) ────────────

@router.get("/", response_model=List[EscalationListItemOutResolved])
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
        t_dict["assigned_expert_id"] = str(t["assigned_expert_id"]) if t.get("assigned_expert_id") else None
        t_dict["resolved_at"] = str(t["resolved_at"]) if t.get("resolved_at") else None
        out.append(t_dict)

    return out


@router.post("/")
async def create_escalation(
    query_id: str,
    ai_drafted_brief: Optional[str] = None,
    priority: str = "normal",
    user: AuthUser = Depends(get_current_user),
):
    factory_id = resolve_factory_id(user)
    db = get_db()

    q_res = (
        db.table("queries")
        .select("id, factory_id, user_id")
        .eq("id", query_id)
        .eq("factory_id", factory_id)
        .limit(1)
        .execute()
    )
    if not q_res.data:
        raise HTTPException(404, "Query not found")

    query_row = q_res.data[0]
    norm_role = normalize_role(user.role)
    if norm_role not in ("reviewer", "admin"):
        if query_row.get("user_id") != user.user_id:
            raise HTTPException(404, "Query not found")

    result = db.table("escalation_tickets").insert({
        "factory_id": factory_id,
        "query_id": query_id,
        "ai_drafted_brief": ai_drafted_brief,
        "priority": priority,
        "created_by": user.user_id,
    }).execute()
    return result.data[0] if result.data else {"status": "created"}


@router.get("/assigned")
async def get_assigned_escalations(
    user: AuthUser = Depends(require_role("expert")),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    tickets_res = (
        db.table("escalation_tickets")
        .select("id, status, priority, created_at, query_id")
        .eq("factory_id", factory_id)
        .eq("assigned_expert_id", user.user_id)
        .order("created_at", desc=True)
        .execute()
    )
    tickets = tickets_res.data or []
    if not tickets:
        return []

    query_ids = list({t["query_id"] for t in tickets if t.get("query_id")})
    query_map = {}
    if query_ids:
        q_res = (
            db.table("queries")
            .select("id, query_text")
            .eq("factory_id", factory_id)
            .in_("id", query_ids)
            .execute()
        )
        for q in (q_res.data or []):
            query_map[q["id"]] = q.get("query_text")

    ticket_ids = [t["id"] for t in tickets]
    reply_counts = {}
    if ticket_ids:
        r_res = db.table("escalation_replies").select("ticket_id").in_("ticket_id", ticket_ids).execute()
        for r in (r_res.data or []):
            tid = r["ticket_id"]
            reply_counts[tid] = reply_counts.get(tid, 0) + 1

    return [
        {
            "id": t["id"],
            "status": t.get("status"),
            "priority": t.get("priority"),
            "created_at": t.get("created_at"),
            "question": query_map.get(t.get("query_id")),
            "reply_count": reply_counts.get(t["id"], 0),
        }
        for t in tickets
    ]


@router.get("/mine")
async def get_my_escalations(
    user: AuthUser = Depends(get_current_user),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    tickets_res = (
        db.table("escalation_tickets")
        .select("id, status, priority, created_at, query_id")
        .eq("factory_id", factory_id)
        .eq("created_by", user.user_id)
        .order("created_at", desc=True)
        .execute()
    )
    tickets = tickets_res.data or []
    if not tickets:
        return []

    query_ids = list({t["query_id"] for t in tickets if t.get("query_id")})
    query_map = {}
    if query_ids:
        q_res = (
            db.table("queries")
            .select("id, query_text")
            .eq("factory_id", factory_id)
            .in_("id", query_ids)
            .execute()
        )
        for q in (q_res.data or []):
            query_map[q["id"]] = q.get("query_text")

    ticket_ids = [t["id"] for t in tickets]
    reply_counts = {}
    last_reply_map = {}
    if ticket_ids:
        r_res = db.table("escalation_replies").select("ticket_id, created_at").in_("ticket_id", ticket_ids).execute()
        for r in (r_res.data or []):
            tid = r["ticket_id"]
            reply_counts[tid] = reply_counts.get(tid, 0) + 1
            cat = r.get("created_at")
            if cat:
                if tid not in last_reply_map or cat > last_reply_map[tid]:
                    last_reply_map[tid] = cat

    return [
        {
            "id": t["id"],
            "status": t.get("status"),
            "priority": t.get("priority"),
            "created_at": t.get("created_at"),
            "question": query_map.get(t.get("query_id")),
            "reply_count": reply_counts.get(t["id"], 0),
            "last_reply_at": last_reply_map.get(t["id"]),
        }
        for t in tickets
    ]


# ─── Parameterized Sub-Resource Routes (/{ticket_id}/...) ─────────────────────

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
    ).limit(1).execute()
    if not ticket.data:
        raise HTTPException(404, "Ticket not found")
    if ticket.data[0]["factory_id"] != resolve_factory_id(user):
        raise HTTPException(404, "Ticket not found")

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


@router.patch("/{ticket_id}/assign")
async def assign_ticket_to_expert(
    ticket_id: str,
    body: EscalationAssign,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    ticket_res = (
        db.table("escalation_tickets")
        .select("id, factory_id, status")
        .eq("id", ticket_id)
        .eq("factory_id", factory_id)
        .limit(1)
        .execute()
    )
    if not ticket_res.data:
        raise HTTPException(404, "Ticket not found")

    ticket = ticket_res.data[0]
    new_status = ticket.get("status")

    if body.expert_id is not None:
        m_res = (
            db.table("memberships")
            .select("role")
            .eq("user_id", body.expert_id)
            .eq("factory_id", factory_id)
            .limit(1)
            .execute()
        )
        if not m_res.data or m_res.data[0].get("role") != "expert":
            raise HTTPException(400, "Target user is not an expert engineer")

        if ticket.get("status") == "open":
            new_status = "in_progress"

    now_iso = datetime.now(timezone.utc).isoformat()
    update_data = {
        "assigned_expert_id": body.expert_id,
        "updated_at": now_iso,
    }
    if new_status != ticket.get("status"):
        update_data["status"] = new_status

    db.table("escalation_tickets").update(update_data).eq("id", ticket_id).execute()

    return {
        "id": ticket_id,
        "assigned_expert_id": body.expert_id,
        "status": new_status,
    }


@router.get("/{ticket_id}/thread")
async def get_escalation_thread(
    ticket_id: str,
    user: AuthUser = Depends(get_current_user),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    ticket_res = (
        db.table("escalation_tickets")
        .select("*")
        .eq("id", ticket_id)
        .eq("factory_id", factory_id)
        .limit(1)
        .execute()
    )
    if not ticket_res.data:
        raise HTTPException(404, "Ticket not found")

    ticket = ticket_res.data[0]

    query_row = None
    if ticket.get("query_id"):
        q_res = (
            db.table("queries")
            .select("query_text, user_id")
            .eq("id", ticket["query_id"])
            .eq("factory_id", factory_id)
            .limit(1)
            .execute()
        )
        if q_res.data:
            query_row = q_res.data[0]

    norm_role = normalize_role(user.role)
    is_reviewer_or_admin = norm_role in ("reviewer", "admin")
    is_assigned_expert = (ticket.get("assigned_expert_id") == user.user_id)
    is_creator = False
    if ticket.get("created_by"):
        is_creator = (ticket["created_by"] == user.user_id)
    elif query_row and query_row.get("user_id"):
        is_creator = (query_row["user_id"] == user.user_id)

    if not (is_reviewer_or_admin or is_assigned_expert or is_creator):
        raise HTTPException(404, "Ticket not found")

    replies_res = (
        db.table("escalation_replies")
        .select("*")
        .eq("ticket_id", ticket_id)
        .order("created_at", desc=False)
        .execute()
    )
    raw_replies = replies_res.data or []

    author_ids = list({r["author_id"] for r in raw_replies if r.get("author_id")})
    author_map = {}
    if author_ids:
        try:
            prof_res = db.table("profiles").select("user_id, full_name").in_("user_id", author_ids).execute()
            for p in (prof_res.data or []):
                if p.get("full_name"):
                    author_map[p["user_id"]] = p["full_name"]
        except Exception as e:
            logger.warning("Failed to batch fetch profiles for replies: %s", e)

    formatted_replies = []
    for r in raw_replies:
        media_url = None
        if r.get("kind") in ("image", "audio") and r.get("storage_key"):
            try:
                signed = db.storage.from_(settings.supabase_bucket).create_signed_url(
                    r["storage_key"], 3600
                )
                media_url = signed.get("signedURL", signed.get("signedUrl"))
            except Exception as e:
                logger.warning("Failed to create signed URL for reply %s: %s", r.get("storage_key"), e)
                media_url = None

        formatted_replies.append({
            "id": r["id"],
            "author_id": r.get("author_id"),
            "author_name": author_map.get(r.get("author_id")) or "User",
            "author_role": r.get("author_role"),
            "kind": r.get("kind"),
            "body": r.get("body"),
            "media_url": media_url,
            "created_at": r.get("created_at"),
        })

    return {
        "ticket": {
            "id": ticket["id"],
            "status": ticket.get("status"),
            "priority": ticket.get("priority"),
            "created_at": ticket.get("created_at"),
            "question": query_row.get("query_text") if query_row else None,
            "ai_drafted_brief": (
                ticket.get("ai_drafted_brief")
                if (is_reviewer_or_admin or is_assigned_expert)
                else None
            ),
            "resolution_notes": ticket.get("resolution_notes"),
            "assigned_expert_id": ticket.get("assigned_expert_id"),
        },
        "replies": formatted_replies,
    }


@router.post("/{ticket_id}/replies")
async def create_escalation_reply(
    ticket_id: str,
    kind: str = Form(...),
    body: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    resolve: bool = Form(False),
    user: AuthUser = Depends(get_current_user),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    ticket_res = (
        db.table("escalation_tickets")
        .select("id, factory_id, status, assigned_expert_id")
        .eq("id", ticket_id)
        .eq("factory_id", factory_id)
        .limit(1)
        .execute()
    )
    if not ticket_res.data:
        raise HTTPException(404, "Ticket not found")

    ticket = ticket_res.data[0]

    norm_role = normalize_role(user.role)
    is_reviewer_or_admin = norm_role in ("reviewer", "admin")
    is_assigned_expert = (ticket.get("assigned_expert_id") == user.user_id)
    if not (is_reviewer_or_admin or is_assigned_expert):
        raise HTTPException(404, "Ticket not found")

    if kind not in ("text", "image", "audio"):
        raise HTTPException(400, "Invalid reply kind. Must be 'text', 'image', or 'audio'")

    body_clean = body.strip() if body else None

    reply_id = str(uuid.uuid4())
    storage_key = None
    media_url = None

    if kind == "text":
        if not body_clean:
            raise HTTPException(400, "Text body is required")
        if len(body_clean) > 2000:
            raise HTTPException(400, "Text body too long, max 2000 characters")

    elif kind == "image":
        if not file:
            raise HTTPException(400, "Image file is required")
        ct = (file.content_type or "").lower()
        if not (ct.startswith("image/png") or ct.startswith("image/jpeg") or ct.startswith("image/webp")):
            raise HTTPException(400, "Unsupported image content type")
        file_bytes = await file.read()
        if len(file_bytes) > 5 * 1024 * 1024:
            raise HTTPException(400, "Image file too large, max 5MB")
        if body_clean and len(body_clean) > 500:
            raise HTTPException(400, "Caption too long, max 500 characters")

        safe_filename = os.path.basename(file.filename or "photo.jpg") or "photo.jpg"
        storage_key = f"escalation-replies/{ticket_id}/{reply_id}/{safe_filename}"
        try:
            db.storage.from_(settings.supabase_bucket).upload(
                storage_key,
                file_bytes,
                {"content-type": file.content_type or "image/jpeg"},
            )
        except Exception as e:
            logger.error("Failed to upload reply image: %s", e)
            raise HTTPException(500, f"Image upload failed: {e}")

        try:
            signed = db.storage.from_(settings.supabase_bucket).create_signed_url(storage_key, 3600)
            media_url = signed.get("signedURL", signed.get("signedUrl"))
        except Exception as e:
            logger.warning("Failed to create signed URL for reply image %s: %s", storage_key, e)
            media_url = None

    elif kind == "audio":
        if not file:
            raise HTTPException(400, "Audio file is required")
        ct = (file.content_type or "").lower()
        valid_audio_prefixes = ("audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg")
        if not any(ct.startswith(prefix) for prefix in valid_audio_prefixes):
            raise HTTPException(400, "Unsupported audio content type")
        file_bytes = await file.read()
        if len(file_bytes) > 10 * 1024 * 1024:
            raise HTTPException(400, "Audio file too large, max 10MB")

        safe_filename = os.path.basename(file.filename or "audio.webm") or "audio.webm"
        storage_key = f"escalation-replies/{ticket_id}/{reply_id}/{safe_filename}"
        try:
            db.storage.from_(settings.supabase_bucket).upload(
                storage_key,
                file_bytes,
                {"content-type": file.content_type or "audio/webm"},
            )
        except Exception as e:
            logger.error("Failed to upload reply audio: %s", e)
            raise HTTPException(500, f"Audio upload failed: {e}")

        try:
            signed = db.storage.from_(settings.supabase_bucket).create_signed_url(storage_key, 3600)
            media_url = signed.get("signedURL", signed.get("signedUrl"))
        except Exception as e:
            logger.warning("Failed to create signed URL for reply audio %s: %s", storage_key, e)
            media_url = None

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()

    reply_row = {
        "id": reply_id,
        "ticket_id": ticket_id,
        "factory_id": factory_id,
        "author_id": user.user_id,
        "author_role": user.role,
        "kind": kind,
        "body": body_clean,
        "storage_key": storage_key,
        "created_at": now_iso,
    }
    db.table("escalation_replies").insert(reply_row).execute()

    ticket_update = {"updated_at": now_iso}
    if resolve:
        ticket_update["status"] = "resolved"
        ticket_update["resolved_at"] = now_iso
    elif ticket.get("status") == "open":
        ticket_update["status"] = "in_progress"

    db.table("escalation_tickets").update(ticket_update).eq("id", ticket_id).execute()

    author_name = "User"
    try:
        prof_res = db.table("profiles").select("full_name").eq("user_id", user.user_id).limit(1).execute()
        if prof_res.data and prof_res.data[0].get("full_name"):
            author_name = prof_res.data[0]["full_name"]
    except Exception:
        pass

    return {
        "id": reply_id,
        "author_id": user.user_id,
        "author_name": author_name,
        "author_role": user.role,
        "kind": kind,
        "body": body_clean,
        "media_url": media_url,
        "created_at": now_iso,
    }


# ─── Parameterized Wildcard Routes (/{ticket_id}) ─────────────────────────────

@router.get("/{ticket_id}", response_model=EscalationDetailOut)
async def get_escalation(
    ticket_id: str,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    factory_id = resolve_factory_id(user)
    result = db.table("escalation_tickets").select("*").eq(
        "id", ticket_id
    ).eq("factory_id", factory_id).limit(1).execute()
    if not result.data:
        raise HTTPException(404, "Ticket not found")

    ticket = dict(result.data[0])

    query_row = None
    if ticket.get("query_id"):
        q_res = (
            db.table("queries")
            .select("machine_id, user_id, query_text, response_summary, evidence_pack, image_storage_key")
            .eq("id", ticket["query_id"])
            .eq("factory_id", factory_id)
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
    factory_id = resolve_factory_id(user)
    ticket_res = (
        db.table("escalation_tickets")
        .select("factory_id")
        .eq("id", ticket_id)
        .eq("factory_id", factory_id)
        .limit(1)
        .execute()
    )
    if not ticket_res.data:
        raise HTTPException(404, "Ticket not found")

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
