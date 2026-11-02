# IndustryMind — Backend Schema v2.1

## 1. Purpose and Scope

This document defines the database design for IndustryMind, a multimodal industrial assistant for approved SOPs, manuals, expert knowledge, safety events, grounded answers, and human-reviewed knowledge workflows.

This version expands the v2.0 schema with:
- explicit relationships and integrity constraints;
- tenant and role-based access-control rules;
- transaction and workflow consistency requirements;
- document revision and approval rules;
- audit and data-retention guidance;
- indexing, migration, and validation requirements.

**Compatibility note:** The original v2.0 document states that all v1 tables are retained unless noted. The complete v1 schema was not included in that file, so this document does not invent its full definitions. Before applying migrations, merge these changes with the actual v1 schema and verify all referenced tables and columns.

## 2. Database Platform and Conventions

### 2.1 Recommended platform

- **Primary relational database:** PostgreSQL.
- **Vector retrieval:** PostgreSQL with `pgvector` as the initial source of truth.
- **Object storage:** Supabase Storage for original documents, extracted page images, diagrams, and generated audio.
- **Authentication:** Supabase Auth or a compatible JWT identity provider.
- **Application backend:** FastAPI. The backend must enforce authorization on every operation; frontend checks are not security controls.

Avoid maintaining ChromaDB and pgvector as duplicate authoritative indexes in the first release. A separate vector service may be added later if load testing justifies it.

### 2.2 General conventions

- Use UUID primary keys for application entities.
- Store timestamps as `TIMESTAMPTZ` in UTC.
- Use foreign keys for relationships and explicit `ON DELETE` behavior.
- Use database migrations for every schema change. Do not make production schema edits manually.
- Store enum-like states using PostgreSQL enums or checked text columns. Prefer checked text columns if workflow states are expected to evolve frequently.
- Use `NUMERIC` for values requiring exact decimal precision; do not use floating-point fields for authoritative measurements.
- Store large files in object storage, not as binary database columns.
- Treat document content, embeddings, audit events, and workflow status as separate concerns.
- Use soft archival for records that must remain auditable. Hard deletion should be limited to approved retention or legal-erasure workflows.

## 3. Tenant and Access-Control Model

### 3.1 Tenant hierarchy

The logical hierarchy is:

`Factory → Branch → Machine`

Users receive access through explicit membership or role assignments. The existing v1 schema must be inspected to determine whether these entities and memberships already exist.

### 3.2 Mandatory authorization rules

1. Derive the authenticated user ID from a verified JWT. Never trust a client-supplied `user_id`.
2. Derive the allowed factory and branch scope from persisted membership records. A client-supplied `factory_id`, `branch_id`, or `machine_id` is a requested resource, not proof of permission.
3. Enforce tenant scope on document upload, document approval, chunk retrieval, query history, citations, audio, escalation tickets, knowledge submissions, SOP proposals, and analytics.
4. Every tenant-owned row must be directly or indirectly linked to a factory. Prefer an explicit `factory_id` on high-volume/queryable tables where it makes authorization and indexing simpler, while keeping it consistent with parent relationships.
5. Validate that a machine belongs to the requested factory and branch. Validate that a document, chunk, query, ticket, and proposal belong to the same tenant.
6. Apply PostgreSQL Row-Level Security (RLS) where practical, in addition to backend authorization. Service-role credentials must never be exposed to the frontend.
7. Use least-privilege database roles. The normal application role must not be able to rewrite or delete immutable audit records.
8. Cross-factory sharing is disabled by default. Any future sharing feature requires explicit policy and tests.

### 3.3 Suggested role permissions

| Role | Typical permissions |
|---|---|
| Floor Worker | Read approved documents for authorized machines; create queries; submit tips; record resolution feedback |
| Expert / Senior Technician | Worker permissions plus review escalations, tips, and SOP proposals within assigned scope |
| Branch Admin | Manage branch users and escalation contacts within assigned branch |
| Factory Admin | Manage factory documents, machines, users, settings, and factory-level analytics |
| Safety Officer | Review safety-gate events and related high-priority tickets within assigned scope |
| Platform Operator | Operate the service with tightly controlled, audited support access; no routine unrestricted content access |

Role names alone are not sufficient. Each permission check must also verify tenant, branch, machine, and resource ownership.

## 4. Entity Relationships

The following relationships are required. Confirm exact table names and existing columns against the complete v1 schema before migration.

- `factories 1—many branches`
- `factories 1—many machines`
- `branches 1—many machines` where machines are branch-specific
- `factories 1—many documents`
- `machines 1—many documents` (machine-specific documents; `machine_id` may be null for factory-wide documents)
- `documents 1—many document_chunks`
- `users 1—many queries`
- `machines 1—many queries` (nullable when no machine is identified)
- `queries 1—many cited chunks` through a join table, recommended instead of an array for referential integrity
- `queries 0/1—many escalation tickets`, depending on whether multiple tickets per query are allowed; default recommendation is one active ticket per query and a uniqueness rule for that condition
- `queries 1—many SOP gap flags`
- `sop_gap_flags 1—many sop_change_proposals` where a proposal may be triggered by a gap flag
- `documents 1—many sop_change_proposals`
- `users 1—many pending_knowledge_submissions`
- `pending_knowledge_submissions 0/1—1 promoted document chunk`
- `users 1—many safety_gate_events`
- `safety_baseline_library` rows reference the approving user and versioned statement
- `users 1—many document revisions / approvals / audit events`, as applicable

Where the v1 schema uses different names, retain its established naming or provide a documented migration mapping.

## 5. Tables

The definitions below are logical requirements. Field types are PostgreSQL-oriented; adjust only through reviewed migrations.

### 5.1 `documents` (updated)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `document_id` | UUID | PK |
| `factory_id` | UUID | FK to factory; NOT NULL |
| `branch_id` | UUID | FK to branch; nullable if factory-wide |
| `machine_id` | UUID | FK to machine; nullable if factory-wide |
| `document_title` | VARCHAR(255) | NOT NULL |
| `document_type` | TEXT / ENUM | `SOP`, `Manual`, `Expert_Tip`, `Safety_Baseline` |
| `file_url` | TEXT | Object-storage key/path; avoid public URLs for private documents |
| `revision` | VARCHAR(50) | NOT NULL; document-control revision |
| `approval_status` | TEXT / ENUM | `Draft`, `Pending_Review`, `Approved`, `Archived` |
| `effective_date` | DATE | Nullable until approved |
| `uploaded_by` | UUID | FK to users; NOT NULL |
| `approved_by` | UUID | FK to users; nullable |
| `approved_at` | TIMESTAMPTZ | Nullable |
| `supersedes_document_id` | UUID | Self-FK to prior revision, nullable |
| `content_hash` | VARCHAR(128) | Optional checksum for integrity and duplicate detection |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `archived_at` | TIMESTAMPTZ | Nullable |

**Rules**
- Only an authorized reviewer may approve a document.
- `Approved` requires `approved_by`, `approved_at`, and a valid `effective_date`.
- An approved revision is not edited in place. Create a new revision and link it with `supersedes_document_id`.
- Only approved, effective, non-archived documents may be used as official SOP/manual retrieval sources.
- Expert tips must remain distinguishable from official SOPs in both citations and UI.
- Enforce uniqueness for the document-control identity, such as `(factory_id, document_title, revision)` or a stable document-series identifier plus revision. Choose the correct key for the organization's revision conventions.
- Do not make `file_url` publicly readable by default.

### 5.2 `document_chunks` (updated)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `chunk_id` | UUID | PK |
| `document_id` | UUID | FK to documents; NOT NULL |
| `chunk_type` | TEXT / ENUM | `text`, `image`, `table`, `diagram` |
| `content_text` | TEXT | Nullable for image-only chunks |
| `image_storage_key` | TEXT | Private object-storage key; replaces direct public URL where possible |
| `page_number` | INT | 1-based; nullable only when not page-based |
| `embedding_vector` | VECTOR | Dimension must match the selected embedding model |
| `bounding_box` | JSONB | `{x, y, width, height}` with documented coordinate system |
| `risk_level` | TEXT / ENUM | `None`, `Caution`, `Hazardous` |
| `metadata` | JSONB | Non-authoritative extraction metadata only |
| `chunk_index` | INT | Stable order within a document revision |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Rules**
- Chunk access is inherited from its parent document and tenant.
- A chunk must never be retrieved if its parent document is not approved and effective for the query's target date.
- Define whether bounding boxes are normalized (0–1) or page-pixel coordinates. Store page width/height and rotation/orientation if needed to map boxes correctly.
- Embedding dimensions and model/version must be recorded. Re-embedding must be reproducible.
- Chunk rows for a new revision are indexed only after the document passes approval and ingestion validation, according to the chosen publishing workflow.
- Add a uniqueness constraint such as `(document_id, chunk_index)`.

### 5.3 `safety_baseline_library` (new)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `baseline_id` | UUID | PK |
| `category` | VARCHAR(100) | NOT NULL |
| `statement_text` | TEXT | NOT NULL; expert-approved text |
| `version` | VARCHAR(50) | NOT NULL |
| `approved_by` | UUID | FK to users; NOT NULL |
| `effective_date` | DATE | NOT NULL |
| `expires_at` | DATE | Nullable |
| `status` | TEXT / ENUM | `Draft`, `Approved`, `Archived` |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Rules**
- Only approved and currently effective statements may be served.
- Updates create a new version rather than silently overwriting the old statement.
- The baseline library provides conservative general safety guidance. It must not invent machine-specific operating instructions.
- Safety refusal text should be a fixed, reviewed response template with an appropriate baseline citation where applicable.

### 5.4 `safety_gate_events` (new)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `event_id` | UUID | PK |
| `factory_id` | UUID | FK; NOT NULL when tenant context is known |
| `user_id` | UUID | FK; nullable for unauthenticated/pre-auth events if supported |
| `query_id` | UUID | FK to queries; nullable if blocked before query creation |
| `query_text` | TEXT | Minimize or redact sensitive data according to retention policy |
| `matched_pattern` | VARCHAR(255) | Rule identifier/version, not only display text |
| `rule_version` | VARCHAR(50) | NOT NULL |
| `action_taken` | TEXT / ENUM | e.g. `Refused_And_Escalated` |
| `outcome` | TEXT / ENUM | Result of refusal/escalation handling |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Rules**
- Write the event before returning the refusal where practical. If the audit write fails, follow a documented fail-safe policy for safety-related events.
- Application roles may insert events but may not update or delete them.
- Store minimal necessary query information and restrict read access to Safety Officers and explicitly authorized auditors.
- A safety event and its escalation ticket must be correlated by IDs and created idempotently.

### 5.5 `queries` (updated)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `query_id` | UUID | PK |
| `factory_id` | UUID | FK; NOT NULL |
| `branch_id` | UUID | FK; nullable if not applicable |
| `user_id` | UUID | FK; NOT NULL for authenticated worker queries |
| `machine_id` | UUID | FK; nullable |
| `input_mode` | TEXT / ENUM | `text`, `voice`, `qr` |
| `query_text` | TEXT | Confirmed text used for processing |
| `transcript_confirmed` | BOOLEAN | Required/true for voice queries before processing |
| `query_language` | VARCHAR(20) | BCP 47 language tag recommended |
| `response_text` | TEXT | Nullable until completed |
| `response_audio_key` | TEXT | Private storage key; nullable |
| `confidence_retrieval_score` | REAL | Nullable until evaluated; normalized range must be documented |
| `confidence_citation_score` | REAL | Nullable until evaluated |
| `confidence_numeric_score` | REAL | Nullable until evaluated |
| `confidence_conflict_score` | REAL | Nullable until evaluated |
| `confidence_composite` | REAL | Nullable until evaluated |
| `was_escalated` | BOOLEAN | NOT NULL, default false |
| `was_refused_unsafe` | BOOLEAN | NOT NULL, default false |
| `resolution_status` | TEXT / ENUM | `Resolved`, `Not_Resolved`, `Still_Working`, `Not_Answered`; nullable pending feedback |
| `resolved_at` | TIMESTAMPTZ | Nullable |
| `processing_status` | TEXT / ENUM | `Received`, `Processing`, `Answered`, `Escalated`, `Failed` |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `completed_at` | TIMESTAMPTZ | Nullable |

**Rules**
- Persist a voice query only as processable after transcript confirmation. Draft transcripts may be stored separately if product policy requires it.
- Scores must use one documented scale, preferably 0–1. Null means “not computed,” not zero.
- `resolved_at` is set only when the worker marks the issue resolved. `Still_Working` and `Not_Resolved` must not be treated as successful resolution.
- Store generation and validation metadata if needed for reproducibility, but do not store secrets or authentication tokens.
- If query content may contain personal or sensitive data, apply access and retention controls.

### 5.6 `query_citations` (recommended join table)

The v2.0 schema uses `cited_chunk_ids UUID[]`. Prefer a join table for referential integrity and per-citation details.

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `query_id` | UUID | FK to queries |
| `chunk_id` | UUID | FK to document_chunks |
| `citation_order` | INT | NOT NULL |
| `claim_reference` | TEXT | Optional short claim or response segment supported |
| `page_number` | INT | Optional display snapshot |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

Primary key recommendation: `(query_id, chunk_id, citation_order)` or a dedicated citation UUID. Keep the original chunk relationship so citations remain traceable. If the cited source is later archived, the historical query must still show what revision was used.

### 5.7 `escalation_tickets` (updated)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `ticket_id` | UUID | PK |
| `factory_id` | UUID | FK; NOT NULL |
| `branch_id` | UUID | FK; nullable |
| `query_id` | UUID | FK to queries; NOT NULL |
| `contact_id` | UUID | FK to existing escalation-contact entity; confirm v1 table |
| `ai_drafted_brief` | TEXT | Nullable until drafted |
| `expert_edited_brief` | TEXT | Nullable |
| `priority` | TEXT / ENUM | `Normal`, `High` |
| `status` | TEXT / ENUM | `Open`, `In_Progress`, `Resolved`, `Cancelled` |
| `assigned_to` | UUID | FK to users; nullable |
| `resolution_notes` | TEXT | Nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `resolved_at` | TIMESTAMPTZ | Nullable |

**Rules**
- Safety-gate events create high-priority tickets.
- Ticket creation must be idempotent to avoid duplicate tickets on retries.
- The assigned expert must be authorized for the ticket's tenant and branch.
- Experts must review/edit the AI draft before sending it externally if it contains unverified claims.
- Use a partial unique index to enforce one active ticket per query if that is the selected product rule.

### 5.8 `pending_knowledge_submissions` (new)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `submission_id` | UUID | PK |
| `factory_id` | UUID | FK; NOT NULL |
| `machine_id` | UUID | FK; NOT NULL |
| `submitted_by` | UUID | FK to users; NOT NULL |
| `tip_text` | TEXT | NOT NULL |
| `status` | TEXT / ENUM | `Pending`, `Approved`, `Rejected`, `Withdrawn` |
| `reviewed_by` | UUID | FK to users; nullable |
| `reviewed_at` | TIMESTAMPTZ | Nullable |
| `review_notes` | TEXT | Nullable |
| `promoted_chunk_id` | UUID | FK to document_chunks; nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Rules**
- Submissions are untrusted user content until reviewed.
- Approval and promotion must occur in one transaction or through an idempotent workflow with recoverable states.
- Only approved tips may be indexed as `Expert_Tip`; they must remain distinguishable from official SOPs.
- Reviewers cannot approve their own submissions unless an explicitly documented policy permits it.
- Verify that the submitting user can access the specified machine.

### 5.9 `sop_change_proposals` (new)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `proposal_id` | UUID | PK |
| `factory_id` | UUID | FK; NOT NULL |
| `triggered_by_gap_flag_id` | UUID | FK to `sop_gap_flags`; nullable |
| `document_id` | UUID | FK to target document; NOT NULL |
| `ai_drafted_change` | TEXT | NOT NULL |
| `expert_edited_change` | TEXT | Nullable |
| `status` | TEXT / ENUM | `Pending`, `Approved`, `Rejected`, `Withdrawn` |
| `reviewed_by` | UUID | FK to users; nullable |
| `reviewed_at` | TIMESTAMPTZ | Nullable |
| `review_notes` | TEXT | Nullable |
| `resulting_document_id` | UUID | FK to new document revision; nullable |
| `resulting_document_revision` | VARCHAR(50) | Nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Rules**
- A proposal is a draft, never an official instruction.
- Approval creates a new document revision; do not edit the approved revision in place.
- Record who approved the proposal and which resulting revision was created.
- Reject or re-evaluate a proposal if the target document changed after the proposal was drafted.
- Proposal approval and revision creation must be atomic or implemented as an idempotent, recoverable workflow.

### 5.10 `sop_gap_flags` (updated)

| Field | Suggested type | Constraints / notes |
|---|---|---|
| `flag_id` | UUID | PK |
| `factory_id` | UUID | FK; NOT NULL |
| `query_id` | UUID | FK to queries; NOT NULL |
| `document_id` | UUID | FK; nullable |
| `description` | TEXT | NOT NULL |
| `topic_key` | VARCHAR(255) | Normalized machine/topic identifier for aggregation |
| `occurrence_count` | INT | NOT NULL, default 1, CHECK >= 1 |
| `status` | TEXT / ENUM | `Pending`, `Reviewed`, `Resolved`, `Proposal_Drafted` |
| `flagged_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Rules**
- Define the deduplication window and similarity policy used to group repeated gaps.
- Do not increment `occurrence_count` solely because two descriptions share a keyword. Use a reviewable matching strategy and retain links to the underlying queries.
- A gap flag must not be used to bypass document approval.

## 6. Supporting Tables Recommended

The following tables may already exist in v1. Reuse them if present instead of creating duplicates.

### 6.1 Membership / role assignment

A persisted mapping from user to factory/branch and role is required. If v1 does not already provide one, add a table such as:

- `membership_id UUID PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES users`
- `factory_id UUID NOT NULL REFERENCES factories`
- `branch_id UUID NULL REFERENCES branches`
- `role TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `revoked_at TIMESTAMPTZ NULL`

Add checks to prevent invalid scope combinations and indexes for active membership lookups. Do not assume a user has only one role or belongs to only one branch unless that is a confirmed product rule.

### 6.2 Audit events

If the existing audit model cannot capture document revisions, approvals, expert edits, permission changes, and workflow outcomes, add an append-only audit table with:
- event ID, actor ID, factory/branch scope, action, entity type and ID;
- timestamp, request/correlation ID, and minimal structured metadata;
- no passwords, tokens, or unnecessary sensitive content.

Restrict updates/deletes and consider an external append-only destination for stronger tamper evidence.

### 6.3 Query feedback history

If workers can change their resolution feedback, preserve the history in a separate table rather than overwriting all prior feedback. Include query ID, user ID, status, timestamp, and optional feedback text subject to retention policy.

## 7. Transaction and Workflow Rules

### 7.1 Document upload and publishing

1. Create a `Draft` document record and upload the file to private object storage.
2. Validate file type, size, malware status, and tenant scope.
3. Extract content and build chunks/embeddings in a non-published state.
4. Run ingestion quality checks and attach page/diagram metadata.
5. Submit for review.
6. On approval, atomically update approval metadata and publish/index the approved revision.
7. If indexing fails, keep the document unavailable for retrieval and expose a retryable error. Do not report success prematurely.
8. When superseding a revision, preserve historical citations and prevent new queries from using the superseded revision after its effective end.

Because object storage and PostgreSQL do not share a single transaction, use a recoverable state machine or outbox/job pattern for upload and indexing.

### 7.2 Query processing

1. Authenticate and authorize the user and machine scope.
2. For voice input, require transcript confirmation before retrieval.
3. Run the deterministic safety gate before retrieval or generation.
4. Persist the query and processing status.
5. Retrieve only approved, effective documents the user may access.
6. Generate a candidate answer and validate citations, numeric/unit claims, and conflicts.
7. Return a direct answer only when the configured policy passes. Otherwise return approved fallback guidance and create an escalation.
8. Store citations, score components, status, and correlation IDs.
9. Record resolution feedback separately or in a controlled update path.

Use idempotency keys or unique request IDs to prevent duplicate query and escalation records when clients retry.

### 7.3 Safety refusal and escalation

- The refusal path must not call the generation model to decide whether to refuse.
- Use a fixed, reviewed refusal template.
- Record the event and attempt ticket creation reliably.
- If ticket creation is temporarily unavailable, persist a retryable event/outbox item and alert operations according to the safety policy.
- Do not claim that an escalation was created until the database confirms it.

### 7.4 Tip approval and promotion

- A tip remains excluded from retrieval while pending.
- Reviewer authorization and any self-approval restriction are checked server-side.
- Approval, creation of the `Expert_Tip` source/chunk, and promotion linkage must be atomic or safely retryable.
- Rejection records reviewer and time; rejected tips remain non-retrievable.

### 7.5 SOP proposal approval

- Only authorized experts can approve, edit, or reject proposals.
- Approval creates a new revision and preserves the old revision.
- Re-check the source revision before approval to prevent overwriting newer changes.
- Record the reviewer, decision, timestamp, and resulting revision.

## 8. Data Retention and Privacy

Retention durations must be set by the organization and applicable law; this document does not prescribe a legal retention period.

Define and document a retention schedule for:

| Data class | Policy requirements |
|---|---|
| Original manuals and SOPs | Retain approved revisions according to document-control policy; preserve records needed for traceability |
| Draft uploads and failed ingestion artifacts | Delete or expire after a configured period unless under review or investigation |
| Query text and generated answers | Restrict access; define retention, deletion, and redaction rules |
| Voice recordings and generated audio | Avoid retaining raw recordings by default unless needed and consented to; set separate retention rules |
| Safety events and audit logs | Retain according to safety, audit, and legal requirements; restrict access and prevent ordinary updates/deletes |
| Worker tips and rejected submissions | Define review and deletion periods; retain only necessary audit metadata after content deletion |
| Cache entries | Expire by policy and invalidate when relevant documents, permissions, or safety rules change |
| Embeddings and extracted chunks | Delete or re-index when the source is removed, access changes, or retention policy requires it |

Additional requirements:
- Do not log credentials, JWTs, API keys, or other secrets.
- Minimize sensitive content in logs and telemetry.
- Define how legal holds, deletion requests, and backup expiration work.
- Ensure deletion or archival in PostgreSQL is coordinated with object storage and vector indexes.

## 9. Indexing Strategy

Start with indexes that match actual query patterns, then validate them using `EXPLAIN ANALYZE`.

Recommended baseline:
- B-tree index on `documents(factory_id, approval_status, effective_date)`.
- B-tree index on `documents(machine_id, approval_status)` where useful.
- B-tree index on `document_chunks(document_id, chunk_index)`.
- B-tree or composite index for tenant/machine filtering on queryable chunk metadata or explicit tenant columns.
- Vector index on `document_chunks.embedding_vector`, selected according to pgvector version and measured workload.
- B-tree index on `queries(factory_id, created_at DESC)`.
- B-tree index on `queries(resolution_status, resolved_at)`.
- B-tree index on `safety_gate_events(factory_id, created_at DESC)` and `safety_gate_events(user_id, created_at DESC)`.
- B-tree index on `escalation_tickets(factory_id, status, priority, created_at DESC)`.
- B-tree index on `pending_knowledge_submissions(factory_id, status, created_at DESC)`.
- B-tree index on `sop_change_proposals(factory_id, status, created_at DESC)`.
- Index foreign-key columns used for joins and authorization checks.

For vector search:
- Confirm embedding dimensions and distance metric.
- Apply tenant and approval filters as part of retrieval, not as a UI-only filter.
- Test filtered recall and latency at realistic tenant sizes.
- Choose HNSW or IVFFlat only after checking the deployed pgvector version, dataset size, and workload.

## 10. Migration Plan

Do not apply this schema as a single destructive rewrite.

### Migration 0 — Inventory
- Obtain the full v1 schema and current migrations.
- List all tables, enums, constraints, triggers, RLS policies, and indexes.
- Map existing foreign keys and resolve naming differences.
- Back up the database and test restoration.

### Migration 1 — Additive schema changes
- Add new nullable columns and new tables first.
- Add indexes using the database's safe online/concurrent approach where supported.
- Avoid renaming or dropping existing columns in the same deployment.

### Migration 2 — Backfill and validation
- Backfill tenant IDs and new status fields where source data supports it.
- Mark unknown or unverified values explicitly; do not fabricate approval dates or reviewers.
- Validate foreign keys, duplicate revisions, and orphaned chunks.
- Build and validate embeddings and citation mappings.

### Migration 3 — Application dual compatibility
- Deploy code that can read old and new representations during transition.
- Write both formats temporarily if required, such as the existing `cited_chunk_ids` array and the new `query_citations` table.
- Compare results and monitor errors.

### Migration 4 — Enforce constraints
- Add `NOT NULL`, foreign keys, uniqueness, and check constraints after backfill passes.
- Enable and verify RLS policies.
- Confirm application roles cannot mutate audit events or bypass tenant filters.

### Migration 5 — Cutover and cleanup
- Switch reads to the new representation.
- Verify query results, citation display, ticket workflows, and analytics.
- Remove legacy columns only in a later migration after rollback is no longer needed.

Every migration must have a rollback or recovery plan. For irreversible data changes, prefer forward-fix recovery backed by a verified restore procedure.

## 11. Database-Level Constraints and Validation

At minimum, add and test:
- `CHECK (occurrence_count >= 1)` on `sop_gap_flags`.
- Confidence scores either null or within the documented scale.
- Approval-state consistency: approved documents require approver and approval timestamp.
- Resolution-state consistency: `resolved_at` is populated only for resolved cases, according to the chosen workflow.
- Unique revision identity per document series.
- Unique `(document_id, chunk_index)`.
- Foreign keys for all IDs referencing users, machines, documents, queries, and tickets.
- Tenant consistency between child and parent entities.
- Partial uniqueness for active escalation tickets if the product enforces one active ticket per query.
- Unique idempotency keys for retryable ingestion, query, escalation, and promotion jobs.

Some cross-table constraints cannot be enforced by ordinary `CHECK` constraints. Use composite foreign keys, triggers, controlled stored procedures, or backend transactions where necessary, and test them explicitly.

## 12. Operational Observability

Record structured metrics and correlation IDs for:
- document ingestion status and duration;
- indexing and re-indexing failures;
- query processing latency by stage;
- retrieval results and document revisions used;
- validation failures and fallback frequency;
- safety-gate triggers and ticket-creation outcomes;
- approval queue age and reviewer throughput;
- cache hits, expirations, and invalidations.

Do not place raw secrets or unnecessary query content in metrics labels. Limit access to detailed traces.

## 13. Required Test Cases

Before production, verify at least the following:

1. A worker cannot retrieve another factory's document by guessing its UUID.
2. A branch admin cannot approve a document outside their branch/factory scope.
3. A pending, archived, or not-yet-effective document is excluded from official retrieval.
4. A superseded revision is not used for new queries after its effective end.
5. An unsafe request is refused before retrieval and generation.
6. A safety event retry does not create duplicate escalation tickets.
7. A voice query cannot be processed before transcript confirmation.
8. A numerical answer that conflicts with its cited source fails validation.
9. A pending or rejected tip is not searchable.
10. An approved tip is labeled as expert knowledge, not an official SOP.
11. SOP proposal approval creates a new revision without altering the previous approved revision.
12. A failed indexing job does not expose a partially indexed document.
13. A worker cannot read another user's restricted escalation ticket unless authorized.
14. Audit events cannot be updated or deleted by the normal application role.
15. Retention and deletion jobs handle database rows, files, embeddings, and cache entries consistently.

## 14. Open Decisions Before Implementation

Resolve these with the product owner and engineering team:
- Exact v1 schema and names for `users`, `factories`, `branches`, `machines`, escalation contacts, and audit tables.
- Whether a query can have multiple escalation tickets or only one active ticket.
- Whether workers can revise resolution feedback and how history is stored.
- Document-series identity and revision uniqueness policy.
- Supported languages and whether raw voice audio is retained.
- Confidence score normalization, thresholds, and critical-failure overrides.
- Retention periods for queries, audio, rejected tips, and audit records.
- Whether RLS is enforced for all tenant-owned tables or supplemented by a tightly controlled service layer.
- The embedding model, vector dimension, distance metric, and re-indexing policy.

## 15. Definition of Done

The backend schema is ready for production implementation only when:
- it has been reconciled with the actual v1 schema;
- migrations run successfully against a clean database and a copy of existing data;
- tenant isolation and role permissions are covered by automated tests;
- approval and escalation workflows are retry-safe;
- document revisions and historical citations are traceable;
- retention and audit controls are documented and tested;
- retrieval indexes and constraints are validated against representative data.

---

**Status:** Expanded design specification. This document is not a ready-to-run SQL migration. Exact DDL should be generated only after the existing v1 schema, current migrations, and deployment configuration have been reviewed.
