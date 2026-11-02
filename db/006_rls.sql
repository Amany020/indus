-- ============================================================================
-- Migration 006: Row-Level Security Policies
-- Phase: R3
-- Depends on: 005_tenancy.sql, 004_auth.sql
--
-- Enables RLS on main tables. Policies allow access only to rows matching
-- the user's factory_id from their JWT claim or membership.
--
-- IMPORTANT: These policies are dormant until RLS_ENABLED=true AND the
-- Supabase connection uses a role with RLS applied (not service_role).
-- ============================================================================

-- Enable RLS (does nothing until policies + role are active)
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_tickets ENABLE ROW LEVEL SECURITY;

-- Policy: users see only their factory's machines
CREATE POLICY IF NOT EXISTS machines_factory_isolation ON machines
    FOR ALL
    USING (factory_id = (current_setting('app.current_factory_id', true))::uuid);

-- Policy: documents scoped to factory
CREATE POLICY IF NOT EXISTS documents_factory_isolation ON documents
    FOR ALL
    USING (factory_id = (current_setting('app.current_factory_id', true))::uuid);

-- Policy: queries scoped to factory
CREATE POLICY IF NOT EXISTS queries_factory_isolation ON queries
    FOR ALL
    USING (factory_id = (current_setting('app.current_factory_id', true))::uuid);

-- Policy: tips scoped to factory
CREATE POLICY IF NOT EXISTS tips_factory_isolation ON tips
    FOR ALL
    USING (factory_id = (current_setting('app.current_factory_id', true))::uuid);

-- Policy: escalations scoped to factory
CREATE POLICY IF NOT EXISTS escalations_factory_isolation ON escalation_tickets
    FOR ALL
    USING (factory_id = (current_setting('app.current_factory_id', true))::uuid);

-- ============================================================================
-- ROLLBACK:
-- DROP POLICY IF EXISTS machines_factory_isolation ON machines;
-- DROP POLICY IF EXISTS documents_factory_isolation ON documents;
-- DROP POLICY IF EXISTS queries_factory_isolation ON queries;
-- DROP POLICY IF EXISTS tips_factory_isolation ON tips;
-- DROP POLICY IF EXISTS escalations_factory_isolation ON escalation_tickets;
-- ALTER TABLE machines DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE document_chunks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE queries DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE tips DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE escalation_tickets DISABLE ROW LEVEL SECURITY;
-- ============================================================================
