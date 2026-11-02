-- ============================================================================
-- Migration 011: Change-Impact Engine
-- Phase: R9 — Knowledge Change-Impact Engine
-- Depends on: 001_schema.sql, 005_tenancy.sql, 010_knowledge_graph.sql
--
-- Tracks potential impacts when a manual or SOP revision is uploaded.
-- Links changed passages to affected entities, procedures, and review queues.
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_revision_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    source_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    old_revision TEXT,
    new_revision TEXT NOT NULL,
    affected_entity_type TEXT NOT NULL,
    affected_entity_id UUID,
    affected_entity_name TEXT,
    impact_reason TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected', 'deferred')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dri_factory ON document_revision_impacts(factory_id);
CREATE INDEX IF NOT EXISTS idx_dri_status ON document_revision_impacts(review_status);
CREATE INDEX IF NOT EXISTS idx_dri_doc ON document_revision_impacts(source_document_id);

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS document_revision_impacts;
-- ============================================================================
