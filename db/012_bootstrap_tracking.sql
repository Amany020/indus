-- 012_bootstrap_tracking.sql
-- Creates schema_migrations tracking table and backfills records for
-- 001, 002, 003 which are already live but untracked.
-- Does NOT re-execute 001/002/003 — only records that they ran.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    applied_by TEXT DEFAULT 'migrate.py'
);

INSERT INTO schema_migrations (version, filename, checksum, applied_by)
VALUES
    ('001', '001_schema.sql', '901330136b13e095', 'manual_backfill'),
    ('002', '002_hackathon_slice.sql', '55913ee86b2a849c', 'manual_backfill'),
    ('003', '003_seed.sql', 'a522c59f8ee29e20', 'manual_backfill')
ON CONFLICT (version) DO NOTHING;
