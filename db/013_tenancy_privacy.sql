-- ============================================================================
-- Migration 013: Branch scoping for memberships, chat privacy on queries,
--                branch-specific escalation contacts
-- Depends on: 001_schema.sql, 002_hackathon_slice.sql, 004_auth.sql
-- Additive only. Does NOT drop, rename, or alter types of existing columns.
-- NOTE: queries.user_id is nullable here because existing demo rows have no
--       owner. It will be made NOT NULL in a later migration after M2 (real
--       auth) backfills or archives those rows.
-- ============================================================================

-- 1. memberships: optional branch scope (NULL = factory-wide, e.g. admin)
ALTER TABLE memberships
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS idx_memberships_branch ON memberships(branch_id);

-- 2. queries: ownership + reviewer visibility flag
ALTER TABLE queries
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
    ADD COLUMN IF NOT EXISTS reviewer_visible BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reviewer_visible_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'queries_reviewer_visible_reason_check'
    ) THEN
        ALTER TABLE queries
            ADD CONSTRAINT queries_reviewer_visible_reason_check
            CHECK (
                reviewer_visible_reason IS NULL OR
                reviewer_visible_reason IN (
                    'feedback_no',
                    'feedback_still_working',
                    'high_risk',
                    'escalated',
                    'refused',
                    'unresolved'
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_queries_user_created
    ON queries(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queries_reviewer_queue
    ON queries(branch_id, created_at DESC)
    WHERE reviewer_visible = TRUE;

-- 3. escalation_contacts: the ONE thing that differs per branch
CREATE TABLE IF NOT EXISTS escalation_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id),
    branch_id UUID NOT NULL REFERENCES branches(id),
    name TEXT NOT NULL,
    role_title TEXT,
    contact_method TEXT NOT NULL
        CHECK (contact_method IN ('phone', 'radio', 'email', 'pager')),
    contact_value TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_seed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalation_contacts_branch
    ON escalation_contacts(branch_id);

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS escalation_contacts;
-- DROP INDEX IF EXISTS idx_queries_reviewer_queue;
-- DROP INDEX IF EXISTS idx_queries_user_created;
-- ALTER TABLE queries DROP CONSTRAINT IF EXISTS queries_reviewer_visible_reason_check;
-- ALTER TABLE queries DROP COLUMN IF EXISTS reviewer_visible_reason,
--                     DROP COLUMN IF EXISTS reviewer_visible,
--                     DROP COLUMN IF EXISTS branch_id,
--                     DROP COLUMN IF EXISTS user_id;
-- DROP INDEX IF EXISTS idx_memberships_branch;
-- ALTER TABLE memberships DROP COLUMN IF EXISTS branch_id;
-- ============================================================================
