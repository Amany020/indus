"""
IndustryMind — Analytics / Dashboard API
GET /analytics/summary — Manager dashboard data
Time-to-resolution with sample size, status breakdown, language split, etc.
Missing feedback is NOT counted as resolved.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.auth import AuthUser, get_current_user, require_role
from app.core.authz import resolve_factory_id
from app.models.schemas import AnalyticsSummary

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
async def get_analytics(
    machine_id: Optional[str] = None,
    days: int = 7,
    language: Optional[str] = None,
    status: Optional[str] = None,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    factory_id = resolve_factory_id(user)

    # Base query filter
    query_base = db.table("queries").select("*").eq("factory_id", factory_id)
    if machine_id:
        query_base = query_base.eq("machine_id", machine_id)

    all_queries = query_base.order("created_at", desc=True).execute()
    rows = all_queries.data or []

    # Filter by language/status in Python (Supabase client has limited filtering)
    if language:
        rows = [r for r in rows if r.get("detected_language") == language]
    if status:
        rows = [r for r in rows if r.get("status") == status]

    total = len(rows)

    # Avg latency
    latencies = [r.get("latency_ms", 0) for r in rows if r.get("latency_ms")]
    avg_latency = sum(latencies) / max(len(latencies), 1)

    # Volume by day
    from collections import Counter
    day_counts: Counter = Counter()
    for r in rows:
        created = r.get("created_at", "")
        if created:
            day = created[:10]
            day_counts[day] += 1
    volume_by_day = [{"date": d, "count": c} for d, c in sorted(day_counts.items())]

    # Status breakdown
    status_counts: Counter = Counter()
    for r in rows:
        s = r.get("status", "unknown")
        status_counts[s] += 1

    # Language split
    lang_counts: Counter = Counter()
    for r in rows:
        lang = r.get("detected_language", "en")
        lang_counts[lang] += 1

    # Feedback counts
    feedback_counts: Counter = Counter()
    for r in rows:
        fb = r.get("feedback")
        if fb:
            feedback_counts[fb] += 1

    # Resolution breakdown
    resolution_counts: Counter = Counter()
    for r in rows:
        rs = r.get("resolution_status")
        if rs:
            resolution_counts[rs] += 1

    # Time to resolution (only from real resolved rows)
    from datetime import datetime
    resolved_times = []
    for r in rows:
        if r.get("resolution_status") == "resolved" and r.get("resolved_at") and r.get("created_at"):
            try:
                created = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
                resolved = datetime.fromisoformat(r["resolved_at"].replace("Z", "+00:00"))
                delta = (resolved - created).total_seconds() / 3600
                if delta >= 0:
                    resolved_times.append(delta)
            except (ValueError, TypeError):
                pass

    ttr_avg = sum(resolved_times) / max(len(resolved_times), 1) if resolved_times else None

    # Escalated count
    escalated = sum(1 for r in rows if r.get("was_escalated"))

    # Top escalated questions
    escalated_qs = [
        {"query_text": r.get("query_text", "")[:100], "query_id": r.get("id")}
        for r in rows if r.get("was_escalated")
    ][:10]

    # Recurring error codes
    from app.services.retrieval import extract_error_codes
    error_code_counts: Counter = Counter()
    for r in rows:
        codes = extract_error_codes(r.get("query_text", ""))
        for code in codes:
            error_code_counts[code.upper()] += 1
    recurring_codes = [
        {"code": code, "count": count}
        for code, count in error_code_counts.most_common(10)
    ]

    # Tips pipeline
    tips_result = db.table("tips").select("status").eq("factory_id", factory_id).execute()
    tip_counts: Counter = Counter()
    for t in (tips_result.data or []):
        tip_counts[t.get("status", "unknown")] += 1

    # Safety gate events count
    safety_result = db.table("safety_gate_events").select("id").eq(
        "factory_id", factory_id
    ).execute()
    safety_count = len(safety_result.data or [])

    return AnalyticsSummary(
        total_queries=total,
        avg_latency_ms=round(avg_latency, 1),
        volume_by_day=volume_by_day,
        status_breakdown=dict(status_counts),
        language_split=dict(lang_counts),
        feedback_counts=dict(feedback_counts),
        tip_pipeline=dict(tip_counts),
        escalated_count=escalated,
        resolution_breakdown=dict(resolution_counts),
        time_to_resolution_avg_hours=round(ttr_avg, 2) if ttr_avg is not None else None,
        resolution_sample_size=len(resolved_times),
        top_escalated_questions=escalated_qs,
        recurring_error_codes=recurring_codes,
        safety_gate_events_count=safety_count,
    )
