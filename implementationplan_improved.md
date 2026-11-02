# IndustryMind — Implementation Plan v2.1

## 1. Purpose

This document defines the recommended build sequence for IndustryMind. It turns the product requirements, technical requirements, backend schema, and UI/UX brief into phases with dependencies, deliverables, acceptance criteria, and tests.

The plan follows the product's documented principles:
- industrial answers must be grounded in approved sources;
- the deterministic safety gate runs before retrieval or generation;
- voice queries require transcript confirmation;
- insufficient evidence triggers an approved fallback and expert escalation;
- tips and SOP changes require human review before becoming searchable or official;
- factory, branch, machine, and role permissions are enforced by the backend;
- resolution outcomes are measured rather than assumed.

This is a planning document, not proof that any phase has already been implemented.

## 2. Delivery Strategy

Build a complete, narrow workflow first, then expand capabilities. Avoid implementing all advanced features in parallel.

### First end-to-end vertical slice

The first demonstrable version should support:
1. One test factory and a small set of machines.
2. A small collection of approved PDF manuals/SOPs.
3. Text-based questions.
4. Tenant-authorized retrieval and page-level citations.
5. A deterministic safety gate.
6. Citation and numeric/unit validation.
7. A safe fallback and expert escalation when evidence is insufficient.
8. Query history and basic resolution feedback.
9. A basic expert review screen.
10. Automated tests for tenant isolation and critical safety flows.

Voice, complex diagram understanding, advanced analytics, and multi-factory scale-out should follow once this core flow is reliable.

## 3. Dependencies and Workstreams

| Workstream | Depends on | Output |
|---|---|---|
| Product decisions | None | Confirmed scope, role matrix, acceptance targets |
| Repository and environments | Product decisions | Reproducible local development and CI |
| Authentication and tenant model | Repository; existing schema review | Secure user and tenant scope |
| Database migrations | Schema review; tenant model | Versioned, tested schema |
| Document ingestion | Storage; schema; authorization | Approved, searchable document revisions |
| Query and retrieval | Auth; ingestion; embedding model | Evidence retrieval and citations |
| Safety and validation | Query pipeline; baseline content | Refusal, confidence gate, safe fallback |
| Escalation workflow | Query pipeline; users/contacts | Reviewable expert tickets |
| Worker UI | API contracts; design brief | Text query and result experience |
| Expert/admin UI | Role model; review APIs | Approval and administration flows |
| Voice and diagrams | Stable query pipeline; ingestion | Voice input/output and diagram highlighting |
| Analytics and deployment | Persisted events; tested core system | Metrics, resilience, production deployment |

## 4. Phase 0 — Scope and Technical Decisions

### Tasks
- Review the full existing v1 database schema and migrations.
- Reconcile `prd.md`, `trd.md`, `backendschema.md`, `appflow.md`, and `uxdesign.md`.
- Confirm the role-permission matrix and factory/branch/machine hierarchy.
- Confirm the initial target machines, document types, and supported language.
- Select one initial vector retrieval implementation. Recommended starting point: PostgreSQL with pgvector, unless a measured requirement justifies a second vector store.
- Choose embedding model, vector dimensions, distance metric, and re-indexing policy.
- Define the confidence score scale, critical validation failures, and initial test thresholds.
- Define data retention, audit access, voice recording policy, and deployment environments.
- Agree on API conventions and document proposed endpoints as contracts, not assumed existing routes.

### Deliverables
- Approved scope for the first release.
- Architecture decision record for retrieval and storage.
- Role-permission matrix.
- Schema inventory and migration map.
- Initial test plan and risk register.

### Acceptance criteria
- No unresolved contradiction exists between the initial scope and the product's safety requirements.
- The actual v1 schema and migration history are available for review.
- The first release has explicit in-scope and out-of-scope features.
- Confidence scoring and safety policies have named owners and testable definitions.

### Tests / checks
- Review session with product and engineering owners.
- Validate all critical user journeys against `appflow.md`.
- Confirm that every user-facing feature maps to a requirement and a test.

## 5. Phase 1 — Repository, Environments, and CI

### Tasks
- Set up the Next.js frontend and FastAPI backend in a documented repository structure.
- Configure local environment variables and safe example environment files.
- Add dependency management, formatting, linting, and type checks.
- Set up unit and API test frameworks.
- Add CI checks for lint, type checks, tests, and migration validation.
- Establish structured logging with request/correlation IDs.
- Ensure secrets are excluded from source control and logs.
- Add health and readiness endpoints.

### Deliverables
- Reproducible local setup instructions.
- Environment variable reference.
- CI pipeline.
- Health/readiness endpoints.
- Baseline test suite.

### Acceptance criteria
- A new developer can run frontend, backend, and tests from the documented instructions.
- CI fails on a deliberately failing test or lint error.
- No secret values are committed.
- Health checks distinguish application startup from dependency readiness.

### Tests / checks
- Clean installation from scratch.
- Frontend lint/type check.
- Backend unit tests.
- API smoke tests.
- Secret scanning and dependency vulnerability checks.

## 6. Phase 2 — Authentication, Authorization, and Database Foundation

### Tasks
- Inspect and reconcile the full v1 schema before writing migrations.
- Add versioned, non-destructive migrations for required v2.1 fields/tables.
- Configure authentication through Supabase Auth or the selected identity provider.
- Implement `/api/v1/me` or an equivalent current-user endpoint.
- Implement persisted membership and role checks.
- Enforce factory, branch, machine, and resource ownership on every protected endpoint.
- Configure RLS where appropriate and use least-privilege backend credentials.
- Add audit-event foundations for approvals and security-sensitive changes.
- Define seed data for a local demo environment without real user secrets.

### Deliverables
- Tested database migrations.
- Authentication integration.
- Authorization service/dependencies.
- Tenant-scope helper functions and policies.
- Audit-event foundation.

### Acceptance criteria
- Users can access only permitted factory/branch/machine resources.
- Client-supplied tenant IDs never grant access by themselves.
- Unauthorized reads and writes are rejected server-side.
- Migrations run against both a clean database and a copy of representative existing data.
- Normal application credentials cannot update/delete protected audit events.

### Tests / checks
- Valid login and expired-session tests.
- Cross-factory and cross-branch access tests.
- UUID-guessing/resource-enumeration tests.
- Role escalation and revoked-membership tests.
- Migration upgrade and recovery/rollback rehearsal.
- RLS policy tests where RLS is used.

## 7. Phase 3 — Document Upload, Ingestion, and Revision Control

### Tasks
- Configure private object storage for original documents and extracted assets.
- Implement document draft creation and upload validation.
- Validate file extension, content type, file size, and parsing safety.
- Extract PDF text and page information using the selected document libraries.
- Extract tables and images where supported; record ingestion warnings.
- Store chunks, page numbers, document revision, risk metadata, and diagram bounding boxes where available.
- Generate embeddings with model/version metadata.
- Implement document review and approval workflow.
- Publish only approved, effective revisions to retrieval.
- Add retry-safe ingestion jobs and a recoverable state for indexing failures.

### Deliverables
- Document library and upload API.
- Ingestion job/state model.
- Chunk and embedding pipeline.
- Document review/publish workflow.
- Small set of approved demo documents.

### Acceptance criteria
- Unsupported files are rejected safely.
- Failed ingestion does not expose partial content to retrieval.
- Every chunk links to a specific document revision and page when available.
- Pending, rejected, archived, or not-yet-effective documents are excluded from official retrieval.
- Approved revisions are traceable and not edited in place.
- Private documents cannot be fetched by unauthorized users.

### Tests / checks
- Valid, empty, malformed, oversized, and unsupported files.
- Duplicate revision and content-hash behavior.
- OCR/extraction quality checks on representative documents.
- Indexing failure and retry tests.
- Revision supersession tests.
- Private object-storage access tests.

## 8. Phase 4 — Core Text Query and Retrieval

### Tasks
- Define the query API and persisted query states.
- Implement authorized machine selection and optional QR resolution.
- Build query orchestration with explicit stage boundaries.
- Retrieve only documents allowed by tenant scope, approval status, and effective date.
- Implement chunk ranking and source attribution.
- Store citations through a referentially valid citation model.
- Return source title, revision, page, and diagram location where available.
- Add timeout, cancellation, and idempotency behavior.
- Create a manually reviewed set of representative worker questions and expected sources.

### Deliverables
- Text-query endpoint.
- Retrieval service.
- Citation response contract.
- Query status and history.
- Evaluation dataset for retrieval and citation quality.

### Acceptance criteria
- A user can ask a text question about an authorized machine and receive relevant source passages.
- Each displayed citation resolves to the correct document revision.
- Unauthorized documents never enter retrieval results.
- When no suitable source is found, the system does not invent a citation.
- Retried requests do not create duplicate query records.

### Tests / checks
- Retrieval relevance on the reviewed dataset.
- Citation correctness and page mapping.
- Cross-tenant retrieval tests.
- Pending/archived/expired document exclusion.
- Empty query, long query, timeout, and retry tests.
- Load tests with a representative document/chunk count.

## 9. Phase 5 — Deterministic Safety Gate and Answer Validation

### Tasks
- Implement a versioned safety rule registry and reviewed refusal templates.
- Run the safety gate before retrieval and generation.
- Define behavior for ambiguous requests, paraphrases, negation, and harmless safety-related questions.
- Record safety-gate events with restricted access and correlation IDs.
- Implement citation-support validation, numeric/unit consistency checks, and source conflict detection.
- Define how missing validator signals are handled.
- Calibrate confidence thresholds using reviewed test examples.
- Create a versioned Safety Baseline Library.
- Route low-confidence or validation-failed responses to the approved fallback and escalation path.

### Deliverables
- Safety gate service.
- Validation pipeline.
- Confidence-score contract and policy.
- Approved baseline safety messages.
- Safety test corpus and evaluation report.

### Acceptance criteria
- Safety checks run before retrieval/generation for every eligible query.
- A blocked request cannot reach the answer-generation step.
- A critical validation failure blocks a direct answer regardless of composite score.
- Unsupported claims, unverified numbers, and material source conflicts cause fallback or escalation.
- Scores are presented as indicators, not guarantees.
- The system records matched rule version and outcome without exposing restricted data.

### Tests / checks
- Unsafe-intent paraphrase suite.
- False-positive tests for benign questions about safety equipment.
- Negation and ambiguous-language tests.
- Numeric mismatch and unit-conversion tests.
- Citation-entailment review against human labels.
- Conflicting source tests.
- Audit-write and safety-event retry tests.

## 10. Phase 6 — Safe Fallback and Expert Escalation

### Tasks
- Implement ticket creation for insufficient evidence and safety-gate events.
- Map each factory/branch to authorized escalation contacts.
- Generate structured AI-drafted briefs from the query context and available evidence.
- Label AI text as draft and require expert review before external sending.
- Add assignment, status, notes, and resolution transitions.
- Add idempotency and recovery for ticket creation.
- Provide worker-visible status without exposing internal expert-only notes.

### Deliverables
- Escalation API.
- Worker escalation status view.
- Expert inbox and detail view.
- Draft brief review flow.
- Ticket audit events.

### Acceptance criteria
- Every eligible escalation is associated with the originating query and tenant.
- Safety-triggered tickets receive the required high priority.
- A failed ticket write is surfaced as pending/failed, never falsely reported as created.
- Repeated requests do not create duplicate active tickets where the policy requires one.
- Only authorized experts can read or update assigned/scope-permitted tickets.

### Tests / checks
- Low-confidence fallback-to-ticket flow.
- Safety refusal-to-high-priority-ticket flow.
- Duplicate request and transient database failure tests.
- Assignment, stale edit, and unauthorized access tests.
- AI draft generation failure with manual brief fallback.
- Ticket status audit tests.

## 11. Phase 7 — Worker UI and Core UX

### Tasks
- Implement the visual system from `uxdesign.md`.
- Build sign-in, machine selection, text query, answer, citations, and history screens.
- Implement explicit progress states driven by backend status.
- Build direct-answer, safe-fallback, and refusal presentations.
- Add resolution feedback.
- Add loading, empty, permission-denied, retry, and conflict states for each data screen.
- Ensure technical citations and document revisions are visible and navigable.

### Deliverables
- Worker-facing web experience.
- Responsive tablet layout.
- Error/empty-state components.
- Basic accessibility coverage.

### Acceptance criteria
- A worker can complete the first end-to-end text-query journey without developer intervention.
- The UI distinguishes a verified answer, a safety refusal, and an expert escalation.
- The UI never claims an operation succeeded before the backend confirms it.
- The interface works at target desktop and tablet sizes.
- Color is not the only signal for status or safety.

### Tests / checks
- Component tests for each query state.
- End-to-end worker journey.
- Keyboard and screen-reader checks.
- Contrast and touch-target review.
- API failure and expired-session UI tests.

## 12. Phase 8 — Expert, Admin, and Knowledge Governance

### Tasks
- Build expert escalation queue and detail screens.
- Build tip submission and review queues.
- Build SOP proposal queue and revision comparison.
- Build document upload/review screens.
- Add machine/branch administration and user membership management as authorized.
- Add explicit approval and audit history.
- Ensure a tip or proposal is not searchable/official before the full promotion workflow succeeds.

### Deliverables
- Expert dashboard.
- Knowledge submission review flow.
- SOP proposal review and new-revision workflow.
- Document approval and revision-management UI.
- Admin role and membership screens.

### Acceptance criteria
- Experts can review and decide tips/proposals only within their scope.
- Approved tips are labeled as expert knowledge, distinct from official SOPs.
- Approved SOP proposals create a new document revision and preserve the prior revision.
- Stale proposals cannot overwrite newer revisions.
- Permission and approval actions are audited.

### Tests / checks
- Approve/reject tip tests.
- Duplicate promotion and indexing retry tests.
- SOP proposal stale-revision conflict tests.
- Unauthorized approval and self-approval policy tests.
- Document review and publishing failure tests.
- Audit trail integrity tests.

## 13. Phase 9 — Voice and Multilingual Experience

### Tasks
- Add microphone capture and transcription service integration.
- Implement mandatory transcript confirmation/edit UI.
- Ensure only confirmed text enters the query pipeline.
- Add text-to-speech output for supported languages.
- Define fallback behavior when language, transcription, or speech synthesis is unavailable.
- Test industrial terminology, machine IDs, numbers, and units across selected languages.
- Define whether raw audio is retained; default to not retaining it unless there is an approved need and policy.

### Deliverables
- Voice query flow.
- Transcript confirmation screen.
- Text/audio response controls.
- Language support matrix and test report.

### Acceptance criteria
- No voice query reaches retrieval/generation before transcript confirmation.
- Edited transcripts, not original drafts, are submitted.
- Text answers remain available when speech synthesis fails.
- Unsupported language or audio failures provide a clear text alternative.
- Audio retention follows the approved privacy policy.

### Tests / checks
- Microphone permission denied.
- Empty/noisy audio and provider timeout.
- Transcript edit/confirm/cancel.
- Numbers, units, machine identifiers, and safety terms.
- Speech output failure and language fallback.
- Confirmation enforcement at API level.

## 14. Phase 10 — Diagram Highlighting and Multimodal Documents

### Tasks
- Improve extraction of diagrams, images, tables, and page regions.
- Store coordinate system, page dimensions, rotation, and bounding boxes.
- Render source page and highlight relevant regions in the dossier panel.
- Validate diagram references against the source revision.
- Keep diagram-derived claims subject to the same evidence and safety rules.

### Deliverables
- Diagram viewer.
- Region-highlighting component.
- Multimodal extraction pipeline.
- Diagram evaluation dataset.

### Acceptance criteria
- A cited diagram region maps to the correct page and visible area.
- Coordinates remain correct across supported zoom and rotation states.
- Failed or low-quality extraction does not create misleading highlights.
- Visual evidence does not bypass citation or safety validation.

### Tests / checks
- Representative diagrams and tables.
- Page rotation and zoom tests.
- Bounding-box alignment review.
- Missing-image and corrupt-page tests.
- Human evaluation of diagram retrieval accuracy.

## 15. Phase 11 — Analytics and Resolution Measurement

### Tasks
- Define metric formulas and reporting windows.
- Implement resolution feedback persistence and history policy.
- Calculate answer, fallback, refusal, escalation, and resolution rates.
- Compute time-to-resolution from valid timestamps and clearly define handling of reopened or unresolved cases.
- Aggregate machine, branch, and factory trends with tenant-safe queries.
- Track expert review throughput and SOP gap frequency.
- Show sample sizes and last-updated timestamps.

### Deliverables
- Analytics API.
- Factory/branch dashboard.
- Metric definitions.
- Data-quality checks.

### Acceptance criteria
- Analytics are computed from persisted events, not hardcoded demo numbers.
- Missing feedback is not counted as successful resolution.
- Tenant filters are enforced server-side.
- Low-sample metrics are clearly labeled.
- Metric definitions are documented and repeatable.

### Tests / checks
- Known-fixture calculations.
- Time-zone and date-range tests.
- Unresolved/reopened query tests.
- Cross-tenant aggregate tests.
- Missing/late feedback tests.
- Dashboard API authorization tests.

## 16. Phase 12 — Resilience, Security Review, and Deployment

### Tasks
- Add timeouts and bounded retries for external dependencies.
- Implement circuit-breaker/fallback behavior for model and speech provider outages.
- Add a controlled cache for prevalidated stable/demo responses.
- Revalidate tenant permissions, current safety policy, and source revision before serving cached content.
- Add rate limits and resource limits for uploads, queries, and audio.
- Configure monitoring, alerts, backup, restore, and retention jobs.
- Deploy frontend and backend to selected hosting providers.
- Run a staged pilot using approved, non-sensitive documents and test accounts.

### Deliverables
- Deployment configuration.
- Operational runbook.
- Monitoring and alert definitions.
- Backup/restore evidence.
- Security and performance test report.
- Pilot readiness checklist.

### Acceptance criteria
- Provider timeouts produce safe, explicit outcomes.
- Cached responses cannot bypass safety, tenant, or document-version checks.
- Database backup restoration has been tested.
- Secrets are managed outside source control.
- Logs avoid secrets and unnecessary sensitive content.
- Critical authorization and safety tests pass in the deployment environment.

### Tests / checks
- Model timeout and outage simulation.
- Cache expiration and invalidation.
- Load and rate-limit tests.
- Backup restore rehearsal.
- Dependency and secret scanning.
- Security review of auth, uploads, RLS, audit access, and tenant boundaries.
- End-to-end staging smoke tests.

## 17. Cross-Phase Quality Gates

No phase should be considered complete only because its screens or endpoints exist.

### Safety gate
- Safety rules run before retrieval/generation.
- Critical refusal and escalation cases pass the reviewed test suite.
- No critical safety failure remains open without an approved mitigation.

### Grounding gate
- Citations resolve to source revisions and pages.
- Human-reviewed evaluation covers unsupported claims, numbers/units, and conflicts.
- Thresholds are based on evaluation, not arbitrary UI appearance.

### Security gate
- Tenant-isolation tests pass for every resource type.
- Role changes and revocations take effect according to policy.
- Secrets and protected audit records are not exposed.

### Workflow gate
- Approval, promotion, escalation, and indexing operations are retry-safe.
- Failed operations show accurate status.
- Historical document revisions remain traceable.

### UX gate
- Every major screen has loading, empty, success, and failure behavior.
- Voice confirmation is mandatory.
- Worker-facing messages are clear and accessible.

## 18. Suggested Milestone Plan

Timing depends on team size, experience, access to documents, and evaluation requirements. The milestones below are sequence-based rather than calendar commitments.

| Milestone | Includes | Exit condition |
|---|---|---|
| M0: Scope locked | Phase 0 | Decisions and test targets approved |
| M1: Secure foundation | Phases 1–2 | Auth, migrations, and tenant tests pass |
| M2: Grounded text prototype | Phases 3–4 | Approved PDF retrieval with traceable citations |
| M3: Safety-ready query flow | Phases 5–6 | Safety gate, validation, fallback, and escalation tested |
| M4: Core product demo | Phases 7–8 | Worker and expert flows work end to end |
| M5: Multimodal experience | Phases 9–10 | Voice confirmation and diagram highlighting pass tests |
| M6: Pilot readiness | Phases 11–12 | Analytics, resilience, security, and deployment gates pass |

## 19. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Incomplete v1 schema knowledge | Unsafe or breaking migration | Inventory actual schema before migrations |
| Low-quality PDFs or diagrams | Weak retrieval/citations | Representative extraction evaluation and review queue |
| Confidence score treated as truth | Unsafe answer may pass | Critical validators override composite score; calibrate with human labels |
| Tenant filter missed in one endpoint | Data leakage | Central authorization helpers, RLS where practical, cross-tenant tests |
| Duplicate escalation on retries | Confusing operations | Idempotency keys and uniqueness policy |
| Stale SOP or cache result | Outdated guidance | Revision-aware retrieval and cache invalidation |
| Voice misrecognition | Wrong maintenance query | Mandatory transcript confirmation |
| Unreviewed expert tip becomes official | Unsafe knowledge | Separate `Expert_Tip` type and explicit approval/promotion workflow |
| External provider outage | Unavailable responses | Bounded retries, safe fallback, status visibility, controlled cache |
| Analytics misrepresents impact | Incorrect product claims | Document metric formulas and handle missing feedback explicitly |

## 20. Definition of Done for the Overall Project

IndustryMind is ready for a controlled pilot when:
- the schema has been reconciled with the actual v1 database;
- users are authenticated and tenant-isolated;
- approved documents can be ingested and retrieved with traceable citations;
- safety checks execute before retrieval/generation;
- validation failures lead to safe fallback and reviewable escalation;
- workers and experts can complete the core workflow;
- no pending tip or SOP proposal is treated as approved knowledge;
- critical tests for security, safety, retries, and document revision pass;
- resolution metrics are computed from real persisted data;
- monitoring, backups, retention, and incident procedures are documented;
- known limitations are visible to pilot users and stakeholders.

---

**Status:** Proposed implementation plan v2.1. The phases and API references are planning guidance; confirm them against the current repository, actual v1 schema, and implemented endpoints before treating any task as completed.
