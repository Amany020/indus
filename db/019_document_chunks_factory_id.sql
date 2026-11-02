-- Migration 019: Add factory_id to document_chunks and backfill from documents
-- Enables factory-scoped retrieval

-- 1. Add nullable factory_id column
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES factories(id);

-- 2. Backfill factory_id for all existing rows by joining through documents
UPDATE document_chunks dc
SET factory_id = d.factory_id
FROM documents d
WHERE dc.document_id = d.id
  AND dc.factory_id IS NULL;

-- 3. Create index for fast factory-scoped retrieval
CREATE INDEX IF NOT EXISTS idx_document_chunks_factory_id
ON document_chunks(factory_id);
