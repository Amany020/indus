"""
IndustryMind — Factories & Branches API
Endpoints for creating and listing factories and branches.
"""

from __future__ import annotations

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Factories & Branches"])


class FactoryCreate(BaseModel):
    name: str


class BranchCreate(BaseModel):
    name: str
    factory_id: str


@router.get("/factories/")
async def list_factories():
    db = get_db()
    result = db.table("factories").select("*").order("name").execute()
    return result.data or []


@router.post("/factories/")
async def create_factory(body: FactoryCreate):
    db = get_db()
    factory_id = str(uuid.uuid4())
    result = db.table("factories").insert({
        "id": factory_id,
        "name": body.name,
    }).execute()
    return result.data[0] if result.data else {"id": factory_id, "name": body.name}


@router.get("/branches/")
async def list_branches(factory_id: Optional[str] = None):
    db = get_db()
    query = db.table("branches").select("*")
    if factory_id:
        query = query.eq("factory_id", factory_id)
    result = query.order("name").execute()
    return result.data or []


@router.post("/branches/")
async def create_branch(body: BranchCreate):
    db = get_db()
    branch_id = str(uuid.uuid4())
    result = db.table("branches").insert({
        "id": branch_id,
        "factory_id": body.factory_id,
        "name": body.name,
    }).execute()
    return result.data[0] if result.data else {"id": branch_id, "name": body.name, "factory_id": body.factory_id}


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str):
    db = get_db()
    existing = db.table("branches").select("id").eq("id", branch_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Branch not found")

    dependent_tables = ["machines", "memberships", "queries", "escalation_contacts"]
    for table in dependent_tables:
        check = db.table(table).select("branch_id").eq("branch_id", branch_id).limit(1).execute()
        if check.data:
            logger.warning("Delete branch blocked: branch_id %s is referenced in table %s", branch_id, table)
            raise HTTPException(
                status_code=409,
                detail="Branch is in use and cannot be deleted. Reassign or remove dependent machines, memberships, queries, or escalation contacts first.",
            )

    db.table("branches").delete().eq("id", branch_id).execute()
    logger.info("Branch deleted successfully: branch_id %s", branch_id)
    return {"status": "success", "message": "Branch deleted"}

