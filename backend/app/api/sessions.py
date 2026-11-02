"""
IndustryMind — Guided Troubleshooting API
POST /sessions/ (create), GET /sessions/{id}, POST /sessions/{id}/turn
Multi-turn: safety gate on every input, ONE step at a time, evidence ledger.
"""

from __future__ import annotations

import uuid
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.auth import AuthUser, get_current_user
from app.core.authz import resolve_factory_id
from app.models.schemas import (
    SessionCreate, SessionOut, TurnRequest, TurnResponse, TurnStepOut, check_role,
)
from app.services.safety_gate import check_safety_gate, get_refusal_message
from app.services.retrieval import hybrid_search
from app.services.gemini_client import generate_troubleshooting_step
from app.services.citation_validator import validate_answer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["Troubleshooting"])


@router.post("/", response_model=SessionOut)
async def create_session(body: SessionCreate, user: AuthUser = Depends(get_current_user)):
    # Safety gate on symptom
    is_safe, matched = check_safety_gate(body.symptom_text)
    if not is_safe:
        raise HTTPException(400, get_refusal_message())

    db = get_db()
    factory_id = resolve_factory_id(user)

    # Verify machine belongs to this factory
    machine = db.table("machines").select("id, name, factory_id").eq(
        "id", body.machine_id
    ).eq(
        "factory_id", factory_id
    ).limit(1).execute()
    if not machine.data:
        raise HTTPException(404, "Machine not found")

    session_id = str(uuid.uuid4())

    db.table("troubleshooting_sessions").insert({
        "id": session_id,
        "factory_id": factory_id,
        "user_id": user.user_id,
        "machine_id": body.machine_id,
        "symptom_text": body.symptom_text,
        "status": "active",
    }).execute()

    return SessionOut(
        id=session_id,
        machine_id=body.machine_id,
        status="active",
        symptom_text=body.symptom_text,
        created_at="",
    )


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, user: AuthUser = Depends(get_current_user)):
    db = get_db()
    factory_id = resolve_factory_id(user)
    result = db.table("troubleshooting_sessions").select("*").eq(
        "id", session_id
    ).eq(
        "factory_id", factory_id
    ).eq(
        "user_id", user.user_id
    ).limit(1).execute()
    if not result.data:
        raise HTTPException(404, "Session not found")

    steps_result = db.table("troubleshooting_steps").select("*").eq(
        "session_id", session_id
    ).order("step_order").execute()

    evidence_ledger = [
        TurnStepOut(
            step_order=s.get("step_order", 0),
            step_text=s.get("step_text", ""),
            ledger_category=s.get("ledger_category", "unknown"),
            citations=s.get("citations") or [],
            needs_confirmation=s.get("worker_confirmation") is None,
        )
        for s in (steps_result.data or [])
    ]

    session_row = result.data[0]
    return SessionOut(
        id=str(session_row["id"]),
        machine_id=str(session_row["machine_id"]),
        status=session_row.get("status", "active"),
        symptom_text=session_row.get("symptom_text"),
        created_at=str(session_row.get("created_at", "")),
        evidence_ledger=evidence_ledger,
    )


@router.post("/{session_id}/turn", response_model=TurnResponse)
async def session_turn(
    session_id: str,
    body: TurnRequest,
    user: AuthUser = Depends(get_current_user),
):
    db = get_db()
    factory_id = resolve_factory_id(user)

    # Get session
    session = db.table("troubleshooting_sessions").select("*").eq(
        "id", session_id
    ).eq(
        "factory_id", factory_id
    ).eq(
        "user_id", user.user_id
    ).limit(1).execute()
    if not session.data:
        raise HTTPException(404, "Session not found")
    if session.data[0]["status"] != "active":
        raise HTTPException(400, "Session is not active")

    sess = session.data[0]

    # Safety gate on free-text input
    if body.input_text:
        is_safe, matched = check_safety_gate(body.input_text)
        if not is_safe:
            return TurnResponse(
                session_status="active",
                escalation_reason=get_refusal_message(),
            )

    # Get previous steps
    prev_steps = db.table("troubleshooting_steps").select("*").eq(
        "session_id", session_id
    ).order("step_order").execute()
    prev = prev_steps.data or []

    # If confirmation provided, update the last step
    if body.confirmation and prev:
        last_step = prev[-1]
        db.table("troubleshooting_steps").update({
            "worker_confirmation": body.confirmation,
        }).eq("id", last_step["id"]).execute()

        # If "not_done" or "cant_check", might need to escalate
        if body.confirmation == "cant_check":
            # Mark as step with unknown category
            pass
        elif body.confirmation == "not_done":
            # Re-evaluate — the expected condition wasn't met
            pass

    # Retrieve evidence for the symptom
    evidence = hybrid_search(
        sess["symptom_text"] + (" " + (body.input_text or "")),
        sess["machine_id"],
        top_k=8,
    )

    if not evidence:
        # Escalate — no evidence
        db.table("troubleshooting_sessions").update({
            "status": "escalated",
        }).eq("id", session_id).execute()

        return TurnResponse(
            session_status="escalated",
            evidence_ledger=[TurnStepOut(
                step_order=s.get("step_order", 0),
                step_text=s.get("step_text", ""),
                ledger_category=s.get("ledger_category", "unknown"),
                citations=s.get("citations") or [],
                needs_confirmation=False,
            ) for s in prev],
            escalation_reason="Insufficient evidence in approved manuals for troubleshooting",
        )

    # Generate next step
    evidence_for_llm = [{
        "evidence_id": r.get("evidence_id", ""),
        "content_text": r.get("content_text", ""),
        "page_number": r.get("page_number"),
        "filename": r.get("filename", ""),
    } for r in evidence]

    try:
        step_data = generate_troubleshooting_step(
            sess["symptom_text"],
            prev,
            evidence_for_llm,
        )
    except Exception as e:
        logger.error("Troubleshooting step generation failed: %s", e)
        return TurnResponse(
            session_status="escalated",
            escalation_reason=f"Step generation failed: {e}",
        )

    evidence_by_id = {e["evidence_id"]: e for e in evidence_for_llm if e.get("evidence_id")}
    step_citations = []
    for eid in step_data.get("evidence_ids", []):
        match = evidence_by_id.get(eid)
        if match:
            step_citations.append({
                "evidence_id": eid,
                "filename": match.get("filename", ""),
                "page_number": match.get("page_number"),
                "content_text": (match.get("content_text") or "")[:200],
            })

    # Check if should escalate
    if step_data.get("should_escalate"):
        db.table("troubleshooting_sessions").update({
            "status": "escalated",
        }).eq("id", session_id).execute()

        return TurnResponse(
            session_status="escalated",
            evidence_ledger=[TurnStepOut(
                step_order=s.get("step_order", 0),
                step_text=s.get("step_text", ""),
                ledger_category=s.get("ledger_category", "unknown"),
                citations=s.get("citations") or [],
                needs_confirmation=False,
            ) for s in prev],
            escalation_reason=step_data.get("escalation_reason", "Insufficient evidence"),
        )

    # Insert new step
    new_order = len(prev) + 1
    new_step_id = str(uuid.uuid4())
    db.table("troubleshooting_steps").insert({
        "id": new_step_id,
        "session_id": session_id,
        "step_order": new_order,
        "step_text": step_data.get("step_text", ""),
        "evidence_ids": step_data.get("evidence_ids", []),
        "ledger_category": step_data.get("ledger_category", "unknown"),
        "citations": step_citations,
    }).execute()

    # Build evidence ledger
    all_steps = prev + [{
        "step_order": new_order,
        "step_text": step_data.get("step_text", ""),
        "ledger_category": step_data.get("ledger_category", "unknown"),
        "citations": step_citations,
    }]

    ledger = [TurnStepOut(
        step_order=s.get("step_order", 0),
        step_text=s.get("step_text", ""),
        ledger_category=s.get("ledger_category", "unknown"),
        citations=s.get("citations") or [],
        needs_confirmation=s.get("worker_confirmation") is None,
    ) for s in all_steps]

    current = TurnStepOut(
        step_order=new_order,
        step_text=step_data.get("step_text", ""),
        ledger_category=step_data.get("ledger_category", "unknown"),
        citations=step_citations,
        needs_confirmation=True,
    )

    return TurnResponse(
        session_status="active",
        current_step=current,
        evidence_ledger=ledger,
    )
