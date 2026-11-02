"""
IndustryMind — Analytics / Dashboard API
GET /analytics/summary — Manager dashboard data
Time-to-resolution with sample size, status breakdown, language split, etc.
Missing feedback is NOT counted as resolved.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone, timedelta
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


@router.get("/breakdown")
async def get_analytics_breakdown(
    days: int = 30,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    db = get_db()
    factory_id = resolve_factory_id(user)

    days = max(1, min(days, 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # 1. Fetch queries within period (factory-scoped, capped at 5000)
    queries_res = (
        db.table("queries")
        .select(
            "id, query_text, machine_id, status, was_escalated, was_refused_unsafe, "
            "resolution_status, resolved_at, created_at"
        )
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(5000)
        .execute()
    )
    query_rows = queries_res.data or []

    # 2. Fetch escalation tickets within period (factory-scoped, capped at 5000)
    tickets_res = (
        db.table("escalation_tickets")
        .select("id, query_id, status, priority, created_at, resolved_at, assigned_expert_id")
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .limit(5000)
        .execute()
    )
    ticket_rows = tickets_res.data or []
    ticket_map = {t["query_id"]: t for t in ticket_rows if t.get("query_id")}

    missing_qids = [q["id"] for q in query_rows if q.get("was_escalated") and q["id"] not in ticket_map]
    if missing_qids:
        for i in range(0, len(missing_qids), 500):
            chunk = missing_qids[i : i + 500]
            extra_t_res = (
                db.table("escalation_tickets")
                .select("id, query_id, status, priority, created_at, resolved_at, assigned_expert_id")
                .eq("factory_id", factory_id)
                .in_("query_id", chunk)
                .limit(5000)
                .execute()
            )
            for t in extra_t_res.data or []:
                if t.get("query_id"):
                    ticket_map[t["query_id"]] = t

    # 3. Lookup machines for factory
    machines_res = (
        db.table("machines")
        .select("id, name, workcell, model_number")
        .eq("factory_id", factory_id)
        .limit(5000)
        .execute()
    )
    machines_data = machines_res.data or []
    machine_name_map = {m["id"]: m.get("name") or "Unnamed Machine" for m in machines_data}

    # 4. Classify each query
    solved_risky = 0
    solved_normal = 0
    unsolved_risky = 0
    unsolved_normal = 0

    priority_counts: Counter = Counter()
    machine_stats: dict[str, dict] = {}
    for m in machines_data:
        machine_stats[m["id"]] = {
            "machine_id": m["id"],
            "machine_name": m.get("name") or "Unnamed Machine",
            "total": 0,
            "solved": 0,
            "unsolved": 0,
            "risky": 0,
        }

    unassigned_stats = {
        "machine_id": "unassigned",
        "machine_name": "Unassigned / General",
        "total": 0,
        "solved": 0,
        "unsolved": 0,
        "risky": 0,
    }

    for q in query_rows:
        qid = q.get("id")
        ticket = ticket_map.get(qid)

        is_risky = bool(
            q.get("was_refused_unsafe")
            or q.get("status") == "restricted"
            or (ticket and str(ticket.get("priority", "")).lower() == "high")
        )

        is_unsafe_or_refused = bool(
            q.get("was_refused_unsafe")
            or q.get("status") == "restricted"
        )
        is_escalated = bool(
            q.get("was_escalated")
            or ticket is not None
        )

        if is_unsafe_or_refused:
            is_solved = False
        elif is_escalated:
            t_status = str(ticket.get("status", "")).lower() if ticket else ""
            q_res_status = str(q.get("resolution_status", "")).lower()
            if t_status in ("resolved", "closed") or q_res_status == "resolved":
                is_solved = True
            else:
                is_solved = False
        elif q.get("status") in ("supported", "answered"):
            is_solved = True
        else:
            is_solved = False

        if is_solved and is_risky:
            solved_risky += 1
        elif is_solved and not is_risky:
            solved_normal += 1
        elif not is_solved and is_risky:
            unsolved_risky += 1
        else:
            unsolved_normal += 1

        if ticket and ticket.get("priority"):
            p_val = str(ticket["priority"]).lower()
        elif is_risky:
            p_val = "high"
        else:
            p_val = "normal"
        priority_counts[p_val] += 1

        mid = q.get("machine_id")
        if mid and mid in machine_stats:
            m_target = machine_stats[mid]
        elif mid:
            if mid not in machine_stats:
                machine_stats[mid] = {
                    "machine_id": str(mid),
                    "machine_name": machine_name_map.get(mid, f"Machine {str(mid)[:8]}"),
                    "total": 0,
                    "solved": 0,
                    "unsolved": 0,
                    "risky": 0,
                }
            m_target = machine_stats[mid]
        else:
            m_target = unassigned_stats

        m_target["total"] += 1
        if is_solved:
            m_target["solved"] += 1
        else:
            m_target["unsolved"] += 1
        if is_risky:
            m_target["risky"] += 1

    total = len(query_rows)
    solved = solved_risky + solved_normal
    unsolved = unsolved_risky + unsolved_normal
    risky = solved_risky + unsolved_risky
    normal = solved_normal + unsolved_normal

    by_machine = list(machine_stats.values())
    if unassigned_stats["total"] > 0:
        by_machine.append(unassigned_stats)
    by_machine.sort(key=lambda x: x["total"], reverse=True)

    by_priority = [
        {"priority": p, "count": c}
        for p, c in priority_counts.most_common()
    ]

    definitions = {
        "solved": "Answered from approved evidence without escalation, or escalated and ticket resolved/closed.",
        "unsolved": "Safety-refused, insufficient evidence, or escalation ticket open/in-progress.",
        "risky": "Safety gate triggered on query, or linked escalation ticket has high priority.",
        "normal": "Queries where no safety gate triggered and ticket priority is not high."
    }

    return {
        "days": days,
        "total": total,
        "solved": solved,
        "unsolved": unsolved,
        "risky": risky,
        "normal": normal,
        "matrix": {
            "solved_risky": solved_risky,
            "solved_normal": solved_normal,
            "unsolved_risky": unsolved_risky,
            "unsolved_normal": unsolved_normal,
        },
        "by_priority": by_priority,
        "by_machine": by_machine,
        "definitions": definitions,
    }
