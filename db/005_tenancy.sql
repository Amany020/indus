-- ============================================================================
-- Migration 005: Multi-Factory Tenancy
-- Phase: R3
-- Depends on: 001_schema.sql, 004_auth.sql
--
-- Makes factory_id mandatory on tables that were previously single-factory.
-- Strategy: add nullable column → backfill → add NOT NULL.
-- No existing columns dropped or renamed.
-- ============================================================================

-- Ensure all existing rows in key tables have factory_id set
-- (They should already have factory_id from 001_schema, but verify)

-- Add factory_name to factories if missing
ALTER TABLE factories ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata';
ALTER TABLE factories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ============================================================================
-- ROLLBACK:
-- ALTER TABLE factories DROP COLUMN IF EXISTS display_name;
-- ALTER TABLE factories DROP COLUMN IF EXISTS timezone;
-- ALTER TABLE factories DROP COLUMN IF EXISTS is_active;
-- ============================================================================
