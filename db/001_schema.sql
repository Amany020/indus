-- IndustryMind — Base Schema (001)
-- Run in Supabase SQL Editor FIRST
-- Prerequisites: CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Factories & Branches ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS factories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id  UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Machines ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS machines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id      UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    workcell        VARCHAR(255) NOT NULL DEFAULT '',
    model_number    VARCHAR(100),
    qr_code_value   VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Documents ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id              UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    machine_id              UUID REFERENCES machines(id) ON DELETE SET NULL,
    filename                VARCHAR(500) NOT NULL,
    doc_type                VARCHAR(50) NOT NULL DEFAULT 'manual'
                            CHECK (doc_type IN ('manual','sop','spec','safety','expert_tip')),
    revision                VARCHAR(50) NOT NULL DEFAULT '1.0',
    approval_status         VARCHAR(50) NOT NULL DEFAULT 'queued'
                            CHECK (approval_status IN ('queued','processing','approved','rejected','superseded','failed')),
    page_count              INT NOT NULL DEFAULT 0,
    owner                   VARCHAR(255),
    file_storage_key        TEXT,
    content_hash            VARCHAR(128),
    approved_by             VARCHAR(255),
    approved_at             TIMESTAMPTZ,
    supersedes_document_id  UUID REFERENCES documents(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce one approved revision per document series (factory + filename + revision)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_approved_unique
    ON documents (factory_id, filename, revision)
    WHERE approval_status = 'approved';

-- ─── Document Chunks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_chunks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    machine_id          UUID REFERENCES machines(id),
    chunk_type          VARCHAR(20) NOT NULL DEFAULT 'text'
                        CHECK (chunk_type IN ('text','image','table','diagram','figure')),
    content_text        TEXT,
    image_storage_key   TEXT,
    page_number         INT,
    chunk_index         INT NOT NULL DEFAULT 0,
    revision            VARCHAR(50),
    approval_status     VARCHAR(50) NOT NULL DEFAULT 'queued',
    embedding_vector    vector(768),
    bbox                JSONB,
    risk_level          VARCHAR(20) NOT NULL DEFAULT 'none'
                        CHECK (risk_level IN ('none','caution','hazardous')),
    section_heading     VARCHAR(500),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_order
    ON document_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_chunks_machine_approved
    ON document_chunks (machine_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_chunks_document
    ON document_chunks (document_id);

-- ─── Full-Text Search (config 'simple', no stemming — preserves error codes) ─

ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS
    fts_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(content_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_fts ON document_chunks USING gin(fts_vector);

-- ─── Queries ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS queries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id          UUID NOT NULL REFERENCES factories(id),
    machine_id          UUID REFERENCES machines(id),
    session_id          VARCHAR(255),
    input_mode          VARCHAR(20) NOT NULL DEFAULT 'text'
                        CHECK (input_mode IN ('text','voice','qr')),
    query_text          TEXT NOT NULL,
    query_language      VARCHAR(20) DEFAULT 'en',
    transcript_confirmed BOOLEAN DEFAULT true,
    raw_transcript      TEXT,
    response_text       TEXT,
    response_summary    TEXT,
    status              VARCHAR(20) DEFAULT 'processing'
                        CHECK (status IN ('supported','limited','escalate','restricted','processing','failed')),
    steps               JSONB DEFAULT '[]',
    warnings            JSONB DEFAULT '[]',
    evidence_pack       JSONB DEFAULT '[]',
    expert_tips         JSONB DEFAULT '[]',
    detected_language   VARCHAR(20),
    latency_ms          INT,
    was_escalated       BOOLEAN NOT NULL DEFAULT false,
    was_refused_unsafe  BOOLEAN NOT NULL DEFAULT false,
    idempotency_key     VARCHAR(255),
    resolution_status   VARCHAR(30)
                        CHECK (resolution_status IS NULL OR resolution_status IN ('resolved','not_resolved','still_working')),
    resolved_at         TIMESTAMPTZ,
    demo_cached         BOOLEAN NOT NULL DEFAULT false,
    feedback            VARCHAR(50),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queries_idempotency
    ON queries (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queries_factory_time
    ON queries (factory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queries_resolution
    ON queries (resolution_status, resolved_at);

-- ─── Expert Tips ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id      UUID NOT NULL REFERENCES factories(id),
    machine_id      UUID NOT NULL REFERENCES machines(id),
    submitted_by    VARCHAR(255) NOT NULL,
    tip_text        TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN ('pending_review','approved','rejected')),
    reviewer        VARCHAR(255),
    review_notes    TEXT,
    reviewed_at     TIMESTAMPTZ,
    related_query_id UUID REFERENCES queries(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tips_factory_status
    ON tips (factory_id, status, created_at DESC);

-- ─── RPC: match_chunks (dense vector search) ────────────────────────────────

CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(768),
    match_machine_id UUID,
    match_count INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    chunk_type VARCHAR(20),
    content_text TEXT,
    image_storage_key TEXT,
    page_number INT,
    chunk_index INT,
    revision VARCHAR(50),
    bbox JSONB,
    risk_level VARCHAR(20),
    section_heading VARCHAR(500),
    similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.chunk_type,
        dc.content_text,
        dc.image_storage_key,
        dc.page_number,
        dc.chunk_index,
        dc.revision,
        dc.bbox,
        dc.risk_level,
        dc.section_heading,
        1 - (dc.embedding_vector <=> query_embedding) AS similarity
    FROM document_chunks dc
    WHERE dc.machine_id = match_machine_id
      AND dc.approval_status = 'approved'
      AND dc.embedding_vector IS NOT NULL
    ORDER BY dc.embedding_vector <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─── RPC: keyword_search_chunks (FTS with 'simple' config) ──────────────────

CREATE OR REPLACE FUNCTION keyword_search_chunks(
    search_query TEXT,
    match_machine_id UUID,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    chunk_type VARCHAR(20),
    content_text TEXT,
    image_storage_key TEXT,
    page_number INT,
    chunk_index INT,
    revision VARCHAR(50),
    bbox JSONB,
    risk_level VARCHAR(20),
    section_heading VARCHAR(500),
    rank FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.chunk_type,
        dc.content_text,
        dc.image_storage_key,
        dc.page_number,
        dc.chunk_index,
        dc.revision,
        dc.bbox,
        dc.risk_level,
        dc.section_heading,
        ts_rank(dc.fts_vector, to_tsquery('simple', search_query)) AS rank
    FROM document_chunks dc
    WHERE dc.machine_id = match_machine_id
      AND dc.approval_status = 'approved'
      AND dc.fts_vector @@ to_tsquery('simple', search_query)
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;
