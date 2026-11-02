-- Migration 020: Factory-scoped vector and keyword search functions
-- Adds match_chunks_by_factory and keyword_search_chunks_by_factory without altering existing functions

-- 1. Factory-scoped Dense Vector Search
CREATE OR REPLACE FUNCTION match_chunks_by_factory(
    query_embedding vector(768),
    match_factory_id UUID,
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
    WHERE dc.factory_id = match_factory_id
      AND dc.approval_status = 'approved'
      AND dc.embedding_vector IS NOT NULL
    ORDER BY dc.embedding_vector <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 2. Factory-scoped Keyword (FTS) Search
CREATE OR REPLACE FUNCTION keyword_search_chunks_by_factory(
    search_query TEXT,
    match_factory_id UUID,
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
        ts_rank(dc.fts_vector, to_tsquery('simple', search_query))::double precision AS rank
    FROM document_chunks dc
    WHERE dc.factory_id = match_factory_id
      AND dc.approval_status = 'approved'
      AND dc.fts_vector @@ to_tsquery('simple', search_query)
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;
