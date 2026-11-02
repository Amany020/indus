"""
IndustryMind — Retention Jobs (R4)
Automated data cleanup with legal hold support.
Feature-flagged: RETENTION_JOBS_ENABLED must be true.
Always runs in dry-run mode first.

Usage:
    # From backend directory:
    python -m app.jobs.retention --dry-run
    python -m app.jobs.retention --live
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)


def get_active_holds(db, factory_id: str) -> list[dict]:
    """Get all active legal holds for a factory."""
    result = (
        db.table("legal_holds")
        .select("*")
        .eq("factory_id", factory_id)
        .is_("released_at", "null")
        .execute()
    )
    return result.data or []


def is_held(holds: list[dict], table: str, record_id: str = None) -> bool:
    """Check if a table/record is under legal hold."""
    for hold in holds:
        if hold["affected_table"] == table:
            if hold["affected_id"] is None or hold["affected_id"] == record_id:
                return True
    return False


def run_retention(mode: str = "dry_run", factory_id: str | None = None):
    """
    Run retention cleanup.

    Args:
        mode: "dry_run" (report only) or "live" (actually delete)
        factory_id: Optional factory ID (defaults to settings.default_factory_id)
    """
    if not settings.retention_jobs_enabled:
        logger.warning("Retention jobs disabled (RETENTION_JOBS_ENABLED=false)")
        return

    db = get_db()
    factory_id = factory_id or settings.default_factory_id
    run_id = str(uuid.uuid4())

    logger.info("Starting retention run: mode=%s, factory=%s", mode, factory_id)

    # Get legal holds
    holds = get_active_holds(db, factory_id)
    if holds:
        logger.info("Active legal holds: %d", len(holds))

    stats = {
        "scanned": 0,
        "to_delete": 0,
        "held": 0,
        "deleted": 0,
        "details": {},
    }

    now = datetime.now(timezone.utc)

    # ── Queries older than retention_query_days ──────────────────────────
    query_cutoff = now - timedelta(days=settings.retention_query_days)
    try:
        old_queries = (
            db.table("queries")
            .select("id, created_at")
            .eq("factory_id", factory_id)
            .lt("created_at", query_cutoff.isoformat())
            .execute()
        )
        query_count = len(old_queries.data or [])
        stats["scanned"] += query_count

        held_count = 0
        deletable = []
        for q in (old_queries.data or []):
            if is_held(holds, "queries", q["id"]):
                held_count += 1
            else:
                deletable.append(q["id"])

        stats["held"] += held_count
        stats["to_delete"] += len(deletable)
        stats["details"]["queries"] = {
            "found": query_count,
            "held": held_count,
            "deletable": len(deletable),
        }

        if mode == "live" and deletable:
            for qid in deletable:
                # Delete citations first (FK), then query
                db.table("query_citations").delete().eq("query_id", qid).execute()
                db.table("queries").delete().eq("id", qid).execute()
                stats["deleted"] += 1

        logger.info(
            "Queries: scanned=%d, deletable=%d, held=%d",
            query_count, len(deletable), held_count,
        )

    except Exception as e:
        logger.error("Query retention failed: %s", e)
        stats["details"]["queries_error"] = str(e)

    # ── Draft documents older than retention_draft_days ───────────────────
    draft_cutoff = now - timedelta(days=settings.retention_draft_days)
    try:
        old_drafts = (
            db.table("documents")
            .select("id, created_at")
            .eq("factory_id", factory_id)
            .eq("approval_status", "draft")
            .lt("created_at", draft_cutoff.isoformat())
            .execute()
        )
        draft_count = len(old_drafts.data or [])
        stats["scanned"] += draft_count

        held_d = 0
        deletable_d = []
        for d in (old_drafts.data or []):
            if is_held(holds, "documents", d["id"]):
                held_d += 1
            else:
                deletable_d.append(d["id"])

        stats["held"] += held_d
        stats["to_delete"] += len(deletable_d)
        stats["details"]["drafts"] = {
            "found": draft_count,
            "held": held_d,
            "deletable": len(deletable_d),
        }

        if mode == "live" and deletable_d:
            for did in deletable_d:
                db.table("document_chunks").delete().eq("document_id", did).execute()
                db.table("documents").delete().eq("id", did).execute()
                stats["deleted"] += 1

        logger.info(
            "Drafts: scanned=%d, deletable=%d, held=%d",
            draft_count, len(deletable_d), held_d,
        )

    except Exception as e:
        logger.error("Draft retention failed: %s", e)
        stats["details"]["drafts_error"] = str(e)

    # ── Log the run ──────────────────────────────────────────────────────
    try:
        db.table("retention_runs").insert({
            "id": run_id,
            "factory_id": factory_id,
            "run_mode": mode,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "records_scanned": stats["scanned"],
            "records_deleted": stats["deleted"],
            "records_held": stats["held"],
            "details": stats["details"],
        }).execute()
    except Exception as e:
        logger.warning("Failed to log retention run: %s", e)

    logger.info(
        "Retention complete: mode=%s, scanned=%d, deleted=%d, held=%d",
        mode, stats["scanned"], stats["deleted"], stats["held"],
    )
    return stats


def main():
    parser = argparse.ArgumentParser(description="IndustryMind retention job")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Report only, no deletions")
    group.add_argument("--live", action="store_true", help="Actually delete expired records")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    mode = "live" if args.live else "dry_run"
    run_retention(mode)


if __name__ == "__main__":
    main()
