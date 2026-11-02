-- IndustryMind — Hackathon Slice Migration (002)
-- Run AFTER 001_schema.sql
-- Adds: document_pages, query_citations, safety tables, escalation, troubleshooting

-- ─── Document Pages (page images with dimensions) ──────────────────────────

CREATE TABLE IF NOT EXISTS document_pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number     INT NOT NULL,
    image_storage_key TEXT NOT NULL,
    width           INT,
    height          INT,
    rotation        INT DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, page_number)
);

-- ─── Query Citations (join table, not array) ────────────────────────────────

CREATE TABLE IF NOT EXISTS query_citations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id        UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    chunk_id        UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    citation_order  INT NOT NULL DEFAULT 0,
    claim_reference TEXT,
    page_number     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citations_query ON query_citations (query_id);

-- ─── Safety Baseline Library ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS safety_baseline_library (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        VARCHAR(100) NOT NULL,
    statement_text  TEXT NOT NULL,
    version         VARCHAR(50) NOT NULL DEFAULT '1.0',
    approved_by     VARCHAR(255) NOT NULL DEFAULT 'Safety Team',
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    expires_at      DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'approved'
                    CHECK (status IN ('draft','approved','archived')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed baseline safety statements
INSERT INTO safety_baseline_library (category, statement_text, version, approved_by) VALUES
    ('lockout_tagout', 'Always follow Lockout/Tagout (LOTO) procedures before performing any maintenance or repair work. Verify zero energy state before proceeding. This is a general safety baseline, not from this machine''s manual.', '1.0', 'Safety Team'),
    ('ppe', 'Wear appropriate Personal Protective Equipment (PPE) including safety glasses, gloves, steel-toed boots, and hearing protection as required for the task. This is a general safety baseline, not from this machine''s manual.', '1.0', 'Safety Team'),
    ('isolation', 'Ensure the machine is electrically isolated and all energy sources are discharged before opening any panels or accessing internal components. This is a general safety baseline, not from this machine''s manual.', '1.0', 'Safety Team'),
    ('emergency_stop', 'Know the location of all emergency stop buttons before operating any machine. In an emergency, press the nearest E-stop immediately. This is a general safety baseline, not from this machine''s manual.', '1.0', 'Safety Team'),
    ('hot_surfaces', 'Allow adequate cooling time before touching surfaces that may be hot after operation. Use thermal gloves when handling hot components. This is a general safety baseline, not from this machine''s manual.', '1.0', 'Safety Team'),
    ('confined_space', 'Never enter a confined space without proper authorization, atmospheric testing, and a trained standby person. This is a general safety baseline, not from this machine''s manual.', '1.0', 'Safety Team')
ON CONFLICT DO NOTHING;

-- ─── Safety Gate Events (INSERT-ONLY for app role) ──────────────────────────

CREATE TABLE IF NOT EXISTS safety_gate_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id      UUID REFERENCES factories(id),
    query_text      TEXT,
    matched_pattern VARCHAR(255),
    rule_version    VARCHAR(50) NOT NULL DEFAULT '1.0',
    action_taken    VARCHAR(50) NOT NULL DEFAULT 'refused',
    outcome         VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_events_factory_time
    ON safety_gate_events (factory_id, created_at DESC);

-- NOTE: In production, REVOKE UPDATE, DELETE ON safety_gate_events FROM app_role;
-- For hackathon, this is documented but not enforced at DB level.

-- ─── Escalation Tickets ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS escalation_tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id          UUID NOT NULL REFERENCES factories(id),
    query_id            UUID NOT NULL REFERENCES queries(id),
    ai_drafted_brief    TEXT,
    expert_edited_brief TEXT,
    priority            VARCHAR(20) NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('normal','high')),
    status              VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','in_progress','resolved','cancelled')),
    assigned_to         VARCHAR(255),
    resolution_notes    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escalations_factory_status
    ON escalation_tickets (factory_id, status, priority, created_at DESC);

-- ─── SOP Gap Flags ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sop_gap_flags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id          UUID NOT NULL REFERENCES factories(id),
    query_id            UUID NOT NULL REFERENCES queries(id),
    document_id         UUID REFERENCES documents(id),
    description         TEXT NOT NULL,
    topic_key           VARCHAR(255),
    occurrence_count    INT NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
    status              VARCHAR(30) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','reviewed','resolved','proposal_drafted')),
    flagged_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Troubleshooting Sessions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS troubleshooting_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id      UUID NOT NULL REFERENCES factories(id),
    machine_id      UUID NOT NULL REFERENCES machines(id),
    query_id        UUID REFERENCES queries(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','escalated','abandoned')),
    symptom_text    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Troubleshooting Steps ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS troubleshooting_steps (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES troubleshooting_sessions(id) ON DELETE CASCADE,
    step_order          INT NOT NULL,
    step_text           TEXT NOT NULL,
    evidence_ids        UUID[] DEFAULT '{}',
    ledger_category     VARCHAR(20) NOT NULL DEFAULT 'unknown'
                        CHECK (ledger_category IN ('observed','source_backed','inferred','unknown','conflicting')),
    worker_confirmation VARCHAR(20)
                        CHECK (worker_confirmation IS NULL OR worker_confirmation IN ('done','not_done','cant_check')),
    citations           JSONB DEFAULT '[]',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_steps_session
    ON troubleshooting_steps (session_id, step_order);
