-- ============================================================================
-- Migration 004: Authentication & Memberships
-- Phase: R2 — Supabase Auth
-- Depends on: 001_schema.sql
--
-- Adds a memberships table linking Supabase Auth users to factories with roles.
-- Does NOT modify any existing table.
-- ============================================================================

-- Memberships: which user belongs to which factory, with what role
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,                          -- Supabase auth.users.id
    factory_id UUID NOT NULL REFERENCES factories(id),
    role TEXT NOT NULL DEFAULT 'worker'
        CHECK (role IN ('worker', 'supervisor', 'admin', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, factory_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_factory ON memberships(factory_id);

-- Audit: track role changes
CREATE TABLE IF NOT EXISTS membership_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL REFERENCES memberships(id),
    changed_by UUID,                                -- user who made the change
    old_role TEXT,
    new_role TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS membership_audit;
-- DROP TABLE IF EXISTS memberships;
-- ============================================================================
