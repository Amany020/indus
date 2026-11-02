"""
IndustryMind — Documents API
POST /documents/ (upload), GET /documents/, POST /documents/{id}/approve
GET /documents/{id}/page-url/{page_num}
"""

from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, UploadFile, File, Form, HTTPException, BackgroundTasks

from app.core.database import get_db
from app.core.config import settings
from app.core.auth import AuthUser, get_current_user, require_role
from app.core.authz import resolve_factory_id
from app.api.tips import _get_user_display_name
from app.models.schemas import DocumentOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("/", response_model=List[DocumentOut])
async def list_documents(
    machine_id: Optional[str] = None,
    status: Optional[str] = None,
    user: AuthUser = Depends(get_current_user),
):
    db = get_db()
    query = db.table("documents").select(
        "id, machine_id, filename, doc_type, revision, approval_status, page_count, owner, approved_by, approved_at, created_at"
    ).eq("factory_id", resolve_factory_id(user))

    if machine_id:
        query = query.eq("machine_id", machine_id)
    if status:
        query = query.eq("approval_status", status)

    result = query.order("created_at", desc=True).execute()
    docs = result.data or []

    # Batch-fetch machines for machine_id values present
    machine_ids = list({d["machine_id"] for d in docs if d.get("machine_id")})
    machine_map = {}
    if machine_ids:
        m_res = db.table("machines").select("id, name").in_("id", machine_ids).execute()
        machine_map = {m["id"]: m["name"] for m in (m_res.data or [])}

    return [
        {
            **doc,
            "status": doc.get("approval_status", "queued"),
            "uploaded_at": doc.get("created_at"),
            "machine_name": machine_map.get(doc.get("machine_id")) if doc.get("machine_id") else None,
            "approved_by": doc.get("approved_by"),
            "approved_at": doc.get("approved_at"),
        }
        for doc in docs
    ]


@router.post("/")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    machine_id: str = Form(...),
    doc_type: str = Form("manual"),
    revision: str = Form("1.0"),
    owner: str = Form(""),
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    db = get_db()
    doc_id = str(uuid.uuid4())
    pdf_bytes = await file.read()

    # Upload to storage
    storage_key = f"documents/{doc_id}/{file.filename}"
    try:
        db.storage.from_(settings.supabase_bucket).upload(
            storage_key, pdf_bytes, {"content-type": "application/pdf"}
        )
    except Exception as e:
        logger.error("Storage upload failed: %s", e)
        raise HTTPException(500, f"Storage upload failed: {e}")

    factory_id = resolve_factory_id(user)

    # Insert document record
    db.table("documents").insert({
        "id": doc_id,
        "factory_id": factory_id,
        "machine_id": machine_id,
        "filename": file.filename,
        "doc_type": doc_type,
        "revision": revision,
        "owner": owner or None,
        "file_storage_key": storage_key,
        "approval_status": "processing",
    }).execute()

    # Start ingestion in background
    from app.services.ingestion import ingest_document
    background_tasks.add_task(
        ingest_document, pdf_bytes, doc_id, machine_id, factory_id, revision
    )

    return {"doc_id": doc_id, "status": "processing"}


@router.patch("/{doc_id}/approve")
async def approve_document(
    doc_id: str,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    doc_res = (
        db.table("documents")
        .select("factory_id")
        .eq("id", doc_id)
        .limit(1)
        .execute()
    )
    if not doc_res.data:
        raise HTTPException(404, "Document not found")

    if doc_res.data[0]["factory_id"] != resolve_factory_id(user):
        raise HTTPException(403, "Cannot approve documents outside your factory")

    now = datetime.now(timezone.utc).isoformat()
    reviewer_name = _get_user_display_name(db, user)

    db.table("documents").update({
        "approval_status": "approved",
        "approved_by": reviewer_name,
        "approved_at": now,
        "updated_at": now,
    }).eq("id", doc_id).execute()

    # Also approve all chunks for this document
    db.table("document_chunks").update({
        "approval_status": "approved",
    }).eq("document_id", doc_id).execute()

    return {"status": "approved"}


@router.patch("/{doc_id}/reject")
async def reject_document(
    doc_id: str,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    doc_res = (
        db.table("documents")
        .select("factory_id")
        .eq("id", doc_id)
        .limit(1)
        .execute()
    )
    if not doc_res.data:
        raise HTTPException(404, "Document not found")

    if doc_res.data[0]["factory_id"] != resolve_factory_id(user):
        raise HTTPException(403, "Cannot reject documents outside your factory")

    now = datetime.now(timezone.utc).isoformat()
    reviewer_name = _get_user_display_name(db, user)

    db.table("documents").update({
        "approval_status": "rejected",
        "approved_by": reviewer_name,
        "approved_at": now,
        "updated_at": now,
    }).eq("id", doc_id).execute()

    # Also update all document_chunks for this document to rejected
    db.table("document_chunks").update({
        "approval_status": "rejected",
    }).eq("document_id", doc_id).execute()

    return {"status": "rejected"}


@router.get("/{doc_id}/page-url/{page_num}")
async def get_page_url(
    doc_id: str,
    page_num: int,
    user: AuthUser = Depends(get_current_user),
):
    db = get_db()
    page = db.table("document_pages").select(
        "image_storage_key"
    ).eq("document_id", doc_id).eq("page_number", page_num).single().execute()

    if not page.data:
        raise HTTPException(404, "Page not found")

    key = page.data["image_storage_key"]
    try:
        signed = db.storage.from_(settings.supabase_bucket).create_signed_url(key, 3600)
        return {"url": signed.get("signedURL", signed.get("signedUrl", ""))}
    except Exception as e:
        logger.error("Signed URL failed: %s", e)
        raise HTTPException(500, "Could not generate page URL")


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    x_role: str = Header("admin"),
):
    """
    Remove a document and its chunked data from the database
    without affecting other documents or current operational data.
    """
    db = get_db()
    
    # 1. Fetch document to get storage key
    doc_res = db.table("documents").select("id, file_storage_key").eq("id", doc_id).single().execute()
    if not doc_res.data:
        raise HTTPException(404, "Document not found")
        
    doc = doc_res.data
    storage_key = doc.get("file_storage_key")

    # 2. Delete chunked embeddings
    db.table("document_chunks").delete().eq("document_id", doc_id).execute()

    # 3. Delete document pages
    db.table("document_pages").delete().eq("document_id", doc_id).execute()

    # 4. Remove from storage (optional best effort)
    if storage_key:
        try:
            db.storage.from_(settings.supabase_bucket).remove([storage_key])
        except Exception as e:
            logger.warning("Failed to delete storage file %s: %s", storage_key, e)

    # 5. Delete document record
    db.table("documents").delete().eq("id", doc_id).execute()

    return {"status": "deleted", "doc_id": doc_id}

