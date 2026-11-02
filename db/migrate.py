"""
IndustryMind — Database Migration Runner
Applies numbered SQL migration files in order, tracking which have run
in a `schema_migrations` table. Idempotent: re-running skips already-applied files.

Usage:
    python -m db.migrate              # apply all pending
    python -m db.migrate --dry-run    # show what would run
    python -m db.migrate --status     # show migration status
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import glob
from datetime import datetime, timezone
from pathlib import Path

# Add backend to path so we can import config
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from supabase import create_client


def get_supabase():
    """Create Supabase client from environment."""
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        sys.exit(1)
    return create_client(url, key)


def ensure_migrations_table(db):
    """Create schema_migrations table if it doesn't exist."""
    # Use RPC or raw SQL via Supabase — we store migration state in a simple table
    try:
        db.table("schema_migrations").select("version").limit(1).execute()
    except Exception:
        # Table doesn't exist — we can't create it via the REST API directly,
        # so we document that the first migration (001) must be applied manually
        # or the table must be created via Supabase SQL Editor.
        print("WARNING: schema_migrations table not found.")
        print("Create it in Supabase SQL Editor:")
        print("""
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    applied_by TEXT DEFAULT 'migrate.py'
);
""")
        return False
    return True


def get_applied_migrations(db) -> dict[str, dict]:
    """Return dict of version -> {filename, checksum, applied_at}."""
    try:
        result = db.table("schema_migrations").select("*").order("version").execute()
        return {row["version"]: row for row in (result.data or [])}
    except Exception:
        return {}


def get_pending_migrations(db_dir: Path, applied: dict) -> list[dict]:
    """Find SQL files not yet applied, in order."""
    sql_files = sorted(db_dir.glob("*.sql"))
    pending = []
    for f in sql_files:
        # Extract version from filename: "001_schema.sql" -> "001"
        version = f.stem.split("_")[0]
        if version not in applied:
            content = f.read_text(encoding="utf-8")
            checksum = hashlib.sha256(content.encode()).hexdigest()[:16]
            pending.append({
                "version": version,
                "filename": f.name,
                "path": f,
                "checksum": checksum,
                "content": content,
            })
    return pending


def apply_migration(db, migration: dict):
    """Record a migration as applied. SQL must be run manually in Supabase SQL Editor."""
    db.table("schema_migrations").insert({
        "version": migration["version"],
        "filename": migration["filename"],
        "checksum": migration["checksum"],
    }).execute()


def main():
    parser = argparse.ArgumentParser(description="IndustryMind migration runner")
    parser.add_argument("--dry-run", action="store_true", help="Show pending without applying")
    parser.add_argument("--status", action="store_true", help="Show migration status")
    parser.add_argument("--mark-applied", type=str, help="Mark a specific version as applied")
    args = parser.parse_args()

    db_dir = Path(__file__).resolve().parent
    db = get_supabase()

    if not ensure_migrations_table(db):
        if not args.dry_run:
            sys.exit(1)

    applied = get_applied_migrations(db)

    if args.status:
        sql_files = sorted(db_dir.glob("*.sql"))
        print(f"\n{'Version':<10} {'Filename':<35} {'Status':<12} {'Applied At'}")
        print("─" * 80)
        for f in sql_files:
            version = f.stem.split("_")[0]
            if version in applied:
                row = applied[version]
                at = row.get("applied_at", "?")
                print(f"{version:<10} {f.name:<35} {'✅ Applied':<12} {at}")
            else:
                print(f"{version:<10} {f.name:<35} {'⏳ Pending':<12}")
        return

    if args.mark_applied:
        version = args.mark_applied
        sql_files = sorted(db_dir.glob(f"{version}_*.sql"))
        if not sql_files:
            print(f"ERROR: No SQL file found for version {version}")
            sys.exit(1)
        f = sql_files[0]
        content = f.read_text(encoding="utf-8")
        checksum = hashlib.sha256(content.encode()).hexdigest()[:16]
        apply_migration(db, {
            "version": version,
            "filename": f.name,
            "checksum": checksum,
        })
        print(f"✅ Marked {version} ({f.name}) as applied")
        return

    pending = get_pending_migrations(db_dir, applied)

    if not pending:
        print("✅ All migrations are applied.")
        return

    print(f"\n{'Pending migrations:'}")
    for m in pending:
        print(f"  {m['version']} — {m['filename']} ({m['checksum']})")

    if args.dry_run:
        print("\n(dry-run mode — no changes made)")
        return

    print("\n⚠️  Supabase does not support raw SQL via REST API.")
    print("Copy each SQL file's content into the Supabase SQL Editor and run it.")
    print("Then use: python -m db.migrate --mark-applied <version>")
    print("to record each migration after running it.\n")


if __name__ == "__main__":
    main()
