-- ============================================================================
-- Migration 008: Retention & Legal Holds
-- Phase: R4
-- Depends on: 001_schema.sql
--
-- Adds retention configuration and legal hold tracking.
-- No existing tables modified.
-- ============================================================================

-- Legal holds: prevent deletion of specific records during investigations
CREATE TABLE IF NOT EXISTS legal_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id),
    hold_reason TEXT NOT NULL,
    affected_table TEXT NOT NULL,           -- 'queries', 'documents', etc.
    affected_id UUID,                       -- specific record, or NULL = whole table
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ,               -- NULL = still active
    released_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_active
    ON legal_holds(factory_id, affected_table)
    WHERE released_at IS NULL;

-- Retention audit log
CREATE TABLE IF NOT EXISTS retention_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id),
    run_mode TEXT NOT NULL CHECK (run_mode IN ('dry_run', 'live')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    records_scanned INT DEFAULT 0,
    records_deleted INT DEFAULT 0,
    records_held INT DEFAULT 0,             -- skipped due to legal hold
    details JSONB DEFAULT '{}'
);

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS retention_runs;
-- DROP TABLE IF EXISTS legal_holds;
-- ============================================================================
