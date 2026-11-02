-- ============================================================================
-- Migration 009: SOP Change Proposals
-- Phase: R7 — SOP Change Proposals
-- Depends on: 001_schema.sql, 005_tenancy.sql
--
-- Enables workers and engineers to propose addendums/updates to existing SOPs.
-- All proposals require safety review and expert approval before merge.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sop_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    proposed_by TEXT NOT NULL DEFAULT 'worker',
    title TEXT NOT NULL,
    current_sop_step TEXT,
    proposed_addition TEXT NOT NULL,
    safety_impact TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
    reviewed_by TEXT,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sop_proposals_factory ON sop_proposals(factory_id);
CREATE INDEX IF NOT EXISTS idx_sop_proposals_status ON sop_proposals(status);
CREATE INDEX IF NOT EXISTS idx_sop_proposals_machine ON sop_proposals(machine_id);

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS sop_proposals;
-- ============================================================================
