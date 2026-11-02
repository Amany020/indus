-- Migration 021: Add image attachment support to escalation tickets
-- Adds image_storage_key column to store attached photo path

ALTER TABLE escalation_tickets ADD COLUMN IF NOT EXISTS image_storage_key TEXT;

COMMENT ON COLUMN escalation_tickets.image_storage_key IS
  'Supabase storage path for worker-attached photo on an escalation ticket, format: escalation-images/{ticket_id}/{filename}';
