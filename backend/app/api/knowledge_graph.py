"""
IndustryMind — Knowledge Graph API (R8)
Traverse machine entities, relationships, symptoms, procedures, and evidence.
Feature-flagged: requires KNOWLEDGE_GRAPH_ENABLED=true.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user, UserContext
from app.core.authz import resolve_factory_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge-graph", tags=["knowledge-graph"])


def _check_enabled():
    if not settings.knowledge_graph_enabled:
        raise HTTPException(
            status_code=501,
            detail="Knowledge graph is not enabled (set KNOWLEDGE_GRAPH_ENABLED=true)",
        )


@router.get("/entities")
async def list_entities(
    machine_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    user: UserContext = Depends(get_current_user),
):
    _check_enabled()
    db = get_db()
    query = (
        db.table("knowledge_entities")
        .select("*")
        .eq("factory_id", resolve_factory_id(user))
    )
    if machine_id:
        query = query.eq("machine_id", machine_id)
    if entity_type:
        query = query.eq("entity_type", entity_type)

    result = query.execute()
    return {"entities": result.data, "total": len(result.data)}


@router.get("/explore/{entity_id}")
async def explore_entity(
    entity_id: str,
    user: UserContext = Depends(get_current_user),
):
    """
    Traverse connected relationships and evidence for a specific knowledge entity.
    """
    _check_enabled()
    db = get_db()
    factory_id = resolve_factory_id(user)

    # Get root entity
    ent_res = (
        db.table("knowledge_entities")
        .select("*")
        .eq("id", entity_id)
        .eq("factory_id", factory_id)
        .execute()
    )
    if not ent_res.data:
        raise HTTPException(404, "Entity not found")
    entity = ent_res.data[0]

    # Get outward relationships
    rel_res = (
        db.table("knowledge_relationships")
        .select("*, target:knowledge_entities!target_entity_id(id, canonical_name, entity_type)")
        .eq("source_entity_id", entity_id)
        .eq("factory_id", factory_id)
        .execute()
    )

    relationships = rel_res.data or []

    # Get evidence for these relationships
    rel_ids = [r["id"] for r in relationships]
    evidence_map = {}
    if rel_ids:
        ev_res = (
            db.table("knowledge_evidence")
            .select("*, document:documents(id, title)")
            .in_("relationship_id", rel_ids)
            .execute()
        )
        for ev in (ev_res.data or []):
            evidence_map.setdefault(ev["relationship_id"], []).append(ev)

    for r in relationships:
        r["evidence"] = evidence_map.get(r["id"], [])

    return {
        "entity": entity,
        "connections": relationships,
    }
