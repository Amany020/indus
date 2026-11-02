-- ============================================================================
-- Migration 023: Expert replies and escalation assignment
-- Phase: Expert Engineer Ticket Handling
-- Depends on: 002_hackathon_slice.sql, 006_rls.sql, 021_escalation_tickets_image.sql
-- DO NOT execute automatically.
-- ============================================================================

-- 1. Add audit / assignment columns to escalation_tickets
ALTER TABLE escalation_tickets ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE escalation_tickets ADD COLUMN IF NOT EXISTS assigned_expert_id UUID;

-- 2. Create escalation_replies table for text, image, and voice replies
CREATE TABLE IF NOT EXISTS escalation_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES escalation_tickets(id) ON DELETE CASCADE,
    factory_id UUID NOT NULL,
    author_id UUID NOT NULL,
    author_role TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'image', 'audio')),
    body TEXT,
    storage_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_escalation_replies_ticket_created
    ON escalation_replies (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS idx_escalations_created_by
    ON escalation_tickets (created_by);

CREATE INDEX IF NOT EXISTS idx_escalations_assigned_expert
    ON escalation_tickets (assigned_expert_id);

-- 4. Tenancy & RLS matching existing factory isolation policies
ALTER TABLE escalation_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS replies_factory_isolation ON escalation_replies;
CREATE POLICY replies_factory_isolation ON escalation_replies
    FOR ALL
    USING (factory_id = (current_setting('app.current_factory_id', true))::uuid);

