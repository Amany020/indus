-- ============================================================================
-- Migration 010: Knowledge Graph
-- Phase: R8 — Knowledge Intelligence Graph
-- Depends on: 001_schema.sql, 005_tenancy.sql
--
-- Connects machines, components, symptoms, failure modes, procedures, and evidence.
-- Enables structured graph traversal with source provenance.
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('machine', 'component', 'symptom', 'failure_mode', 'hazard', 'procedure', 'part')),
    canonical_name TEXT NOT NULL,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ke_factory ON knowledge_entities(factory_id);
CREATE INDEX IF NOT EXISTS idx_ke_machine ON knowledge_entities(machine_id);
CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entities(entity_type);

CREATE TABLE IF NOT EXISTS knowledge_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    target_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('proposed', 'verified', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kr_factory ON knowledge_relationships(factory_id);
CREATE INDEX IF NOT EXISTS idx_kr_source ON knowledge_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kr_target ON knowledge_relationships(target_entity_id);

CREATE TABLE IF NOT EXISTS knowledge_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    relationship_id UUID NOT NULL REFERENCES knowledge_relationships(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    document_revision_id UUID,
    section_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kev_rel ON knowledge_evidence(relationship_id);

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS knowledge_evidence;
-- DROP TABLE IF EXISTS knowledge_relationships;
-- DROP TABLE IF EXISTS knowledge_entities;
-- ============================================================================
