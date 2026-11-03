"""
IndustryMind — Pydantic Request/Response Models
Type hints for every API endpoint.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


from app.core.auth import normalize_role


# ─── Roles ───────────────────────────────────────────────────────────────────

VALID_ROLES = {"worker", "reviewer", "manager", "admin"}
ROLE_HIERARCHY = {"worker": 0, "reviewer": 1, "manager": 2, "admin": 3}


def check_role(role: str, minimum: str) -> bool:
    """Check if role meets minimum required level."""
    return ROLE_HIERARCHY.get(normalize_role(role), -1) >= ROLE_HIERARCHY.get(minimum, 99)


# ─── Machine ────────────────────────────────────────────────────────────────

class MachineOut(BaseModel):
    id: str
    name: str
    workcell: str
    model_number: Optional[str] = None
    qr_code_value: Optional[str] = None


class MachineCreate(BaseModel):
    name: str
    workcell: str = ""
    model_number: Optional[str] = None


# ─── Document ────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    filename: str
    doc_type: str
    revision: str
    status: str
    page_count: int
    owner: Optional[str] = None
    uploaded_at: Optional[str] = None
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None


# ─── Evidence ────────────────────────────────────────────────────────────────

class EvidenceMeta(BaseModel):
    evidence_id: str
    chunk_id: str
    document_id: str
    filename: str
    revision: str
    page_number: Optional[int] = None
    section_heading: Optional[str] = None
    content_type: str = "text"
    content_text: str = ""
    image_path: Optional[str] = None
    bbox: Optional[Dict[str, float]] = None
    risk_level: str = "none"
    similarity: float = 0.0


# ─── Query ───────────────────────────────────────────────────────────────────

class StepItem(BaseModel):
    order: int
    instruction: str
    evidence_ids: List[str] = []


class CitationItem(BaseModel):
    evidence_id: str


class ExpertTipOut(BaseModel):
    id: str
    tip_text: str
    submitted_by: str
    reviewed_at: Optional[str] = None


class QueryRequest(BaseModel):
    session_id: Optional[str] = None
    machine_id: str
    input_mode: str = "text"
    raw_transcript: Optional[str] = None
    query_text: str
    detected_language: str = "en"
    idempotency_key: Optional[str] = None
    transcript_confirmed: bool = False


class QueryResponse(BaseModel):
    query_id: str
    status: str  # supported | limited | escalate | restricted
    summary: str
    steps: List[StepItem] = []
    warnings: List[str] = []
    citations: List[CitationItem] = []
    visuals: List[str] = []
    next_action: str = ""
    evidence_pack: List[EvidenceMeta] = []
    expert_knowledge: List[ExpertTipOut] = []
    detected_language: str = "en"
    answer_language: str = "en"
    answer_en: Optional[str] = None
    translation_failed: bool = False
    latency_ms: int = 0
    demo_cached: bool = False


# ─── Feedback ────────────────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    resolution_status: Optional[str] = None  # resolved | not_resolved | still_working
    feedback: Optional[str] = None  # helpful | not_helpful


# ─── Voice / STT ─────────────────────────────────────────────────────────────

class TranscriptResponse(BaseModel):
    transcript: str
    detected_language: str = "en"
    avg_logprob: float = 0.0
    no_speech_prob: float = 0.0
    needs_review: bool = False


# ─── Tips ────────────────────────────────────────────────────────────────────

class TipCreate(BaseModel):
    machine_id: str
    submitted_by: str
    tip_text: str
    related_query_id: Optional[str] = None


class TipReview(BaseModel):
    status: str  # approved | rejected
    reviewer: str
    review_notes: Optional[str] = None


class TipOut(BaseModel):
    id: str
    machine_id: str
    submitted_by: str
    tip_text: str
    status: str
    reviewer: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[str] = None
    created_at: str


# ─── Escalation ──────────────────────────────────────────────────────────────

class EscalationOut(BaseModel):
    id: str
    query_id: str
    ai_drafted_brief: Optional[str] = None
    expert_edited_brief: Optional[str] = None
    priority: str = "normal"
    status: str = "open"
    assigned_to: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: str
    updated_at: str


class EscalationListItemOut(EscalationOut):
    machine_name: Optional[str] = None
    worker_name: Optional[str] = None


class EscalationDetailOut(EscalationListItemOut):
    question_text: Optional[str] = None
    ai_response: Optional[str] = None
    sources: List[str] = []
    image_url: Optional[str] = None


class EscalationUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    expert_edited_brief: Optional[str] = None
    resolution_notes: Optional[str] = None


# ─── Troubleshooting ────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    machine_id: str
    symptom_text: str


class TurnStepOut(BaseModel):
    step_order: int
    step_text: str
    ledger_category: str  # observed | source_backed | inferred | unknown | conflicting
    citations: List[Dict[str, Any]] = []
    needs_confirmation: bool = True


class SessionOut(BaseModel):
    id: str
    machine_id: str
    status: str
    symptom_text: Optional[str] = None
    created_at: str
    evidence_ledger: List[TurnStepOut] = []


class TurnRequest(BaseModel):
    input_text: Optional[str] = None
    confirmation: Optional[str] = None  # done | not_done | cant_check


class TurnResponse(BaseModel):
    session_status: str
    current_step: Optional[TurnStepOut] = None
    evidence_ledger: List[TurnStepOut] = []
    escalation_reason: Optional[str] = None


# ─── Analytics ───────────────────────────────────────────────────────────────

class AnalyticsSummary(BaseModel):
    total_queries: int = 0
    avg_latency_ms: float = 0
    volume_by_day: List[Dict[str, Any]] = []
    status_breakdown: Dict[str, int] = {}
    language_split: Dict[str, int] = {}
    feedback_counts: Dict[str, int] = {}
    tip_pipeline: Dict[str, int] = {}
    escalated_count: int = 0
    resolution_breakdown: Dict[str, int] = {}
    time_to_resolution_avg_hours: Optional[float] = None
    resolution_sample_size: int = 0
    top_escalated_questions: List[Dict[str, Any]] = []
    recurring_error_codes: List[Dict[str, Any]] = []
    safety_gate_events_count: int = 0


# ─── SOP Proposals ──────────────────────────────────────────────────────────

class ProposalOut(BaseModel):
    id: str
    factory_id: str
    machine_id: Optional[str] = None
    document_id: Optional[str] = None
    proposed_by: str
    title: str
    current_sop_step: Optional[str] = None
    proposed_addition: str
    safety_impact: Optional[str] = None
    status: str = "pending"
    reviewed_by: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: str
    updated_at: str
