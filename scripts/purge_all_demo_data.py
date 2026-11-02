"""
IndustryMind — Purge ALL Demo/Seed Data
Removes every row seeded by 003_seed.sql, 007_factory_b_seed.sql,
seed_demo_events.py, and safety_baseline_library inserts from 002.

Usage:
    python scripts/purge_all_demo_data.py              # dry-run (default)
    python scripts/purge_all_demo_data.py --confirm     # actually delete
"""

from __future__ import annotations

import sys
import os
import io

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# Load .env from the backend directory
from dotenv import load_dotenv
backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
load_dotenv(os.path.join(backend_dir, ".env"))

from app.core.database import get_db


# ── Known seed IDs ────────────────────────────────────────────────────────────

SEED_FACTORY_IDS = [
    "a0000000-0000-0000-0000-000000000001",  # 003_seed.sql — IndusWorks Manufacturing
    "a0000000-0000-0000-0000-000000000002",  # 007_factory_b_seed.sql — South Plant
]

SEED_BRANCH_IDS = [
    "b0000000-0000-0000-0000-000000000001",
    "b0000000-0000-0000-0000-000000000002",
]

SEED_MACHINE_IDS = [
    "c0000000-0000-0000-0000-000000000001",  # Conveyor Drive Unit
    "c0000000-0000-0000-0000-000000000002",  # Hydraulic Stamping Press
]


def count_rows(db, table: str, column: str, values: list) -> int:
    """Count rows matching column IN values."""
    try:
        result = db.table(table).select("id", count="exact").in_(column, values).execute()
        return result.count or 0
    except Exception:
        return -1


def delete_rows(db, table: str, column: str, values: list) -> int:
    """Delete rows matching column IN values. Returns count deleted."""
    try:
        result = db.table(table).delete().in_(column, values).execute()
        return len(result.data) if result.data else 0
    except Exception as e:
        print(f"  ⚠ Error deleting from {table}: {e}")
        return 0


def delete_all_rows(db, table: str) -> int:
    """Delete ALL rows from a table (for tables that are entirely seed data)."""
    try:
        # Supabase requires a filter — use neq on id with impossible value
        result = db.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        return len(result.data) if result.data else 0
    except Exception as e:
        print(f"  ⚠ Error deleting all from {table}: {e}")
        return 0


def main():
    confirm = "--confirm" in sys.argv
    mode = "[LIVE DELETE]" if confirm else "[DRY-RUN] (use --confirm to delete)"
    print(f"\n{'='*60}")
    print(f"  IndustryMind — Purge ALL Demo Data")
    print(f"  Mode: {mode}")
    print(f"{'='*60}\n")

    db = get_db()
    report = []

    # ── Order matters: delete children first, then parents ─────────────────

    # 1. Troubleshooting steps (FK → sessions)
    #    Sessions FK → factory_id, machine_id
    ts_count = count_rows(db, "troubleshooting_steps", "session_id",
        [r["id"] for r in (db.table("troubleshooting_sessions")
            .select("id").in_("factory_id", SEED_FACTORY_IDS).execute().data or [])])
    report.append(("troubleshooting_steps", ts_count))

    # 2. Troubleshooting sessions
    tsess_count = count_rows(db, "troubleshooting_sessions", "factory_id", SEED_FACTORY_IDS)
    report.append(("troubleshooting_sessions", tsess_count))

    # 3. Query citations (FK → queries)
    query_ids = [r["id"] for r in (db.table("queries")
        .select("id").in_("factory_id", SEED_FACTORY_IDS).execute().data or [])]
    qc_count = count_rows(db, "query_citations", "query_id", query_ids) if query_ids else 0
    report.append(("query_citations", qc_count))

    # 4. Escalation tickets (FK → factory_id, query_id)
    esc_count = count_rows(db, "escalation_tickets", "factory_id", SEED_FACTORY_IDS)
    report.append(("escalation_tickets", esc_count))

    # 5. SOP gap flags
    sop_count = count_rows(db, "sop_gap_flags", "factory_id", SEED_FACTORY_IDS)
    report.append(("sop_gap_flags", sop_count))

    # 6. Tips (FK → factory_id)
    tips_count = count_rows(db, "tips", "factory_id", SEED_FACTORY_IDS)
    report.append(("tips", tips_count))

    # 7. Safety gate events
    sge_count = count_rows(db, "safety_gate_events", "factory_id", SEED_FACTORY_IDS)
    report.append(("safety_gate_events", sge_count))

    # 8. Queries
    q_count = count_rows(db, "queries", "factory_id", SEED_FACTORY_IDS)
    report.append(("queries", q_count))

    # 9. Document pages (FK → documents)
    doc_ids = [r["id"] for r in (db.table("documents")
        .select("id").in_("factory_id", SEED_FACTORY_IDS).execute().data or [])]
    dp_count = count_rows(db, "document_pages", "document_id", doc_ids) if doc_ids else 0
    report.append(("document_pages", dp_count))

    # 10. Document chunks (FK → documents)
    dc_count = count_rows(db, "document_chunks", "document_id", doc_ids) if doc_ids else 0
    report.append(("document_chunks", dc_count))

    # 11. Documents
    d_count = count_rows(db, "documents", "factory_id", SEED_FACTORY_IDS)
    report.append(("documents", d_count))

    # 12. Memberships (FK → factory_id)
    mem_count = count_rows(db, "memberships", "factory_id", SEED_FACTORY_IDS)
    report.append(("memberships", mem_count))

    # 13. Safety baseline library (all rows are seed data from 002)
    try:
        sbl = db.table("safety_baseline_library").select("id", count="exact").execute()
        sbl_count = sbl.count or 0
    except Exception:
        sbl_count = -1
    report.append(("safety_baseline_library", sbl_count))

    # 14. Machines
    m_count = count_rows(db, "machines", "id", SEED_MACHINE_IDS)
    report.append(("machines", m_count))

    # 15. Branches
    b_count = count_rows(db, "branches", "id", SEED_BRANCH_IDS)
    report.append(("branches", b_count))

    # 16. Factories (last — everything else references this)
    f_count = count_rows(db, "factories", "id", SEED_FACTORY_IDS)
    report.append(("factories", f_count))

    # ── Print report ──────────────────────────────────────────────────────────

    total = 0
    print(f"  {'Table':<30} {'Rows to delete':>15}")
    print(f"  {'─'*30} {'─'*15}")
    for table, count in report:
        marker = "" if count >= 0 else " (error)"
        c = max(count, 0)
        total += c
        print(f"  {table:<30} {c:>15}{marker}")
    print(f"  {'─'*30} {'─'*15}")
    print(f"  {'TOTAL':<30} {total:>15}")
    print()

    if not confirm:
        print("  [i] This was a DRY RUN. No data was deleted.")
        print("  [i] Run with --confirm to actually purge.\n")
        return

    # ── Actually delete ───────────────────────────────────────────────────────

    print("  Deleting...\n")

    # 1. Troubleshooting steps
    if query_ids_ts := [r["id"] for r in (db.table("troubleshooting_sessions")
            .select("id").in_("factory_id", SEED_FACTORY_IDS).execute().data or [])]:
        d = delete_rows(db, "troubleshooting_steps", "session_id", query_ids_ts)
        print(f"  ✓ troubleshooting_steps: {d} deleted")

    # 2. Troubleshooting sessions
    d = delete_rows(db, "troubleshooting_sessions", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ troubleshooting_sessions: {d} deleted")

    # 3. Query citations
    if query_ids:
        d = delete_rows(db, "query_citations", "query_id", query_ids)
        print(f"  ✓ query_citations: {d} deleted")

    # 4. Escalation tickets
    d = delete_rows(db, "escalation_tickets", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ escalation_tickets: {d} deleted")

    # 5. SOP gap flags
    d = delete_rows(db, "sop_gap_flags", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ sop_gap_flags: {d} deleted")

    # 6. Tips
    d = delete_rows(db, "tips", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ tips: {d} deleted")

    # 7. Safety gate events
    d = delete_rows(db, "safety_gate_events", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ safety_gate_events: {d} deleted")

    # 8. Queries
    d = delete_rows(db, "queries", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ queries: {d} deleted")

    # 9. Document pages
    if doc_ids:
        d = delete_rows(db, "document_pages", "document_id", doc_ids)
        print(f"  ✓ document_pages: {d} deleted")

    # 10. Document chunks
    if doc_ids:
        d = delete_rows(db, "document_chunks", "document_id", doc_ids)
        print(f"  ✓ document_chunks: {d} deleted")

    # 11. Documents
    d = delete_rows(db, "documents", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ documents: {d} deleted")

    # 12. Memberships
    d = delete_rows(db, "memberships", "factory_id", SEED_FACTORY_IDS)
    print(f"  ✓ memberships: {d} deleted")

    # 13. Safety baseline library
    d = delete_all_rows(db, "safety_baseline_library")
    print(f"  ✓ safety_baseline_library: {d} deleted")

    # 14. Machines
    d = delete_rows(db, "machines", "id", SEED_MACHINE_IDS)
    print(f"  ✓ machines: {d} deleted")

    # 15. Branches
    d = delete_rows(db, "branches", "id", SEED_BRANCH_IDS)
    print(f"  ✓ branches: {d} deleted")

    # 16. Factories
    d = delete_rows(db, "factories", "id", SEED_FACTORY_IDS)
    print(f"  ✓ factories: {d} deleted")

    print(f"\n  ✅ Purge complete. All demo data removed.\n")


if __name__ == "__main__":
    main()
