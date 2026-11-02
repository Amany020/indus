ALTER TABLE troubleshooting_steps
  ALTER COLUMN evidence_ids TYPE text[]
  USING evidence_ids::text[];
