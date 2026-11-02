"""
IndustryMind — Machines API
GET /machines/, GET /machines/{id}, GET /machines/{id}/has-approved-docs
POST /machines/
"""

from __future__ import annotations

from fastapi import APIRouter, Header
from typing import List, Optional

from app.core.database import get_db
from app.core.config import settings
from app.models.schemas import MachineOut, MachineCreate

router = APIRouter(prefix="/machines", tags=["Machines"])


@router.get("/", response_model=List[MachineOut])
async def list_machines(
    factory_id: Optional[str] = None,
    x_role: str = Header("worker"),
):
    db = get_db()
    query = db.table("machines").select(
        "id, name, workcell, model_number, qr_code_value"
    )
    target_factory = factory_id or settings.default_factory_id
    if target_factory:
        query = query.eq("factory_id", target_factory)
    result = query.execute()
    return result.data or []



@router.get("/{machine_id}", response_model=MachineOut)
async def get_machine(machine_id: str, x_role: str = Header("worker")):
    db = get_db()
    result = db.table("machines").select(
        "id, name, workcell, model_number, qr_code_value"
    ).eq("id", machine_id).single().execute()
    return result.data


@router.get("/{machine_id}/has-approved-docs")
async def has_approved_docs(machine_id: str, x_role: str = Header("worker")):
    db = get_db()
    result = db.table("documents").select("id").eq(
        "machine_id", machine_id
    ).eq("approval_status", "approved").limit(1).execute()
    return {"has_docs": len(result.data or []) > 0}


@router.post("/", response_model=MachineOut)
async def create_machine(body: MachineCreate, x_role: str = Header("admin")):
    from app.models.schemas import check_role
    if not check_role(x_role, "admin"):
        from fastapi import HTTPException
        raise HTTPException(403, "Admin role required")

    db = get_db()
    result = db.table("machines").insert({
        "factory_id": settings.default_factory_id,
        "name": body.name,
        "workcell": body.workcell,
        "model_number": body.model_number,
    }).execute()
    return result.data[0]


# ── R5: QR Scanning ─────────────────────────────────────────────────────────

@router.post("/resolve-qr")
async def resolve_qr(body: dict, x_role: str = Header("worker")):
    """
    Resolve a QR code value to a machine.
    Feature-flagged: requires QR_SCAN_ENABLED=true.
    Body: {"qr_value": "string"}
    Returns: machine record or 404
    """
    from fastapi import HTTPException

    if not settings.qr_scan_enabled:
        raise HTTPException(
            status_code=501,
            detail="QR scanning not enabled (set QR_SCAN_ENABLED=true)",
        )

    qr_value = body.get("qr_value", "").strip()
    if not qr_value:
        raise HTTPException(status_code=400, detail="qr_value is required")

    db = get_db()
    result = (
        db.table("machines")
        .select("id, name, workcell, model_number, qr_code_value")
        .eq("factory_id", settings.default_factory_id)
        .eq("qr_code_value", qr_value)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail=f"No machine found with QR code: {qr_value}",
        )

    return result.data[0]

