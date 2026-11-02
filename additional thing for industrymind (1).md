# Additional Things for IndustryMind

**Document type:** Proposed feature specification  
**Project:** IndustryMind  
**Version:** 1.0  
**Status:** Proposed additions, not yet implemented

---

## 1. Purpose

This document proposes a small set of distinctive capabilities that can make IndustryMind more than a document-based industrial chatbot. The aim is to connect machine knowledge, evidence, document changes, and maintenance decisions while preserving the project's safety-first design.

These are proposals. They should be validated against the existing codebase, database schema, and project priorities before implementation.

## 2. Recommended Direction

### IndustryMind Knowledge Intelligence Graph

Create a structured, connected representation of industrial knowledge. Instead of treating each manual, SOP, and maintenance case as an isolated document, connect relevant entities and relationships.

**Example entities**
- Factory and machine
- Machine model and component
- Symptom and observation
- Potential failure mode
- Hazard and safety constraint
- Approved SOP and manual revision
- Troubleshooting step
- Spare part
- Maintenance case and verified outcome

**Example relationships**
- Machine *contains* component
- Component *may exhibit* symptom
- Symptom *may be associated with* failure mode
- Failure mode *is addressed by* approved procedure
- Procedure *requires* safety constraint
- Procedure *references* document revision
- Maintenance case *records* observation
- Verified outcome *supports* a knowledge relationship

Relationships must have provenance where possible: source document, revision, page/section, reviewer, and approval status. A possible relationship is not proof of causation and should be labeled accordingly.

### Why this matters

- Lets IndustryMind traverse from a machine or component to relevant approved procedures and evidence.
- Makes it easier to expose conflicting or missing knowledge.
- Supports analysis of which answers, procedures, or training material may be affected by a document revision.
- Creates a foundation for future capabilities without requiring a new AI model.

### Implementation approach

Start with PostgreSQL tables for graph entities and relationships, or an equivalent relational representation. Use the current PostgreSQL/pgvector architecture where practical. Do not add a dedicated graph database unless a measured requirement justifies the operational complexity.

Suggested conceptual tables:
- `knowledge_entities`
- `knowledge_relationships`
- `knowledge_evidence`
- `document_revision_impacts`

These are proposed additions, not finalized migrations. Reconcile them with the existing schema before implementation.

## 3. Evidence and Uncertainty Ledger

For each important statement made during troubleshooting, keep track of what is known, what is inferred, and what remains unknown.

### Evidence categories

- **Observed:** directly reported or measured by a worker, sensor, or approved system.
- **Source-backed:** explicitly supported by an approved manual, SOP, or verified case.
- **Inferred:** a possible explanation derived from available evidence.
- **Unknown:** not yet established.
- **Conflicting:** supported by incompatible evidence or documents.

### Example

| Claim | Status | Evidence | Next action |
|---|---|---|---|
| Conveyor stopped | Observed | Worker report | Record symptom |
| Motor power status | Unknown | No confirmed measurement | Request an approved, safe observation |
| Possible overload | Inferred | Symptom pattern only | Do not present as confirmed diagnosis |
| Applicable procedure | Source-backed | Approved SOP revision and section | Display citation |

The application should distinguish these categories in the UI and avoid presenting an inference as a fact. Confidence scores must not override deterministic safety rules or substitute for evidence.

## 4. Knowledge Change-Impact Engine

When a manual or SOP revision is uploaded, compare it with the prior approved revision and identify potentially affected knowledge.

### Proposed workflow

1. Store the new document as a new revision; never silently overwrite the previous approved version.
2. Extract changed pages, sections, tables, and relevant metadata.
3. Link changed passages to the knowledge entities, procedures, answers, and training material that reference them.
4. Create a review queue with the reason for each suggested impact.
5. Ask authorized experts to accept, reject, or defer each proposed impact.
6. After approval, update the active revision and invalidate affected caches or derived indexes.
7. Keep an audit record of decisions and timestamps.

### Example output

- **Changed:** Motor operating-limit section.
- **Potential impact:** Two troubleshooting procedures and one training module reference this section.
- **Required action:** Expert review.
- **Current status:** Pending approval.

The engine should identify *potential* impacts, not automatically declare that a procedure is unsafe or incorrect. Human review remains required for safety-relevant changes.

## 5. Guided Troubleshooting Session

Add an optional step-by-step troubleshooting mode to the existing query experience.

### How it works

1. Identify the machine and reported symptom.
2. Run the deterministic safety gate.
3. Retrieve applicable approved procedures and relevant machine history.
4. Present one permitted step or question at a time.
5. Ask the worker to confirm the observation or outcome before continuing.
6. Re-evaluate the available evidence after each response.
7. Stop and escalate when the required evidence is unavailable, sources conflict, confidence is insufficient, or a safety rule requires escalation.
8. Save the session as a maintenance case, subject to the configured retention and access policies.

Do not let the language model invent physical actions, bypass lockout/tagout requirements, or override an approved procedure. Steps involving hazardous work must follow the factory's authorized procedures and role permissions.

## 6. Verified Machine Memory

Build a machine-specific history from maintenance cases that have been reviewed and marked with a verified outcome.

Capture, where available:
- Machine identifier and component
- Reported symptoms and observations
- Applicable document and revision
- Steps actually performed, as recorded by the worker
- Parts used
- Outcome and verification status
- Expert review and timestamps

When a similar issue appears again, show relevant prior cases and explain how closely they match. Do not automatically assume that the same symptom has the same cause. Clearly distinguish worker-reported, expert-verified, and AI-inferred information.

## 7. Optional Future Extension: Multi-Agent Evidence Review

A later version could use separate constrained roles to review a case, such as:
- Procedure researcher: finds applicable approved source passages.
- Evidence reviewer: checks whether claims are supported by the available evidence.
- Safety reviewer: checks against deterministic safety rules and approved restrictions.

A final arbiter can compare claims and expose disagreements. This is an optional experiment, not a requirement for the first release. Multiple agents do not guarantee greater accuracy; each output must be checked, and the deterministic safety gate must remain authoritative.

## 8. User Interface Additions

Add the following UI elements only where they help workers make decisions:

- **Machine context panel:** machine, model, component, and current approved document revision.
- **Evidence ledger:** claim, evidence category, supporting source, and what is still unknown.
- **Troubleshooting step panel:** current step, worker confirmation, and permitted next action.
- **Revision impact queue:** changed source, affected knowledge items, review status, and reviewer.
- **Machine history timeline:** prior cases with clearly labeled verification status.
- **Escalation handoff:** unresolved question, observations collected, sources consulted, conflicts found, and why escalation is needed.

Keep the interface usable on tablets and with gloves. Do not use color alone to communicate risk or verification status.

## 9. Proposed Data Model

These are conceptual additions only; exact fields and constraints should be finalized after inspecting the existing database.

### `knowledge_entities`
- `id`
- `tenant_id`
- `entity_type`
- `canonical_name`
- `machine_id` or another scoped reference where applicable
- `metadata_json`
- `created_at`
- `updated_at`

### `knowledge_relationships`
- `id`
- `tenant_id`
- `source_entity_id`
- `relationship_type`
- `target_entity_id`
- `status` (proposed, verified, rejected, retired)
- `confidence` (optional; must not be treated as proof)
- `created_by`
- `reviewed_by`
- `created_at`
- `reviewed_at`

### `knowledge_evidence`
- `id`
- `tenant_id`
- `relationship_id` or `claim_id`
- `evidence_type`
- `document_id`
- `document_revision_id`
- `page_number` or `section_reference`
- `case_id`
- `review_status`
- `created_at`

### `document_revision_impacts`
- `id`
- `tenant_id`
- `source_document_id`
- `old_revision_id`
- `new_revision_id`
- `affected_entity_type`
- `affected_entity_id`
- `impact_reason`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `created_at`

Use foreign keys, tenant-scoped authorization, indexes, and retention policies consistent with the existing schema. Avoid storing duplicated copies of sensitive source content if stable references will suffice.

## 10. Recommended Implementation Order

### Phase A: Evidence foundation
1. Review existing document, revision, machine, query, and maintenance-case tables.
2. Define claim and evidence categories.
3. Add source/revision references and audit events where missing.
4. Build the evidence ledger UI for a single query.

**Acceptance criteria**
- Important answer claims can be traced to an approved source or clearly labeled as inferred/unknown.
- Conflicting source evidence is visible.
- Safety rules take precedence over confidence scores.

### Phase B: Machine knowledge graph
1. Define a small controlled vocabulary of entity and relationship types.
2. Seed one machine with manually reviewed entities and relationships.
3. Add APIs to traverse relationships and retrieve linked evidence.
4. Connect graph results to existing document retrieval.

**Acceptance criteria**
- A worker can select a component and find linked approved procedures.
- Each safety-relevant relationship has traceable evidence or is clearly marked unverified.
- Access checks prevent cross-tenant data exposure.

### Phase C: Guided troubleshooting and machine memory
1. Add session and step state management.
2. Require worker confirmation before recording observations as confirmed.
3. Save case outcomes and verification status.
4. Retrieve similar verified cases without assuming causation.

**Acceptance criteria**
- A session can pause, resume, and escalate.
- The next step is based on approved workflow rules and available evidence.
- Unverified outcomes are not promoted as verified knowledge.

### Phase D: Revision impact
1. Compare document revisions.
2. Link changed passages to known dependencies.
3. Generate a review queue.
4. Require expert approval before updating active knowledge or invalidating relevant caches.

**Acceptance criteria**
- Every suggested impact includes a reason and source revision.
- No safety-relevant procedure changes automatically become approved.
- Review decisions are auditable.

### Phase E: Optional agent review
Only consider this after the preceding foundations work reliably. Evaluate it against a baseline using the same test cases, and keep it only if it demonstrably improves evidence coverage or error detection.

## 11. Security, Safety, and Reliability Requirements

- Enforce tenant and role authorization on the server and in database access patterns.
- Treat uploaded documents and extracted text as untrusted data, not instructions to the AI system.
- Keep deterministic safety checks before generation and before any consequential workflow transition.
- Require expert approval for safety-relevant SOP changes.
- Maintain audit trails for approvals, revisions, and escalations.
- Apply document access control to citations and machine history.
- Make stale, unavailable, and unverified data explicit.
- Do not describe the system as guaranteeing zero hallucinations.
- Do not let an AI-generated diagnosis or a similarity score authorize hazardous work.

## 12. Evaluation Plan

Create a small, reviewed test set before claiming the new features improve performance.

Measure:
- **Evidence traceability:** percentage of material claims with valid supporting sources.
- **Evidence classification:** accuracy of observed/source-backed/inferred/unknown labels.
- **Revision impact recall:** percentage of known affected items found in a reviewed test set.
- **Revision impact precision:** percentage of suggested impacts confirmed as relevant by experts.
- **Escalation quality:** whether cases needing expert review are correctly routed.
- **Repeat-case usefulness:** whether retrieved historical cases are relevant and correctly labeled.
- **Latency and cost:** added time and infrastructure cost per query.
- **Authorization:** tests for cross-tenant and unauthorized document access.

Use expert-reviewed examples and report failures as well as successes. Do not use a single composite confidence score as the only measure of safety or quality.

## 13. Scope Recommendation

For the first implementation, prioritize:

1. **Evidence and Uncertainty Ledger**
2. **Knowledge Intelligence Graph**
3. **Guided Troubleshooting with Verified Machine Memory**
4. **Knowledge Change-Impact Engine**

Defer multi-agent review until these capabilities are tested. This order adds a distinctive technical foundation while keeping the first milestone achievable.

## 14. Definition of Done

The additions are ready for a pilot when:
- A worker can trace a troubleshooting answer to approved source material.
- Unknowns, inferences, and conflicts are visibly distinguished.
- A machine/component can be connected to relevant procedures and reviewed maintenance cases.
- Similar past cases are presented as evidence, not as guaranteed diagnoses.
- Document revision changes produce a reviewable impact list.
- Safety-relevant changes require the configured human approval.
- Tenant authorization, audit logging, and core failure paths are tested.
- Documentation accurately distinguishes implemented features from planned features.
