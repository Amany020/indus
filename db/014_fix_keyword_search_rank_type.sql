-- 014_fix_keyword_search_rank_type.sql
-- Fixes keyword_search_chunks() column-type mismatch (Postgres 42804):
-- ts_rank() returns `real`, but the function declared `rank FLOAT`
-- (= double precision), causing every call to fail with:
--   "Returned type real does not match expected type double precision
--    in column 12."
-- Additive: replaces the function body only. No table changes, no
-- signature changes, no behavior changes beyond the type cast.

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
        ts_rank(dc.fts_vector, to_tsquery('simple', search_query))::double precision AS rank
    FROM document_chunks dc
    WHERE dc.machine_id = match_machine_id
      AND dc.approval_status = 'approved'
      AND dc.fts_vector @@ to_tsquery('simple', search_query)
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

-- ROLLBACK: re-run 001_schema.sql's original CREATE OR REPLACE FUNCTION
-- (without the ::double precision cast) to revert.
