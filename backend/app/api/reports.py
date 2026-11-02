"""
IndustryMind — Reports API
GET /reports/escalations.csv — Escalation tickets CSV export
GET /reports/analytics.csv — Analytics summary and query volume CSV export
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Response

from app.core.auth import AuthUser, require_role
from app.core.authz import resolve_factory_id
from app.core.database import get_db
from app.api.analytics import get_analytics
import html
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


def sanitize_cell(value: Any) -> str:
    """
    Sanitize text to prevent spreadsheet formula injection.
    Prefixes a single quote if the string begins with =, +, -, or @.
    """
    if value is None:
        return ""
    val_str = str(value)
    if val_str and val_str[0] in ("=", "+", "-", "@"):
        return "'" + val_str
    return val_str


@router.get("/escalations.csv")
async def export_escalations_csv(
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    factory_id = resolve_factory_id(user)
    db = get_db()

    # 1. Fetch tickets (capped at 5000, newest first, factory-scoped)
    # Exclude ai_drafted_brief and secrets
    tickets_res = (
        db.table("escalation_tickets")
        .select("id, query_id, status, priority, created_at, resolved_at, assigned_expert_id")
        .eq("factory_id", factory_id)
        .order("created_at", desc=True)
        .limit(5000)
        .execute()
    )
    tickets = tickets_res.data or []

    # 2. Batch fetch question texts from queries (factory-scoped)
    q_ids = list({t["query_id"] for t in tickets if t.get("query_id")})
    query_map = {}
    if q_ids:
        for i in range(0, len(q_ids), 500):
            chunk = q_ids[i : i + 500]
            q_res = (
                db.table("queries")
                .select("id, query_text")
                .eq("factory_id", factory_id)
                .in_("id", chunk)
                .execute()
            )
            for q in q_res.data or []:
                query_map[q["id"]] = q.get("query_text") or ""

    # 3. Batch count replies per ticket from escalation_replies (factory-scoped)
    t_ids = [t["id"] for t in tickets if t.get("id")]
    reply_counts = {}
    if t_ids:
        for i in range(0, len(t_ids), 500):
            chunk = t_ids[i : i + 500]
            r_res = (
                db.table("escalation_replies")
                .select("ticket_id")
                .eq("factory_id", factory_id)
                .in_("ticket_id", chunk)
                .execute()
            )
            for r in r_res.data or []:
                tid = r.get("ticket_id")
                if tid:
                    reply_counts[tid] = reply_counts.get(tid, 0) + 1

    # 4. Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ticket_id",
        "created_at",
        "status",
        "priority",
        "question",
        "assigned_expert_id",
        "resolved_at",
        "hours_to_resolve",
        "reply_count",
    ])

    for t in tickets:
        created_at_val = t.get("created_at") or ""
        resolved_at_val = t.get("resolved_at") or ""
        hours_str = ""
        if resolved_at_val and created_at_val:
            try:
                c_dt = datetime.fromisoformat(created_at_val.replace("Z", "+00:00"))
                r_dt = datetime.fromisoformat(resolved_at_val.replace("Z", "+00:00"))
                diff_hours = (r_dt - c_dt).total_seconds() / 3600.0
                if diff_hours >= 0:
                    hours_str = f"{diff_hours:.2f}"
            except (ValueError, TypeError):
                hours_str = ""

        q_text = query_map.get(t.get("query_id"), "")
        r_count = reply_counts.get(t.get("id"), 0)

        writer.writerow([
            sanitize_cell(t.get("id")),
            sanitize_cell(created_at_val),
            sanitize_cell(t.get("status")),
            sanitize_cell(t.get("priority")),
            sanitize_cell(q_text),
            sanitize_cell(t.get("assigned_expert_id")),
            sanitize_cell(resolved_at_val),
            sanitize_cell(hours_str),
            sanitize_cell(r_count),
        ])

    csv_content = "\ufeff" + output.getvalue()
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    headers = {
        "Content-Disposition": f'attachment; filename="escalations-{today_str}.csv"'
    }
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )

@router.get("/analytics.csv")
async def export_analytics_csv(
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    summary = await get_analytics(user=user)

    output = io.StringIO()
    writer = csv.writer(output)

    # Section 1: metric,value
    writer.writerow(["metric", "value"])
    ttr_val = (
        f"{summary.time_to_resolution_avg_hours:.2f}"
        if summary.time_to_resolution_avg_hours is not None
        else ""
    )
    metrics = [
        ("total_queries", summary.total_queries),
        ("avg_latency_ms", summary.avg_latency_ms),
        ("escalated_count", summary.escalated_count),
        ("time_to_resolution_avg_hours", ttr_val),
        ("resolution_sample_size", summary.resolution_sample_size),
        ("safety_gate_events_count", summary.safety_gate_events_count),
    ]
    for metric_name, metric_val in metrics:
        writer.writerow([sanitize_cell(metric_name), sanitize_cell(metric_val)])

    # Blank line separator
    writer.writerow([])

    # Section 2: date,query_count
    writer.writerow(["date", "query_count"])
    for day_item in summary.volume_by_day or []:
        day_date = day_item.get("date") if isinstance(day_item, dict) else getattr(day_item, "date", "")
        day_count = day_item.get("count") if isinstance(day_item, dict) else getattr(day_item, "count", 0)
        writer.writerow([sanitize_cell(day_date), sanitize_cell(day_count)])

    csv_content = "\ufeff" + output.getvalue()
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    headers = {
        "Content-Disposition": f'attachment; filename="analytics-{today_str}.csv"'
    }
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )


@router.get("/factory-summary.csv")
async def export_factory_summary_csv(
    days: int = 30,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    days = max(1, min(days, 365))
    factory_id = resolve_factory_id(user)
    db = get_db()

    now_dt = datetime.now(timezone.utc)
    from_dt = now_dt - timedelta(days=days)
    cutoff = from_dt.isoformat()
    period_from_str = from_dt.strftime("%Y-%m-%d")
    period_to_str = now_dt.strftime("%Y-%m-%d")
    generated_at_str = now_dt.isoformat()
    generated_by_role = user.role or "reviewer"

    # 1. Fetch factory details
    factory_name = "Factory"
    f_res = db.table("factories").select("name").eq("id", factory_id).limit(1).execute()
    if f_res.data and len(f_res.data) > 0:
        factory_name = f_res.data[0].get("name") or "Factory"

    # 2. Fetch queries within period (capped at 5000)
    q_res = (
        db.table("queries")
        .select("id, query_text, machine_id, status, was_escalated, was_refused_unsafe, resolution_status, resolved_at, created_at")
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(5000)
        .execute()
    )
    queries = q_res.data or []

    # 3. Fetch tickets within period (capped at 5000)
    t_res = (
        db.table("escalation_tickets")
        .select("id, query_id, status, priority, created_at, resolved_at, assigned_expert_id")
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .limit(5000)
        .execute()
    )
    tickets = t_res.data or []
    ticket_map = {t["query_id"]: t for t in tickets if t.get("query_id")}

    missing_qids = [q["id"] for q in queries if q.get("was_escalated") and q["id"] not in ticket_map]
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

    # 4. Fetch machines
    m_res = (
        db.table("machines")
        .select("id, name, workcell, model_number")
        .eq("factory_id", factory_id)
        .limit(5000)
        .execute()
    )
    machines = m_res.data or []

    # 5. Fetch approved documents per machine
    docs_res = (
        db.table("documents")
        .select("id, machine_id, status")
        .eq("factory_id", factory_id)
        .eq("status", "approved")
        .limit(5000)
        .execute()
    )
    docs_by_machine: dict[str, int] = {}
    for d in (docs_res.data or []):
        m_id = d.get("machine_id")
        if m_id:
            docs_by_machine[m_id] = docs_by_machine.get(m_id, 0) + 1

    # 6. Safety gate events
    safety_res = (
        db.table("safety_gate_events")
        .select("id")
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .limit(5000)
        .execute()
    )
    safety_events_count = len(safety_res.data or [])

    # Classify queries
    total_queries = len(queries)
    solved_count = 0
    unsolved_count = 0
    risky_count = 0
    normal_count = 0
    escalated_count = 0

    machine_query_stats: dict[str, dict] = {}
    for m in machines:
        machine_query_stats[m["id"]] = {
            "name": m.get("name") or "Unnamed Machine",
            "total": 0,
            "solved": 0,
            "unsolved": 0,
            "risky": 0,
            "open_tickets": 0,
            "approved_docs": docs_by_machine.get(m["id"], 0),
        }

    question_groups: dict[str, dict] = {}

    for q in queries:
        qid = q.get("id")
        t = ticket_map.get(qid)

        is_risky = bool(
            q.get("was_refused_unsafe")
            or q.get("status") == "restricted"
            or (t and str(t.get("priority", "")).lower() == "high")
        )

        is_unsafe_or_refused = bool(
            q.get("was_refused_unsafe")
            or q.get("status") == "restricted"
        )
        is_escalated = bool(
            q.get("was_escalated")
            or t is not None
        )

        if is_escalated:
            escalated_count += 1

        if is_unsafe_or_refused:
            is_solved = False
        elif is_escalated:
            t_status = str(t.get("status", "")).lower() if t else ""
            q_res_status = str(q.get("resolution_status", "")).lower()
            if t_status in ("resolved", "closed") or q_res_status == "resolved":
                is_solved = True
            else:
                is_solved = False
        elif q.get("status") in ("supported", "answered"):
            is_solved = True
        else:
            is_solved = False

        if is_solved:
            solved_count += 1
        else:
            unsolved_count += 1

        if is_risky:
            risky_count += 1
        else:
            normal_count += 1

        mid = q.get("machine_id")
        if mid and mid in machine_query_stats:
            mst = machine_query_stats[mid]
            mst["total"] += 1
            if is_solved:
                mst["solved"] += 1
            else:
                mst["unsolved"] += 1
            if is_risky:
                mst["risky"] += 1

        raw_q = q.get("query_text") or ""
        norm_key = " ".join(raw_q.lower().strip().split())
        if norm_key:
            if norm_key not in question_groups:
                question_groups[norm_key] = {
                    "text": raw_q.strip(),
                    "count": 0,
                    "last_asked": q.get("created_at") or "",
                    "resolved": 0,
                }
            g = question_groups[norm_key]
            g["count"] += 1
            if is_solved:
                g["resolved"] += 1
            q_created = q.get("created_at") or ""
            if q_created > g["last_asked"]:
                g["last_asked"] = q_created

    q_to_m = {q["id"]: q.get("machine_id") for q in queries}
    resolved_tickets_count = 0
    ttr_deltas = []
    tickets_expert = 0
    tickets_reviewer = 0
    oldest_open_hours = 0.0

    for t in tickets:
        t_status = str(t.get("status", "")).lower()
        t_qid = t.get("query_id")
        t_mid = q_to_m.get(t_qid)
        if t_status in ("open", "in_progress"):
            if t_mid and t_mid in machine_query_stats:
                machine_query_stats[t_mid]["open_tickets"] += 1
            c_at = t.get("created_at")
            if c_at:
                try:
                    c_dt = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                    age_h = (now_dt - c_dt).total_seconds() / 3600.0
                    if age_h > oldest_open_hours:
                        oldest_open_hours = age_h
                except (ValueError, TypeError):
                    pass
        elif t_status in ("resolved", "closed"):
            resolved_tickets_count += 1
            if t.get("assigned_expert_id"):
                tickets_expert += 1
            else:
                tickets_reviewer += 1

            c_at = t.get("created_at")
            r_at = t.get("resolved_at")
            if c_at and r_at:
                try:
                    c_dt = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                    r_dt = datetime.fromisoformat(r_at.replace("Z", "+00:00"))
                    d_h = (r_dt - c_dt).total_seconds() / 3600.0
                    if d_h >= 0:
                        ttr_deltas.append(d_h)
                except (ValueError, TypeError):
                    pass

    avg_hours_to_resolve = sum(ttr_deltas) / max(len(ttr_deltas), 1) if ttr_deltas else 0.0

    output = io.StringIO()
    writer = csv.writer(output)

    # 1. FACTORY SUMMARY
    writer.writerow(["FACTORY SUMMARY"])
    writer.writerow(["factory_name", "period_from", "period_to", "generated_at", "generated_by"])
    writer.writerow([
        sanitize_cell(factory_name),
        sanitize_cell(period_from_str),
        sanitize_cell(period_to_str),
        sanitize_cell(generated_at_str),
        sanitize_cell(generated_by_role),
    ])
    writer.writerow([])

    # 2. OVERVIEW
    writer.writerow(["OVERVIEW"])
    writer.writerow(["metric", "value"])
    writer.writerow(["total_queries", total_queries])
    writer.writerow(["solved", solved_count])
    writer.writerow(["unsolved", unsolved_count])
    writer.writerow(["risky", risky_count])
    writer.writerow(["normal", normal_count])
    writer.writerow(["escalated", escalated_count])
    writer.writerow(["resolved_tickets", resolved_tickets_count])
    writer.writerow(["average_hours_to_resolve", f"{avg_hours_to_resolve:.2f}"])
    writer.writerow(["safety_gate_events", safety_events_count])
    writer.writerow([])

    # 3. BY MACHINE
    writer.writerow(["BY MACHINE"])
    writer.writerow(["machine", "total_queries", "solved", "unsolved", "risky", "open_tickets", "approved_documents"])
    for mid, mst in sorted(machine_query_stats.items(), key=lambda x: x[1]["total"], reverse=True):
        writer.writerow([
            sanitize_cell(mst["name"]),
            mst["total"],
            mst["solved"],
            mst["unsolved"],
            mst["risky"],
            mst["open_tickets"],
            mst["approved_docs"],
        ])
    writer.writerow([])

    # 4. RECURRING QUESTIONS
    writer.writerow(["RECURRING QUESTIONS"])
    writer.writerow(["question", "count", "last_asked", "resolved_count"])
    top_recurring = sorted(question_groups.values(), key=lambda x: x["count"], reverse=True)[:15]
    for qg in top_recurring:
        writer.writerow([
            sanitize_cell(qg["text"]),
            qg["count"],
            sanitize_cell(qg["last_asked"]),
            qg["resolved"],
        ])
    writer.writerow([])

    # 5. RESOLUTION PERFORMANCE
    writer.writerow(["RESOLUTION PERFORMANCE"])
    writer.writerow(["metric", "value"])
    writer.writerow(["average_hours_to_resolve", f"{avg_hours_to_resolve:.2f}"])
    writer.writerow(["tickets_resolved_by_experts", tickets_expert])
    writer.writerow(["tickets_resolved_by_reviewers", tickets_reviewer])
    writer.writerow(["oldest_open_ticket_age_hours", f"{oldest_open_hours:.2f}"])
    writer.writerow([])

    # 6. DOCUMENTATION GAPS
    writer.writerow(["DOCUMENTATION GAPS"])
    writer.writerow(["machine", "gap_type", "details"])
    for mid, mst in machine_query_stats.items():
        if mst["approved_docs"] == 0:
            writer.writerow([
                sanitize_cell(mst["name"]),
                "zero_approved_documents",
                "0 approved documents found",
            ])
        if mst["unsolved"] > mst["solved"]:
            writer.writerow([
                sanitize_cell(mst["name"]),
                "unsolved_exceeds_solved",
                f"{mst['unsolved']} unsolved vs {mst['solved']} solved queries",
            ])

    csv_content = "\ufeff" + output.getvalue()
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    headers = {
        "Content-Disposition": f'attachment; filename="factory-summary-{today_str}.csv"'
    }
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )



def get_pdf_styles() -> dict[str, ParagraphStyle]:
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DocTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=colors.HexColor("#1C2B29"),
            spaceAfter=3,
        ),
        "subtitle": ParagraphStyle(
            "DocSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#5C6460"),
            spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=colors.HexColor("#1C2B29"),
            spaceBefore=8,
            spaceAfter=4,
        ),
        "th": ParagraphStyle(
            "TableHeader",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.white,
        ),
        "td": ParagraphStyle(
            "TableCell",
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#1C2B29"),
        ),
        "td_bold": ParagraphStyle(
            "TableCellBold",
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#1C2B29"),
        ),
        "footnote": ParagraphStyle(
            "Footnote",
            fontName="Helvetica",
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#5C6460"),
            spaceBefore=10,
        ),
        "empty": ParagraphStyle(
            "EmptyNotice",
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#5C6460"),
            spaceBefore=4,
            spaceAfter=4,
        ),
    }


def p_cell(text: Any, style: ParagraphStyle) -> Paragraph:
    val = "" if text is None else str(text)
    return Paragraph(html.escape(val), style)


@router.get("/escalations.pdf")
async def export_escalations_pdf(
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    factory_id = resolve_factory_id(user)
    db = get_db()

    tickets_res = (
        db.table("escalation_tickets")
        .select("id, query_id, status, priority, created_at, resolved_at, assigned_expert_id")
        .eq("factory_id", factory_id)
        .order("created_at", desc=True)
        .limit(5000)
        .execute()
    )
    tickets = tickets_res.data or []

    q_ids = list({t["query_id"] for t in tickets if t.get("query_id")})
    query_map = {}
    if q_ids:
        for i in range(0, len(q_ids), 500):
            chunk = q_ids[i : i + 500]
            q_res = (
                db.table("queries")
                .select("id, query_text")
                .eq("factory_id", factory_id)
                .in_("id", chunk)
                .execute()
            )
            for q in q_res.data or []:
                query_map[q["id"]] = q.get("query_text") or ""

    t_ids = [t["id"] for t in tickets if t.get("id")]
    reply_counts = {}
    if t_ids:
        for i in range(0, len(t_ids), 500):
            chunk = t_ids[i : i + 500]
            r_res = (
                db.table("escalation_replies")
                .select("ticket_id")
                .eq("factory_id", factory_id)
                .in_("ticket_id", chunk)
                .execute()
            )
            for r in r_res.data or []:
                tid = r.get("ticket_id")
                if tid:
                    reply_counts[tid] = reply_counts.get(tid, 0) + 1

    pdf_styles = get_pdf_styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(letter),
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y%m%d")
    date_formatted = now_utc.strftime("%Y-%m-%d %H:%M UTC")

    story = [
        Paragraph("IndustryMind — Escalations Report", pdf_styles["title"]),
        Paragraph(f"Total Tickets: {len(tickets)} | Generated: {date_formatted} | Role: {user.role}", pdf_styles["subtitle"]),
        Spacer(1, 6),
    ]

    if not tickets:
        story.append(Paragraph("No escalation tickets found.", pdf_styles["empty"]))
    else:
        col_widths = [80, 80, 65, 60, 255, 70, 65, 45]
        headers = ["Ticket ID", "Created", "Status", "Priority", "Question", "Expert", "Resolved", "Replies"]
        table_rows = [[p_cell(h, pdf_styles["th"]) for h in headers]]

        for t in tickets:
            c_at = (t.get("created_at") or "")[:10]
            r_at = (t.get("resolved_at") or "")[:10]
            q_text = query_map.get(t.get("query_id"), "")
            r_count = reply_counts.get(t.get("id"), 0)
            expert = t.get("assigned_expert_id") or "Unassigned"
            tid = str(t.get("id") or "")
            if len(tid) > 12:
                tid = tid[:8] + "…"

            table_rows.append([
                p_cell(tid, pdf_styles["td_bold"]),
                p_cell(c_at, pdf_styles["td"]),
                p_cell(t.get("status") or "", pdf_styles["td"]),
                p_cell(t.get("priority") or "", pdf_styles["td"]),
                p_cell(q_text, pdf_styles["td"]),
                p_cell(expert, pdf_styles["td"]),
                p_cell(r_at, pdf_styles["td"]),
                p_cell(str(r_count), pdf_styles["td"]),
            ])

        t_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
        t_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C2B29")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E0D8")),
        ]))
        story.append(t_table)

    doc.build(story)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="escalations-{today_str}.pdf"'},
    )


@router.get("/analytics.pdf")
async def export_analytics_pdf(
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    summary = await get_analytics(user=user)
    pdf_styles = get_pdf_styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y%m%d")
    date_formatted = now_utc.strftime("%Y-%m-%d %H:%M UTC")

    story = [
        Paragraph("IndustryMind — Operations Analytics Report", pdf_styles["title"]),
        Paragraph(f"Generated: {date_formatted} | Generated By: {user.role or 'reviewer'}", pdf_styles["subtitle"]),
        Spacer(1, 4),
        Paragraph("1. System Key Metrics", pdf_styles["section"]),
    ]

    ttr_str = f"{summary.time_to_resolution_avg_hours:.2f} hrs" if summary.time_to_resolution_avg_hours is not None else "N/A"
    lat_str = f"{summary.avg_latency_ms:.0f} ms" if summary.avg_latency_ms is not None else "N/A"

    metrics_data = [
        [p_cell("Metric", pdf_styles["th"]), p_cell("Value", pdf_styles["th"]), p_cell("Metric", pdf_styles["th"]), p_cell("Value", pdf_styles["th"])],
        [p_cell("Total Queries", pdf_styles["td_bold"]), p_cell(str(summary.total_queries), pdf_styles["td"]), p_cell("Avg Latency", pdf_styles["td_bold"]), p_cell(lat_str, pdf_styles["td"])],
        [p_cell("Escalated Queries", pdf_styles["td_bold"]), p_cell(str(summary.escalated_count), pdf_styles["td"]), p_cell("Avg Time to Resolution", pdf_styles["td_bold"]), p_cell(ttr_str, pdf_styles["td"])],
        [p_cell("Resolution Sample Size", pdf_styles["td_bold"]), p_cell(str(summary.resolution_sample_size), pdf_styles["td"]), p_cell("Safety Gate Events", pdf_styles["td_bold"]), p_cell(str(summary.safety_gate_events_count), pdf_styles["td"])],
    ]
    m_table = Table(metrics_data, colWidths=[150, 120, 150, 120])
    m_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C2B29")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E0D8")),
    ]))
    story.append(m_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph("2. Query Volume by Day (30 Days)", pdf_styles["section"]))
    vol_days = summary.volume_by_day or []
    if not vol_days:
        story.append(Paragraph("No volume data available.", pdf_styles["empty"]))
    else:
        vol_rows = [[p_cell("Date", pdf_styles["th"]), p_cell("Queries", pdf_styles["th"]), p_cell("Date", pdf_styles["th"]), p_cell("Queries", pdf_styles["th"])]]
        mid = (len(vol_days) + 1) // 2
        for idx in range(mid):
            d1 = vol_days[idx]
            d1_date = d1.get("date") if isinstance(d1, dict) else getattr(d1, "date", "")
            d1_count = d1.get("count") if isinstance(d1, dict) else getattr(d1, "count", 0)

            idx2 = idx + mid
            if idx2 < len(vol_days):
                d2 = vol_days[idx2]
                d2_date = d2.get("date") if isinstance(d2, dict) else getattr(d2, "date", "")
                d2_count = d2.get("count") if isinstance(d2, dict) else getattr(d2, "count", 0)
            else:
                d2_date = ""
                d2_count = ""

            vol_rows.append([
                p_cell(d1_date, pdf_styles["td"]),
                p_cell(str(d1_count), pdf_styles["td_bold"]),
                p_cell(d2_date, pdf_styles["td"]),
                p_cell(str(d2_count) if d2_count != "" else "", pdf_styles["td_bold"]),
            ])
        v_table = Table(vol_rows, colWidths=[150, 120, 150, 120], repeatRows=1)
        v_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C2B29")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E0D8")),
        ]))
        story.append(v_table)

    doc.build(story)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="analytics-{today_str}.pdf"'},
    )


@router.get("/factory-summary.pdf")
async def export_factory_summary_pdf(
    days: int = 30,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    days = max(1, min(days, 365))
    factory_id = resolve_factory_id(user)
    db = get_db()

    now_dt = datetime.now(timezone.utc)
    from_dt = now_dt - timedelta(days=days)
    cutoff = from_dt.isoformat()
    period_from_str = from_dt.strftime("%Y-%m-%d")
    period_to_str = now_dt.strftime("%Y-%m-%d")
    generated_at_str = now_dt.isoformat()
    generated_by_role = user.role or "reviewer"

    factory_name = "Factory"
    f_res = db.table("factories").select("name").eq("id", factory_id).limit(1).execute()
    if f_res.data and len(f_res.data) > 0:
        factory_name = f_res.data[0].get("name") or "Factory"

    q_res = (
        db.table("queries")
        .select("id, query_text, machine_id, status, was_escalated, was_refused_unsafe, resolution_status, resolved_at, created_at")
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(5000)
        .execute()
    )
    queries = q_res.data or []

    t_res = (
        db.table("escalation_tickets")
        .select("id, query_id, status, priority, created_at, resolved_at, assigned_expert_id")
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .limit(5000)
        .execute()
    )
    tickets = t_res.data or []
    ticket_map = {t["query_id"]: t for t in tickets if t.get("query_id")}

    missing_qids = [q["id"] for q in queries if q.get("was_escalated") and q["id"] not in ticket_map]
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

    m_res = (
        db.table("machines")
        .select("id, name, workcell, model_number")
        .eq("factory_id", factory_id)
        .limit(5000)
        .execute()
    )
    machines = m_res.data or []

    docs_res = (
        db.table("documents")
        .select("id, machine_id, status")
        .eq("factory_id", factory_id)
        .eq("status", "approved")
        .limit(5000)
        .execute()
    )
    docs_by_machine: dict[str, int] = {}
    for d in (docs_res.data or []):
        m_id = d.get("machine_id")
        if m_id:
            docs_by_machine[m_id] = docs_by_machine.get(m_id, 0) + 1

    safety_res = (
        db.table("safety_gate_events")
        .select("id")
        .eq("factory_id", factory_id)
        .gte("created_at", cutoff)
        .limit(5000)
        .execute()
    )
    safety_events_count = len(safety_res.data or [])

    total_queries = len(queries)
    solved_count = 0
    unsolved_count = 0
    risky_count = 0
    normal_count = 0
    escalated_count = 0

    machine_query_stats: dict[str, dict] = {}
    for m in machines:
        machine_query_stats[m["id"]] = {
            "name": m.get("name") or "Unnamed Machine",
            "total": 0,
            "solved": 0,
            "unsolved": 0,
            "risky": 0,
            "open_tickets": 0,
            "approved_docs": docs_by_machine.get(m["id"], 0),
        }

    question_groups: dict[str, dict] = {}

    for q in queries:
        qid = q.get("id")
        t = ticket_map.get(qid)

        is_risky = bool(
            q.get("was_refused_unsafe")
            or q.get("status") == "restricted"
            or (t and str(t.get("priority", "")).lower() == "high")
        )

        is_unsafe_or_refused = bool(
            q.get("was_refused_unsafe")
            or q.get("status") == "restricted"
        )
        is_escalated = bool(
            q.get("was_escalated")
            or t is not None
        )

        if is_escalated:
            escalated_count += 1

        if is_unsafe_or_refused:
            is_solved = False
        elif is_escalated:
            t_status = str(t.get("status", "")).lower() if t else ""
            q_res_status = str(q.get("resolution_status", "")).lower()
            if t_status in ("resolved", "closed") or q_res_status == "resolved":
                is_solved = True
            else:
                is_solved = False
        elif q.get("status") in ("supported", "answered"):
            is_solved = True
        else:
            is_solved = False

        if is_solved:
            solved_count += 1
        else:
            unsolved_count += 1

        if is_risky:
            risky_count += 1
        else:
            normal_count += 1

        mid = q.get("machine_id")
        if mid and mid in machine_query_stats:
            mst = machine_query_stats[mid]
            mst["total"] += 1
            if is_solved:
                mst["solved"] += 1
            else:
                mst["unsolved"] += 1
            if is_risky:
                mst["risky"] += 1

        raw_q = q.get("query_text") or ""
        norm_key = " ".join(raw_q.lower().strip().split())
        if norm_key:
            if norm_key not in question_groups:
                question_groups[norm_key] = {
                    "text": raw_q.strip(),
                    "count": 0,
                    "last_asked": q.get("created_at") or "",
                    "resolved": 0,
                }
            g = question_groups[norm_key]
            g["count"] += 1
            if is_solved:
                g["resolved"] += 1
            q_created = q.get("created_at") or ""
            if q_created > g["last_asked"]:
                g["last_asked"] = q_created

    q_to_m = {q["id"]: q.get("machine_id") for q in queries}
    resolved_tickets_count = 0
    ttr_deltas = []
    tickets_expert = 0
    tickets_reviewer = 0
    oldest_open_hours = 0.0

    for t in tickets:
        t_status = str(t.get("status", "")).lower()
        t_qid = t.get("query_id")
        t_mid = q_to_m.get(t_qid)
        if t_status in ("open", "in_progress"):
            if t_mid and t_mid in machine_query_stats:
                machine_query_stats[t_mid]["open_tickets"] += 1
            c_at = t.get("created_at")
            if c_at:
                try:
                    c_dt = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                    age_h = (now_dt - c_dt).total_seconds() / 3600.0
                    if age_h > oldest_open_hours:
                        oldest_open_hours = age_h
                except (ValueError, TypeError):
                    pass
        elif t_status in ("resolved", "closed"):
            resolved_tickets_count += 1
            if t.get("assigned_expert_id"):
                tickets_expert += 1
            else:
                tickets_reviewer += 1

            c_at = t.get("created_at")
            r_at = t.get("resolved_at")
            if c_at and r_at:
                try:
                    c_dt = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                    r_dt = datetime.fromisoformat(r_at.replace("Z", "+00:00"))
                    d_h = (r_dt - c_dt).total_seconds() / 3600.0
                    if d_h >= 0:
                        ttr_deltas.append(d_h)
                except (ValueError, TypeError):
                    pass

    avg_hours_to_resolve = sum(ttr_deltas) / max(len(ttr_deltas), 1) if ttr_deltas else 0.0

    pdf_styles = get_pdf_styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    story = [
        Paragraph(f"IndustryMind — {factory_name} Factory Summary Report", pdf_styles["title"]),
        Paragraph(f"Period: {period_from_str} to {period_to_str} ({days} days) | Generated: {generated_at_str[:19].replace('T', ' ')} UTC by {generated_by_role}", pdf_styles["subtitle"]),
        Spacer(1, 4),
        Paragraph("1. Operations Overview & Resolution", pdf_styles["section"]),
    ]

    overview_rows = [
        [p_cell("Metric", pdf_styles["th"]), p_cell("Value", pdf_styles["th"]), p_cell("Metric", pdf_styles["th"]), p_cell("Value", pdf_styles["th"])],
        [p_cell("Total Queries", pdf_styles["td_bold"]), p_cell(str(total_queries), pdf_styles["td"]), p_cell("Solved Queries", pdf_styles["td_bold"]), p_cell(str(solved_count), pdf_styles["td"])],
        [p_cell("Unsolved Queries", pdf_styles["td_bold"]), p_cell(str(unsolved_count), pdf_styles["td"]), p_cell("Risky Queries", pdf_styles["td_bold"]), p_cell(str(risky_count), pdf_styles["td"])],
        [p_cell("Normal Queries", pdf_styles["td_bold"]), p_cell(str(normal_count), pdf_styles["td"]), p_cell("Escalated Queries", pdf_styles["td_bold"]), p_cell(str(escalated_count), pdf_styles["td"])],
        [p_cell("Resolved Tickets", pdf_styles["td_bold"]), p_cell(str(resolved_tickets_count), pdf_styles["td"]), p_cell("Safety Gate Events", pdf_styles["td_bold"]), p_cell(str(safety_events_count), pdf_styles["td"])],
        [p_cell("Avg Hours to Resolve", pdf_styles["td_bold"]), p_cell(f"{avg_hours_to_resolve:.2f} hrs", pdf_styles["td"]), p_cell("Oldest Open Ticket", pdf_styles["td_bold"]), p_cell(f"{oldest_open_hours:.2f} hrs", pdf_styles["td"])],
    ]
    o_table = Table(overview_rows, colWidths=[150, 120, 150, 120])
    o_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C2B29")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E0D8")),
    ]))
    story.append(o_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("2. Machine Breakdown", pdf_styles["section"]))
    if not machine_query_stats:
        story.append(Paragraph("No machines found.", pdf_styles["empty"]))
    else:
        m_widths = [170, 50, 50, 50, 50, 85, 85]
        m_headers = ["Machine", "Total", "Solved", "Unsolved", "Risky", "Open Tickets", "Approved Docs"]
        m_rows = [[p_cell(h, pdf_styles["th"]) for h in m_headers]]
        for mid, mst in sorted(machine_query_stats.items(), key=lambda x: x[1]["total"], reverse=True):
            m_rows.append([
                p_cell(mst["name"], pdf_styles["td_bold"]),
                p_cell(str(mst["total"]), pdf_styles["td"]),
                p_cell(str(mst["solved"]), pdf_styles["td"]),
                p_cell(str(mst["unsolved"]), pdf_styles["td"]),
                p_cell(str(mst["risky"]), pdf_styles["td"]),
                p_cell(str(mst["open_tickets"]), pdf_styles["td"]),
                p_cell(str(mst["approved_docs"]), pdf_styles["td"]),
            ])
        m_table = Table(m_rows, colWidths=m_widths, repeatRows=1)
        m_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C2B29")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E0D8")),
        ]))
        story.append(m_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("3. Top Recurring Inquiries", pdf_styles["section"]))
    top_recurring = sorted(question_groups.values(), key=lambda x: x["count"], reverse=True)[:15]
    if not top_recurring:
        story.append(Paragraph("No inquiries recorded in this period.", pdf_styles["empty"]))
    else:
        q_widths = [335, 45, 55, 105]
        q_headers = ["Question", "Count", "Resolved", "Last Asked"]
        q_rows = [[p_cell(h, pdf_styles["th"]) for h in q_headers]]
        for qg in top_recurring:
            q_rows.append([
                p_cell(qg["text"], pdf_styles["td"]),
                p_cell(str(qg["count"]), pdf_styles["td_bold"]),
                p_cell(str(qg["resolved"]), pdf_styles["td"]),
                p_cell((qg["last_asked"] or "")[:10], pdf_styles["td"]),
            ])
        q_table = Table(q_rows, colWidths=q_widths, repeatRows=1)
        q_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C2B29")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E0D8")),
        ]))
        story.append(q_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("4. Documentation Gaps", pdf_styles["section"]))
    gap_rows = []
    for mid, mst in machine_query_stats.items():
        if mst["approved_docs"] == 0:
            gap_rows.append([mst["name"], "Zero approved documents", "0 approved documents found for machine"])
        if mst["unsolved"] > mst["solved"]:
            gap_rows.append([mst["name"], "Unsolved exceeds solved", f"{mst['unsolved']} unsolved vs {mst['solved']} solved queries"])

    if not gap_rows:
        story.append(Paragraph("No documentation gaps identified for this period.", pdf_styles["empty"]))
    else:
        g_widths = [160, 150, 230]
        g_headers = ["Machine", "Gap Type", "Details"]
        g_table_rows = [[p_cell(h, pdf_styles["th"]) for h in g_headers]]
        for gr in gap_rows:
            g_table_rows.append([
                p_cell(gr[0], pdf_styles["td_bold"]),
                p_cell(gr[1], pdf_styles["td"]),
                p_cell(gr[2], pdf_styles["td"]),
            ])
        g_table = Table(g_table_rows, colWidths=g_widths, repeatRows=1)
        g_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C2B29")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E0D8")),
        ]))
        story.append(g_table)

    story.append(Paragraph(
        "Definitions: Solved = answered from approved evidence without escalation, or escalated with ticket resolved/closed. "
        "Unsolved = refused, insufficient evidence, or open escalation ticket. "
        "Risky = safety gate triggered or ticket priority high. Normal = all non-risky queries.",
        pdf_styles["footnote"]
    ))

    doc.build(story)
    today_str = now_dt.strftime("%Y%m%d")
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="factory-summary-{today_str}.pdf"'},
    )
