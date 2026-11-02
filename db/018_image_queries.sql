-- Migration 018: Add image query support
-- Allows 'image' input_mode on queries and adds image_storage_key column

-- 1. Update input_mode CHECK constraint to allow 'image'
ALTER TABLE queries DROP CONSTRAINT IF EXISTS queries_input_mode_check;
ALTER TABLE queries ADD CONSTRAINT queries_input_mode_check
  CHECK (input_mode IN ('text', 'voice', 'qr', 'image'));

-- 2. Add nullable column for image storage path
ALTER TABLE queries ADD COLUMN IF NOT EXISTS image_storage_key TEXT;

-- 3. Documentation comment
COMMENT ON COLUMN queries.image_storage_key IS
  'Supabase storage path for worker-attached image queries, format: query-images/{query_id}/{filename}';
