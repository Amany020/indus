-- ============================================================================
-- Migration 015: User Profiles Table
-- Phase: M2 — Real Authentication
-- Depends on: 001_schema.sql, 004_auth.sql
--
-- Minimal user profile table linked to Supabase auth.users.
-- Stores user identity data separate from auth credentials and tenancy.
--
-- RLS: enabled. All application writes/reads go through the backend's
-- service-role client (see backend/app/core/database.py), which bypasses
-- RLS entirely — so this policy has zero effect on current app behavior.
-- It exists only as a safety net against any future direct client-side
-- (anon-key) access to this table.
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- A user may read only their own profile row. No INSERT/UPDATE/DELETE
-- policies are defined — all writes happen exclusively via the backend's
-- service-role client, which bypasses RLS entirely regardless of policy.
CREATE POLICY profiles_select_own ON profiles
    FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================================================
-- ROLLBACK:
-- DROP POLICY IF EXISTS profiles_select_own ON profiles;
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS profiles;
-- ============================================================================
