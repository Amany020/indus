"""
IndustryMind — Machines API
GET /machines/, GET /machines/{id}, GET /machines/{id}/has-approved-docs
POST /machines/, POST /machines/resolve-qr
"""

from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.config import settings
from app.core.auth import AuthUser, get_current_user, require_role
from app.core.authz import resolve_factory_id
from app.models.schemas import MachineOut, MachineCreate

router = APIRouter(prefix="/machines", tags=["Machines"])


@router.get("/", response_model=List[MachineOut])
async def list_machines(
    factory_id: Optional[str] = None,
    user: AuthUser = Depends(get_current_user),
):
    target_factory = resolve_factory_id(user, requested_factory_id=factory_id)
    db = get_db()
    query = (
        db.table("machines")
        .select("id, name, workcell, model_number, qr_code_value")
        .eq("factory_id", target_factory)
    )
    result = query.execute()
    return result.data or []


@router.get("/{machine_id}", response_model=MachineOut)
async def get_machine(
    machine_id: str,
    user: AuthUser = Depends(get_current_user),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    result = (
        db.table("machines")
        .select("id, name, workcell, model_number, qr_code_value")
        .eq("id", machine_id)
        .eq("factory_id", factory_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Machine not found")
    return result.data[0]


@router.get("/{machine_id}/has-approved-docs")
async def has_approved_docs(
    machine_id: str,
    user: AuthUser = Depends(get_current_user),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    machine = (
        db.table("machines")
        .select("id")
        .eq("id", machine_id)
        .eq("factory_id", factory_id)
        .limit(1)
        .execute()
    )
    if not machine.data:
        raise HTTPException(status_code=404, detail="Machine not found")

    result = (
        db.table("documents")
        .select("id")
        .eq("machine_id", machine_id)
        .eq("factory_id", factory_id)
        .eq("approval_status", "approved")
        .limit(1)
        .execute()
    )
    return {"has_docs": len(result.data or []) > 0}


@router.post("/", response_model=MachineOut)
async def create_machine(
    body: MachineCreate,
    user: AuthUser = Depends(require_role("admin", "reviewer")),
):
    factory_id = resolve_factory_id(user)
    db = get_db()
    result = (
        db.table("machines")
        .insert({
            "factory_id": factory_id,
            "name": body.name,
            "workcell": body.workcell,
            "model_number": body.model_number,
        })
        .execute()
    )
    return result.data[0]


# ── R5: QR Scanning ─────────────────────────────────────────────────────────

@router.post("/resolve-qr")
async def resolve_qr(
    body: dict,
    user: AuthUser = Depends(get_current_user),
):
    """
    Resolve a QR code value to a machine.
    Feature-flagged: requires QR_SCAN_ENABLED=true.
    Body: {"qr_value": "string"}
    Returns: machine record or 404
    """
    if not settings.qr_scan_enabled:
        raise HTTPException(
            status_code=501,
            detail="QR scanning not enabled (set QR_SCAN_ENABLED=true)",
        )

    qr_value = body.get("qr_value", "").strip()
    if not qr_value:
        raise HTTPException(status_code=400, detail="qr_value is required")
    if len(qr_value) > 200:
        raise HTTPException(status_code=400, detail="qr_value exceeds maximum length of 200")

    factory_id = resolve_factory_id(user)
    db = get_db()
    result = (
        db.table("machines")
        .select("id, name, workcell, model_number, qr_code_value")
        .eq("factory_id", factory_id)
        .eq("qr_code_value", qr_value)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail=f"No machine found with QR code: {qr_value}",
        )

    return result.data[0]
