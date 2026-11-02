-- ============================================================================
-- Migration 022: Add 'expert' role to memberships.role check constraint
-- Phase: Expert Engineer Role
-- Depends on: 004_auth.sql
-- DO NOT execute automatically.
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop existing check constraint(s) on memberships.role that mention 'supervisor'
    FOR r IN (
        SELECT con.conname
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'memberships'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%supervisor%'
    ) LOOP
        EXECUTE 'ALTER TABLE memberships DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- Add updated check constraint including 'expert'
    ALTER TABLE memberships
        ADD CONSTRAINT memberships_role_check
        CHECK (role IN ('worker', 'supervisor', 'admin', 'viewer', 'expert'));
END $$;

