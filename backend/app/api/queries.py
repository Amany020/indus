"""
IndustryMind — Query API
POST /query/ — The main query pipeline
POST /query/{id}/feedback — Resolution feedback
GET /evidence/{chunk_id}

Pipeline order (mandatory):
machine tenancy check → safety gate → demo cache check → hybrid retrieval → abstention gate →
grounded Gemini JSON answer → citation/number validation (retry max 2) →
status label → log
"""

from __future__ import annotations

import time
import uuid
import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile

from app.core.database import get_db
from app.core.config import settings
from app.core.auth import AuthUser, get_current_user
from app.core.authz import resolve_factory_id
from app.models.schemas import (
    QueryRequest, QueryResponse, StepItem, CitationItem,
    EvidenceMeta, ExpertTipOut, FeedbackRequest,
)
from app.services.safety_gate import check_safety_gate, get_refusal_message, get_rule_version
from app.services.demo_cache import check_demo_cache
from app.services.retrieval import hybrid_search, hybrid_search_by_factory, get_best_similarity
from app.services.gemini_client import (
    generate_grounded_answer,
    generate_grounded_answer_with_image,
    generate_escalation_brief,
)
from app.services.citation_validator import validate_answer
from app.services.translation import (
    resolve_language,
    needs_translation_in,
    translate_to_english,
    translate_from_english,
    get_fixed_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Query"])


@router.post("/query/", response_model=QueryResponse)
async def run_query(
    body: QueryRequest,
    user: AuthUser = Depends(get_current_user),
):
    return await _execute_query(body, user, image_bytes=None, image_mime_type=None)


@router.post("/query/image", response_model=QueryResponse)
async def run_image_query(
    query_text: str = Form(...),
    image: UploadFile = File(...),
    detected_language: str = Form("en"),
    session_id: str = Form(None),
    machine_id: str = Form(...),
    user: AuthUser = Depends(get_current_user),
):
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if not image.content_type or image.content_type.lower() not in allowed_types:
        raise HTTPException(400, "Unsupported image type")

    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large, max 10MB")

    body = QueryRequest(
        machine_id=machine_id,
        query_text=query_text,
        session_id=session_id,
        input_mode="image",
        detected_language=detected_language,
        transcript_confirmed=True,
    )

    response = await _execute_query(
        body=body,
        user=user,
        image_bytes=image_bytes,
        image_mime_type=image.content_type,
    )

    try:
        db = get_db()
        safe_filename = image.filename or "image.jpg"
        storage_key = f"query-images/{response.query_id}/{safe_filename}"
        db.storage.from_(settings.supabase_bucket).upload(
            storage_key,
            image_bytes,
            {"content-type": image.content_type or "image/jpeg"},
        )
        db.table("queries").update(
            {"image_storage_key": storage_key}
        ).eq("id", response.query_id).execute()
    except Exception as e:
        logger.warning("Failed to store query image: %s", e)

    return response


async def _execute_query(
    body: QueryRequest,
    user: AuthUser,
    image_bytes: bytes = None,
    image_mime_type: str = None,
):
    start = time.time()
    db = get_db()
    query_id = str(uuid.uuid4())
    factory_id = resolve_factory_id(user)

    # Resolve target language from worker selection
    answer_lang = resolve_language(body.detected_language)
    original_query_text = body.query_text
    english_query_text = original_query_text

    # ── Step 1: Machine Tenancy Check ───────────────────────────────────
    machine = db.table("machines").select("id, name").eq(
        "id", body.machine_id
    ).eq(
        "factory_id", factory_id
    ).limit(1).execute()
    if not machine.data:
        raise HTTPException(404, "Machine not found")

    if body.input_mode == "voice" and not body.transcript_confirmed:
        raise HTTPException(
            status_code=400,
            detail="Voice queries require transcript confirmation before submission. Please confirm the transcribed text first.",
        )

    # ── Language Inbound: Translate question to English if needed ────────
    if needs_translation_in(original_query_text, answer_lang):
        trans_q, ok = await translate_to_english(original_query_text, source_lang=answer_lang)
        if ok and trans_q:
            english_query_text = trans_q

    # ── Step 2: Safety Gate (BEFORE retrieval and generation) ────────────
    is_safe, matched_pattern = check_safety_gate(english_query_text)
    if is_safe and english_query_text != original_query_text:
        is_safe_orig, matched_orig = check_safety_gate(original_query_text)
        if not is_safe_orig:
            is_safe = False
            matched_pattern = matched_orig

    if not is_safe:
        # Log safety gate event
        db.table("safety_gate_events").insert({
            "factory_id": factory_id,
            "query_text": original_query_text[:500],
            "matched_pattern": matched_pattern,
            "rule_version": get_rule_version(),
            "action_taken": "refused",
        }).execute()

        refusal = get_fixed_message("refusal", answer_lang)
        latency = int((time.time() - start) * 1000)

        # Log the query with original question
        db.table("queries").insert({
            "id": query_id,
            "factory_id": factory_id,
            "user_id": user.user_id,
            "branch_id": user.branch_id,
            "machine_id": body.machine_id,
            "session_id": body.session_id,
            "input_mode": body.input_mode,
            "raw_transcript": body.raw_transcript,
            "query_text": original_query_text,
            "query_language": body.detected_language,
            "response_summary": refusal,
            "status": "restricted",
            "was_refused_unsafe": True,
            "latency_ms": latency,
            "detected_language": body.detected_language,
            "idempotency_key": body.idempotency_key,
        }).execute()

        return QueryResponse(
            query_id=query_id,
            status="restricted",
            summary=refusal,
            latency_ms=latency,
            detected_language=body.detected_language,
            answer_language=answer_lang,
            answer_en=None,
            translation_failed=False,
        )

    # ── Step 3: Demo Cache Check ────────────────────────────────────────
    cached = check_demo_cache(english_query_text) or check_demo_cache(original_query_text)
    if cached:
        latency = int((time.time() - start) * 1000)

        evidence_pack = [EvidenceMeta(**e) for e in cached["evidence_pack"]]
        steps = [StepItem(**s) for s in cached["steps"]]
        citations = [CitationItem(evidence_id=e.evidence_id) for e in evidence_pack]

        cached_summary = cached["summary"]
        cached_summary_en = cached_summary
        demo_trans_failed = False

        if answer_lang != "en":
            t_sum, t_ok = await translate_from_english(cached_summary, answer_lang)
            if t_ok:
                cached_summary = t_sum
                new_steps = []
                for s in steps:
                    s_tr, s_ok = await translate_from_english(s.instruction, answer_lang)
                    new_steps.append(StepItem(
                        order=s.order,
                        instruction=s_tr if s_ok else s.instruction,
                        evidence_ids=s.evidence_ids,
                    ))
                steps = new_steps
            else:
                demo_trans_failed = True

        db.table("queries").insert({
            "id": query_id,
            "factory_id": factory_id,
            "user_id": user.user_id,
            "branch_id": user.branch_id,
            "machine_id": body.machine_id,
            "session_id": body.session_id,
            "input_mode": body.input_mode,
            "raw_transcript": body.raw_transcript,
            "query_text": original_query_text,
            "query_language": body.detected_language,
            "response_summary": cached_summary,
            "status": cached["status"],
            "steps": [s.model_dump() for s in steps],
            "warnings": cached.get("warnings", []),
            "evidence_pack": [e.model_dump() for e in evidence_pack],
            "latency_ms": latency,
            "detected_language": body.detected_language,
            "demo_cached": True,
            "idempotency_key": body.idempotency_key,
        }).execute()

        return QueryResponse(
            query_id=query_id,
            status=cached["status"],
            summary=cached_summary,
            steps=steps,
            warnings=cached.get("warnings", []),
            citations=citations,
            evidence_pack=evidence_pack,
            detected_language=body.detected_language,
            answer_language=answer_lang,
            answer_en=cached_summary_en if (answer_lang != "en" and not demo_trans_failed) else None,
            translation_failed=demo_trans_failed,
            latency_ms=latency,
            demo_cached=True,
        )

    # ── Step 4: Hybrid Retrieval ────────────────────────────────────────
    factory_id = resolve_factory_id(user)
    results = hybrid_search_by_factory(english_query_text, factory_id, top_k=10)
    best_sim = get_best_similarity(results)

    # ── Step 5: Abstention Gate ─────────────────────────────────────────
    if best_sim < settings.min_sim or len(results) == 0:
        latency = int((time.time() - start) * 1000)

        baseline = db.table("safety_baseline_library").select(
            "statement_text, category"
        ).eq("status", "approved").execute()
        baseline_texts = [b["statement_text"] for b in (baseline.data or [])]

        summary = get_fixed_message("insufficient_evidence", answer_lang)
        if baseline_texts:
            summary += "\n\n" + get_fixed_message("safety_baseline_header", answer_lang) + "\n"
            summary += "\n".join(f"• {t}" for t in baseline_texts[:3])

        try:
            brief = generate_escalation_brief(english_query_text, results)
        except Exception:
            brief = f"ESCALATION BRIEF (AI-DRAFTED)\nQuestion: {original_query_text}\nEvidence: Insufficient"

        db.table("escalation_tickets").insert({
            "factory_id": factory_id,
            "query_id": query_id,
            "ai_drafted_brief": brief,
            "priority": "normal",
        }).execute()

        db.table("queries").insert({
            "id": query_id,
            "factory_id": factory_id,
            "user_id": user.user_id,
            "branch_id": user.branch_id,
            "machine_id": body.machine_id,
            "session_id": body.session_id,
            "input_mode": body.input_mode,
            "raw_transcript": body.raw_transcript,
            "query_text": original_query_text,
            "query_language": body.detected_language,
            "response_summary": summary,
            "status": "escalate",
            "was_escalated": True,
            "latency_ms": latency,
            "detected_language": body.detected_language,
            "idempotency_key": body.idempotency_key,
        }).execute()

        return QueryResponse(
            query_id=query_id,
            status="escalate",
            summary=summary,
            warnings=[get_fixed_message("insufficient_evidence_warning", answer_lang)],
            next_action="contact_supervisor",
            detected_language=body.detected_language,
            answer_language=answer_lang,
            answer_en=None,
            translation_failed=False,
            latency_ms=latency,
        )

    # ── Step 6: Grounded Gemini JSON Answer (in English for validation) ──
    evidence_for_llm = [
        {
            "evidence_id": r.get("evidence_id", ""),
            "content_text": r.get("content_text", ""),
            "page_number": r.get("page_number"),
            "filename": r.get("filename", ""),
            "risk_level": r.get("risk_level", "none"),
        }
        for r in results
    ]

    answer = None
    validation = None
    for attempt in range(settings.max_validation_retries + 1):
        try:
            if image_bytes is not None:
                answer = generate_grounded_answer_with_image(
                    query_text=english_query_text,
                    image_bytes=image_bytes,
                    image_mime_type=image_mime_type,
                    evidence_chunks=evidence_for_llm,
                    detected_language="en",
                )
            else:
                answer = generate_grounded_answer(
                    english_query_text, evidence_for_llm, detected_language="en"
                )
        except Exception as e:
            logger.error("Gemini generation failed (attempt %d): %s", attempt + 1, e)
            continue

        # ── Step 7: Citation and Number/Unit Validation ─────────────
        steps_raw = answer.get("steps", [])
        validation = validate_answer(
            answer.get("summary", ""),
            steps_raw,
            results,
        )

        if validation["passed"]:
            break
        elif attempt < settings.max_validation_retries:
            logger.warning(
                "Validation failed (attempt %d), retrying: %s",
                attempt + 1, validation["vetoes"],
            )

    # ── Step 8: Status Label ────────────────────────────────────
    status_rec = (answer.get("status_recommendation") or "").strip().lower() if answer else None
    is_grounded_answer = True

    if answer is None:
        status = "escalate"
        summary = get_fixed_message("generation_failed", answer_lang)
        steps_out = []
        warnings = [get_fixed_message("generation_failed_warning", answer_lang)]
        is_grounded_answer = False
    elif validation and not validation["passed"]:
        if validation["should_escalate"]:
            status = "escalate"
        else:
            status = "limited"
        summary = answer.get("summary", "")
        steps_out = answer.get("steps", [])
        warnings = answer.get("warnings", []) + [
            f"Validation issue: {v}" for v in (validation or {}).get("vetoes", [])
        ]
    elif answer.get("conflict_detected"):
        status = "escalate"
        summary = answer.get("summary", "")
        steps_out = answer.get("steps", [])
        warnings = answer.get("warnings", [])
        if answer.get("conflict_description"):
            warnings.append(f"Source conflict: {answer['conflict_description']}")
    elif status_rec == "insufficient":
        status = "escalate"
        summary = get_fixed_message("manual_missing_info", answer_lang)
        steps_out = []
        warnings = answer.get("warnings", [])
        is_grounded_answer = False
    elif status_rec == "supported":
        status = "supported"
        summary = answer.get("summary", "")
        steps_out = answer.get("steps", [])
        warnings = answer.get("warnings", [])
    elif status_rec == "limited":
        status = "limited"
        summary = answer.get("summary", "")
        steps_out = answer.get("steps", [])
        warnings = answer.get("warnings", [])
    elif status_rec == "escalate":
        status = "escalate"
        summary = answer.get("summary", "")
        steps_out = answer.get("steps", [])
        warnings = answer.get("warnings", [])
    elif best_sim < settings.high_sim:
        status = "limited"
        summary = answer.get("summary", "")
        steps_out = answer.get("steps", [])
        warnings = answer.get("warnings", [])
    else:
        status = "supported"
        summary = answer.get("summary", "")
        steps_out = answer.get("steps", [])
        warnings = answer.get("warnings", [])

    # Build response objects
    steps = [StepItem(
        order=s.get("order", i + 1),
        instruction=s.get("instruction", ""),
        evidence_ids=s.get("evidence_ids", []),
    ) for i, s in enumerate(steps_out)]

    evidence_pack = [EvidenceMeta(
        evidence_id=r.get("evidence_id", ""),
        chunk_id=str(r.get("id", "")),
        document_id=str(r.get("document_id", "")),
        filename=r.get("filename", ""),
        revision=r.get("revision", ""),
        page_number=r.get("page_number"),
        section_heading=r.get("section_heading"),
        content_type=r.get("chunk_type", "text"),
        content_text=r.get("content_text", "")[:500],
        bbox=r.get("bbox"),
        risk_level=r.get("risk_level", "none"),
        similarity=r.get("similarity", 0.0),
    ) for r in results[:10]]

    # Union of evidence_ids actually referenced in steps
    step_evidence_ids = []
    seen_eids = set()
    for s in (steps_out or []):
        for eid in s.get("evidence_ids", []):
            if eid and eid not in seen_eids:
                seen_eids.add(eid)
                step_evidence_ids.append(eid)

    if status_rec == "insufficient":
        citations = []
    elif status_rec in ("supported", "limited") and not step_evidence_ids:
        citations = [CitationItem(evidence_id=e.evidence_id) for e in evidence_pack if e.evidence_id]
    elif step_evidence_ids:
        citations = [CitationItem(evidence_id=eid) for eid in step_evidence_ids]
    elif not status_rec and not step_evidence_ids and status in ("supported", "limited"):
        citations = [CitationItem(evidence_id=e.evidence_id) for e in evidence_pack if e.evidence_id]
    else:
        citations = []

    # High-risk evidence forces visible warning banner
    high_risk = []
    if citations:
        cited_ids = {c.evidence_id for c in citations}
        high_risk = [
            e for e in evidence_pack
            if e.evidence_id in cited_ids and e.risk_level in ("hazardous", "caution")
        ]
        if high_risk and not any("safety" in w.lower() or "risk" in w.lower() for w in warnings):
            risk_docs = ", ".join(set(f"{e.filename} p.{e.page_number}" for e in high_risk))
            warnings.insert(0, f"High-risk content referenced: {risk_docs}. Follow all safety procedures.")

    # Get approved expert tips for this machine
    expert_tips = []
    try:
        tips_result = db.table("tips").select("id, tip_text, submitted_by, reviewed_at").eq(
            "machine_id", body.machine_id
        ).eq("factory_id", factory_id).eq("status", "approved").execute()
        expert_tips = [ExpertTipOut(
            id=t["id"],
            tip_text=t["tip_text"],
            submitted_by=t["submitted_by"],
            reviewed_at=t.get("reviewed_at"),
        ) for t in (tips_result.data or [])]
    except Exception as tips_err:
        logger.warning("Failed to load approved tips for machine %s: %s", body.machine_id, tips_err)

    # ── Language Outbound: Translate grounded answer if needed ──────────
    summary_en = summary
    answer_en = None
    translation_failed = False

    if answer_lang != "en" and is_grounded_answer:
        trans_sum, s_ok = await translate_from_english(summary_en, answer_lang)
        if s_ok:
            summary = trans_sum
            answer_en = summary_en
            translated_steps = []
            for s in steps:
                s_tr, inst_ok = await translate_from_english(s.instruction, answer_lang)
                translated_steps.append(StepItem(
                    order=s.order,
                    instruction=s_tr if inst_ok else s.instruction,
                    evidence_ids=s.evidence_ids,
                ))
            steps = translated_steps
        else:
            summary = summary_en
            answer_en = None
            translation_failed = True

    latency = int((time.time() - start) * 1000)

    # ── Step 9: Log ─────────────────────────────────────────────────────
    db.table("queries").insert({
        "id": query_id,
        "factory_id": factory_id,
        "user_id": user.user_id,
        "branch_id": user.branch_id,
        "machine_id": body.machine_id,
        "session_id": body.session_id,
        "input_mode": body.input_mode,
        "raw_transcript": body.raw_transcript,
        "query_text": original_query_text,
        "query_language": body.detected_language,
        "response_summary": summary,
        "status": status,
        "steps": [s.model_dump() for s in steps],
        "warnings": warnings,
        "evidence_pack": [e.model_dump() for e in evidence_pack],
        "expert_tips": [t.model_dump() for t in expert_tips],
        "was_escalated": status == "escalate",
        "latency_ms": latency,
        "detected_language": body.detected_language,
        "idempotency_key": body.idempotency_key,
    }).execute()

    for i, cit in enumerate(citations):
        ev = next((e for e in evidence_pack if e.evidence_id == cit.evidence_id), None)
        db.table("query_citations").insert({
            "query_id": query_id,
            "chunk_id": ev.chunk_id if ev else "",
            "citation_order": i,
            "page_number": ev.page_number if ev else None,
        }).execute()

    if status == "escalate":
        try:
            brief = generate_escalation_brief(english_query_text, evidence_for_llm)
        except Exception:
            brief = f"ESCALATION BRIEF (AI-DRAFTED)\nQuestion: {original_query_text}"

        db.table("escalation_tickets").insert({
            "factory_id": factory_id,
            "query_id": query_id,
            "ai_drafted_brief": brief,
            "priority": "high" if high_risk else "normal",
        }).execute()

    return QueryResponse(
        query_id=query_id,
        status=status,
        summary=summary,
        steps=steps,
        warnings=warnings,
        citations=citations,
        evidence_pack=evidence_pack,
        expert_knowledge=expert_tips,
        detected_language=body.detected_language,
        answer_language=answer_lang,
        answer_en=answer_en,
        translation_failed=translation_failed,
        latency_ms=latency,
    )


@router.post("/query/{query_id}/feedback")
async def submit_feedback(
    query_id: str,
    feedback: Optional[str] = None,
    resolution_status: Optional[str] = None,
    user: AuthUser = Depends(get_current_user),
):
    db = get_db()
    factory_id = resolve_factory_id(user)
    update: dict = {}

    if feedback:
        update["feedback"] = feedback
    if resolution_status:
        if resolution_status not in ("resolved", "not_resolved", "still_working"):
            raise HTTPException(400, "Invalid resolution_status")
        update["resolution_status"] = resolution_status
        if resolution_status == "resolved":
            update["resolved_at"] = datetime.now(timezone.utc).isoformat()

    if update:
        res = (
            db.table("queries")
            .update(update)
            .eq("id", query_id)
            .eq("factory_id", factory_id)
            .eq("user_id", user.user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Query not found")

    return {"status": "ok"}


@router.get("/evidence/{chunk_id}")
async def get_evidence(chunk_id: str, user: AuthUser = Depends(get_current_user)):
    db = get_db()
    factory_id = resolve_factory_id(user)
    result = db.table("document_chunks").select(
        "id, document_id, chunk_type, content_text, image_storage_key, "
        "page_number, revision, bbox, risk_level, section_heading"
    ).eq("id", chunk_id).eq("approval_status", "approved").limit(1).execute()

    if not result.data:
        raise HTTPException(404, "Evidence not found or not approved")

    chunk = result.data[0]
    doc = db.table("documents").select("filename, revision").eq(
        "id", chunk["document_id"]
    ).eq("factory_id", factory_id).limit(1).execute()

    if not doc.data:
        raise HTTPException(404, "Evidence not found or not approved")

    doc_data = doc.data[0]

    return {
        **chunk,
        "filename": doc_data.get("filename", "unknown"),
        "doc_revision": doc_data.get("revision", "?"),
    }


@router.get("/query/history")
async def get_query_history(
    session_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    user: AuthUser = Depends(get_current_user),
):
    """
    Returns only the queries for the current worker's session and machine.
    Ensures queries typed by the worker are NOT seen by other users/workers,
    while remaining fully visible to this worker with responses and evidence.
    """
    if not session_id:
        return []

    db = get_db()
    factory_id = resolve_factory_id(user)
    query = (
        db.table("queries")
        .select(
            "id, query_text, response_summary, status, steps, warnings, evidence_pack, expert_tips, latency_ms, created_at, machine_id, session_id"
        )
        .eq("session_id", session_id)
        .eq("factory_id", factory_id)
        .eq("user_id", user.user_id)
    )

    if machine_id:
        query = query.eq("machine_id", machine_id)

    result = query.order("created_at", desc=False).execute()
    return result.data or []
