# IndustryMind — Application Flow Specification (App Flow) v2.1

## 1. Purpose

This document defines the screen-by-screen user journeys, application states, API interactions, loading behavior, validation rules, and error paths for IndustryMind.

IndustryMind is a multimodal assistant for industrial SOPs, machine manuals, expert knowledge, and safety-aware troubleshooting. The flow must preserve the core product rules:

- Safety checks run before retrieval or LLM generation.
- Voice transcripts require user confirmation before processing.
- Direct answers require sufficient validated evidence.
- Insufficient evidence leads to approved safety fallback guidance and expert escalation.
- AI-generated knowledge changes remain drafts until an authorized expert approves them.
- Users can access only the factories, branches, machines, documents, and tickets permitted by their role.
- Responses are delivered as text and voice where the relevant language and speech services are available.

This is an application-flow specification, not a database schema or a substitute for the TRD. Exact endpoint names below are **proposed API contracts** and must be aligned with the implemented FastAPI routes before frontend integration.

## 2. Roles and Navigation

### 2.1 Roles

- **Floor Worker:** ask questions, identify machines, view authorized answers and citations, submit knowledge tips, and report resolution.
- **Expert / Senior Technician:** review escalations, review worker tips, and approve/edit/reject SOP change proposals within assigned scope.
- **Branch Admin:** manage branch users, escalation contacts, and branch-level operational settings.
- **Factory Admin:** manage factory documents, machines, users, document revisions, and factory analytics.
- **Safety Officer:** review safety-gate events and associated high-priority escalations within assigned scope.

All permissions must be checked by the backend. Hiding a button in the UI is not an authorization control.

### 2.2 Navigation by role

| Screen / area | Worker | Expert | Branch Admin | Factory Admin | Safety Officer |
|---|---:|---:|---:|---:|---:|
| Ask / troubleshooting | Yes | Yes | Optional | Optional | Optional |
| Query history | Own / authorized | Assigned scope | Branch scope | Factory scope | Relevant safety cases |
| Document library | Approved, authorized | Approved, authorized | View/manage as permitted | Manage factory documents | View as permitted |
| Escalation inbox | Own submitted cases, status only | Assigned cases | Branch cases | Factory overview | Safety-related cases |
| Knowledge tips | Submit and view own status | Review assigned scope | Optional oversight | Oversight | View if relevant |
| SOP change proposals | No approval | Review/approve assigned scope | Optional view | Oversight or approval if granted | View if relevant |
| Safety audit | No | Limited if granted | Limited if granted | Summary if granted | Authorized audit scope |
| Analytics | Personal/limited | Assigned scope | Branch scope | Factory scope | Safety metrics |

The table is a proposed baseline. The final permission matrix must be confirmed against the product's role policy.

## 3. Global Application States

### 3.1 Authentication states

- `SIGNED_OUT`
- `AUTHENTICATING`
- `SIGNED_IN`
- `SESSION_EXPIRED`
- `ACCESS_DENIED`

Expected behavior:
- If signed out, redirect to sign-in.
- If the session expires during an operation, preserve safe local draft text where appropriate, stop protected requests, and ask the user to sign in again.
- Never place access tokens, secrets, or credentials in application logs or URLs.
- On every protected API request, the backend verifies the token and checks resource scope.

### 3.2 Query states

The frontend should display state from the backend rather than inferring success from a request being sent.

| State | Meaning | User-facing behavior |
|---|---|---|
| `IDLE` | No query submitted | Show input controls |
| `TRANSCRIBING` | Voice transcription in progress | Show progress and cancel option |
| `AWAITING_TRANSCRIPT_CONFIRMATION` | Transcript is ready for review | Show Confirm and Edit controls |
| `SUBMITTING` | Confirmed query is being submitted | Disable duplicate submission |
| `SAFETY_CHECK` | Backend safety gate is evaluating the query | Show concise progress status |
| `RETRIEVING` | Authorized evidence is being retrieved | Show progress without implying an answer is guaranteed |
| `GENERATING` | Candidate response is being created | Show progress |
| `VALIDATING` | Citations, numbers/units, and conflicts are checked | Show validation status |
| `ANSWERED` | Validated direct response returned | Show answer, citations, confidence breakdown, and audio if available |
| `ESCALATED` | Safe fallback returned and escalation recorded | Show fallback, ticket status, and next steps |
| `REFUSED` | Safety gate blocked the request | Show fixed refusal and status of the related safety event/escalation |
| `FAILED` | Request could not complete | Show retry guidance and correlation ID if available |

The backend is authoritative for terminal states. If progress events are delivered over WebSocket or Server-Sent Events, reconnecting clients must be able to recover the latest state through a status endpoint.

## 4. Screen Inventory

| ID | Screen | Primary users | Purpose |
|---|---|---|---|
| SCR-01 | Sign In | All | Authenticate user |
| SCR-02 | Machine Selection / Identification | Worker and authorized users | Select machine or scan QR |
| SCR-03 | Ask IndustryMind | Worker and authorized users | Enter a text or voice question |
| SCR-04 | Transcript Confirmation | Voice users | Confirm or edit transcription |
| SCR-05 | Answer / Fallback Result | Worker and authorized users | Show response, citations, voice, and next actions |
| SCR-06 | Query History / Resolution | Worker and authorized users | Review prior cases and mark issue outcome |
| SCR-07 | Escalation Inbox | Expert, admins, Safety Officer | Review tickets by authorized scope |
| SCR-08 | Escalation Detail | Expert, admins, Safety Officer | Review AI brief, edit, assign, resolve |
| SCR-09 | Knowledge Tip Submission | Worker and expert | Submit a tip for review |
| SCR-10 | Tip Review Queue | Expert | Approve/reject tips |
| SCR-11 | SOP Proposal Queue | Expert | Review AI-drafted SOP changes |
| SCR-12 | SOP Proposal Detail | Expert | Edit, approve, or reject a proposal |
| SCR-13 | Document Library / Upload | Factory Admin and authorized experts | Upload, review, publish, archive documents |
| SCR-14 | Document Review Detail | Authorized reviewer | Inspect extraction and approve/reject |
| SCR-15 | Machine / Branch Administration | Admins | Manage permitted operational metadata |
| SCR-16 | Safety Audit Log | Safety Officer and authorized auditors | Review safety events |
| SCR-17 | Analytics Dashboard | Admins and authorized roles | View resolution, gaps, safety, and review metrics |
| SCR-18 | User / Role Management | Admins | Manage memberships and role scope |

## 5. Screen-by-Screen Flows

### SCR-01 — Sign In

**Primary flow**
1. User opens the application.
2. Frontend checks whether a valid authentication session exists.
3. If no valid session exists, display sign-in.
4. Authentication provider verifies credentials.
5. Backend receives a verified identity token on protected API requests.
6. Frontend loads the user's permitted role and tenant context.
7. Navigate to the default landing page allowed for that role.

**Proposed API contracts**
- Authentication is handled by Supabase Auth or the configured identity provider.
- `GET /api/v1/me` returns the current user profile and permitted memberships/roles.

**Error paths**
- Invalid credentials: show a generic authentication error.
- Provider unavailable: show retry guidance without exposing provider internals.
- No active membership: show an access request/contact administrator message.
- Expired session: clear protected cached state and re-authenticate.
- Never trust role or tenant scope stored only in client-side state.

### SCR-02 — Machine Selection / Identification

**Primary flow**
1. Load only machines the user is permitted to access.
2. User searches/selects a machine or scans a QR code.
3. Validate QR payload format; treat it as an identifier, not as proof of access.
4. Backend verifies machine membership and returns permitted machine context.
5. Navigate to the Ask screen with the verified machine selected.

**Proposed API contracts**
- `GET /api/v1/machines?search={query}`
- `GET /api/v1/machines/{machine_id}`
- `POST /api/v1/machines/resolve-qr` with `{ "qr_payload": "..." }`

**Error paths**
- Unknown QR code: ask user to select a machine manually.
- Machine belongs to another tenant: return a generic not-found/unauthorized response without leaking its details.
- Network failure: retain the typed search but do not treat an unverified machine as selected.
- No machine selected: permit a general query only if the product policy allows it; otherwise require selection.

### SCR-03 — Ask IndustryMind

**Primary flow**
1. Display verified machine context and query input.
2. User enters a text query or starts voice capture.
3. Validate empty input and client-side length limits.
4. For text, submit to the query API.
5. For voice, continue to SCR-04 after transcription.
6. Display progress based on backend status.
7. Prevent duplicate submissions while the same request is in progress.

**Proposed API contracts**
- `POST /api/v1/queries`
  ```json
  {
    "machine_id": "uuid-or-null",
    "input_mode": "text",
    "query_text": "Example maintenance question",
    "query_language": "en"
  }
  ```
- Response: `{ "query_id": "...", "processing_status": "Received" }`
- `GET /api/v1/queries/{query_id}` returns the latest state/result.
- Optional live progress: `GET /api/v1/queries/{query_id}/events` using SSE, or a documented WebSocket channel.

**Backend requirements**
- Authenticate and authorize the user and selected machine.
- Run the deterministic safety gate before retrieval or generation.
- Retrieve only approved, effective, tenant-authorized sources.
- Generate a candidate answer and validate evidence, citations, numeric/unit consistency, and conflicts.
- Return `ANSWERED`, `ESCALATED`, or `REFUSED`, or a recoverable `FAILED` state.

**Error paths**
- Empty query: block locally and validate again on backend.
- Rate limit: show when the user can retry if the server provides retry information.
- Timeout: query status endpoint before submitting again to avoid duplicates.
- Session expired: re-authenticate and preserve only safe draft content.
- Backend unavailable: show retry action; do not fabricate a response.
- Safety audit persistence failure: follow the documented fail-safe policy and do not proceed to generation if the policy requires blocking.

### SCR-04 — Transcript Confirmation

**Primary flow**
1. Capture audio with user permission.
2. Send audio to the transcription service.
3. Display transcript with Confirm and Edit actions.
4. User confirms or edits the transcript.
5. Submit only the confirmed text through the standard query flow.
6. Record `transcript_confirmed=true` for the processed voice query.

**Proposed API contracts**
- `POST /api/v1/speech/transcriptions` with audio payload and language hints.
- Response: `{ "transcript_id": "...", "transcript_text": "...", "language": "..." }`
- `POST /api/v1/queries` with confirmed `query_text`, `input_mode: "voice"`, and `transcript_confirmed: true`.

**Error paths**
- Microphone permission denied: offer text input.
- No speech detected: offer retry or text input.
- Transcription provider unavailable: do not submit an unconfirmed transcript.
- User edits transcript: submit the edited version, not the original transcript.
- User cancels: discard pending transcript or retain only under an explicitly documented policy.
- A backend request with voice mode and no confirmation must be rejected.

### SCR-05 — Answer / Fallback Result

**Direct answer state**
- Show answer text and citations with document title, revision, and page/diagram location where available.
- Show confidence score and the four component signals without presenting the score as a guarantee.
- Provide audio playback if generation succeeded.
- Provide actions: helpful/not helpful if supported, mark resolution, ask follow-up, and submit a tip.

**Fallback/escalation state**
- Show approved safety-baseline text and its source/version.
- Explain that available evidence was insufficient or conflicting.
- Show escalation status only after the ticket is confirmed persisted.
- Show the AI-drafted brief as a draft for expert review, not as an approved instruction.

**Safety refusal state**
- Show the fixed, reviewed refusal message.
- Do not show generated troubleshooting instructions for the blocked intent.
- Show ticket/event status only when confirmed by the backend.
- Use the approved terracotta visual treatment, not alarm-style red styling.

**Proposed API contracts**
- `GET /api/v1/queries/{query_id}`
- `GET /api/v1/queries/{query_id}/citations`
- `GET /api/v1/queries/{query_id}/audio` or a short-lived authorized audio URL
- `POST /api/v1/queries/{query_id}/feedback`

**Error paths**
- Audio generation fails: keep text answer and show audio unavailable.
- Citation resource is archived later: display the historical source revision used for that answer if retained.
- Ticket creation is pending: show “escalation pending” rather than “ticket created.”
- Citation validation fails: show the safe fallback, not the unvalidated candidate answer.
- Cached response returned: indicate cached/demo mode where relevant and verify source revision and access policy.

### SCR-06 — Query History / Resolution

**Primary flow**
1. Load the user's authorized query history.
2. Display query time, machine, result type, and resolution status.
3. Open a query to view its answer, citations, and escalation status.
4. Ask “Did this resolve your issue?” with `Resolved`, `Not_Resolved`, or `Still_Working`.
5. Persist the response and update analytics.

**Proposed API contracts**
- `GET /api/v1/queries?cursor={cursor}&limit={limit}`
- `POST /api/v1/queries/{query_id}/feedback`
  ```json
  {
    "resolution_status": "Resolved",
    "feedback_text": null
  }
  ```

**Error paths**
- Query outside authorized scope: return not-found/unauthorized without disclosing details.
- Duplicate feedback request: make the operation idempotent or return the current saved status.
- Offline submission: indicate that feedback has not yet been saved.
- Do not infer successful resolution from an answer being displayed.

### SCR-07 — Escalation Inbox

**Primary flow**
1. Verify role and scope.
2. Load tickets assigned to the user or visible to their authorized branch/factory.
3. Filter by status and priority.
4. Open a ticket to inspect the brief and relevant citations.
5. Claim or assign the ticket if permitted.

**Proposed API contracts**
- `GET /api/v1/escalations?status=Open&priority=High`
- `GET /api/v1/escalations/{ticket_id}`
- `POST /api/v1/escalations/{ticket_id}/assign`

**Error paths**
- No permission: deny on backend.
- Ticket was resolved by another expert: refresh state and prevent stale actions.
- Ticket service/database unavailable: show a retry state and do not imply assignment succeeded.

### SCR-08 — Escalation Detail

**Primary flow**
1. Load ticket, original query, machine context, cited evidence, and AI-drafted brief.
2. Clearly label AI-written text as a draft.
3. Authorized expert edits the brief, assigns an owner, and records action.
4. Expert sends or saves the brief using the approved workflow.
5. Expert resolves the ticket with resolution notes when appropriate.

**Proposed API contracts**
- `PATCH /api/v1/escalations/{ticket_id}` for allowed status/assignment updates.
- `POST /api/v1/escalations/{ticket_id}/brief/review`
- `POST /api/v1/escalations/{ticket_id}/resolve`

**Error paths**
- Concurrent edit: return conflict and ask user to reload/merge.
- Stale ticket: re-fetch before applying changes.
- Unauthorized external send: reject and record the denied action where required.
- AI draft generation failure: allow expert to write a brief manually.

### SCR-09 — Knowledge Tip Submission

**Primary flow**
1. User selects an authorized machine.
2. User writes a tip and optionally provides context.
3. UI warns that tips are unverified until reviewed.
4. Submit tip.
5. Show pending status and a submission reference.
6. Notify or expose the item to the authorized review queue.

**Proposed API contracts**
- `POST /api/v1/knowledge-submissions`
- `GET /api/v1/knowledge-submissions/{submission_id}`

**Error paths**
- Invalid machine scope: reject.
- Empty or over-limit text: validate.
- Duplicate retry: use an idempotency key.
- Pending/rejected tips must not appear in official retrieval results.

### SCR-10 — Tip Review Queue

**Primary flow**
1. Expert loads pending tips within authorized scope.
2. Open a tip and inspect machine context and submitter.
3. Approve or reject with optional review notes.
4. If approved, create/promote an `Expert_Tip` source and make it searchable only after indexing succeeds.
5. Display the final state.

**Proposed API contracts**
- `GET /api/v1/knowledge-submissions?status=Pending`
- `POST /api/v1/knowledge-submissions/{submission_id}/review`
  ```json
  {
    "decision": "Approved",
    "review_notes": "Reviewed against current maintenance guidance."
  }
  ```

**Error paths**
- Tip already reviewed: return current state and avoid duplicate promotion.
- Reviewer lacks scope: deny.
- Indexing failure after approval: retain a retryable promotion state and do not claim the tip is searchable.
- Self-approval: reject unless an explicit product policy permits it.

### SCR-11 — SOP Proposal Queue

**Primary flow**
1. Expert loads pending SOP change proposals in their scope.
2. Show target document, current revision, triggering gap, occurrence count, and proposal age.
3. Expert opens a proposal for detailed review.
4. Proposals remain drafts until an authorized decision.

**Proposed API contracts**
- `GET /api/v1/sop-proposals?status=Pending`
- `GET /api/v1/sop-proposals/{proposal_id}`

**Error paths**
- Target document no longer current: mark proposal as stale and require re-evaluation.
- Proposal source unavailable: show incomplete evidence state.
- User lacks approval permissions: display read-only view or deny access.

### SCR-12 — SOP Proposal Detail

**Primary flow**
1. Load the target document revision and AI draft.
2. Compare the proposed text with the existing document.
3. Expert edits the proposal, then approves or rejects it.
4. On approval, create a new document revision and send it through document publishing/indexing.
5. Show the resulting revision only after creation succeeds.

**Proposed API contracts**
- `PATCH /api/v1/sop-proposals/{proposal_id}` for permitted draft edits.
- `POST /api/v1/sop-proposals/{proposal_id}/review`
  ```json
  {
    "decision": "Approved",
    "expert_edited_change": "Reviewed proposed change text.",
    "review_notes": "Approved after technical review."
  }
  ```

**Error paths**
- Target revision changed after drafting: reject stale approval and require comparison with the latest revision.
- Approval transaction fails: retain proposal state and provide safe retry.
- Indexing fails: preserve the new revision's workflow state but keep it out of retrieval until publish/index status is healthy.
- Never edit an approved historical revision in place.

### SCR-13 — Document Library / Upload

**Primary flow**
1. Authorized user opens the document library.
2. Filter documents by machine, type, status, and revision.
3. Upload a file to a private storage location.
4. Backend validates file type, size, tenant, and upload permission.
5. Ingestion job extracts text, tables, images, and diagram regions.
6. Show ingestion progress and quality warnings.
7. Submit document for review when extraction checks pass.

**Proposed API contracts**
- `GET /api/v1/documents?status=Approved&machine_id={machine_id}`
- `POST /api/v1/documents` to create a draft upload record.
- `POST /api/v1/documents/{document_id}/upload-complete`
- `GET /api/v1/documents/{document_id}/ingestion-status`
- `POST /api/v1/documents/{document_id}/submit-review`

**Error paths**
- Unsupported or suspicious file: reject and explain accepted formats.
- Upload interrupted: allow a safe retry without creating duplicate document records.
- Extraction failed: preserve a failed job record for retry; do not index partial content.
- Duplicate revision: reject or require explicit correction.
- Unauthorized upload: deny on backend.

### SCR-14 — Document Review Detail

**Primary flow**
1. Authorized reviewer opens a pending document.
2. Display extracted text, tables, page images, detected diagram regions, metadata, and ingestion warnings.
3. Reviewer approves or rejects the document and records notes.
4. On approval, publish the revision according to the document-control policy.
5. Confirm the approved revision and its effective date.

**Proposed API contracts**
- `GET /api/v1/documents/{document_id}`
- `GET /api/v1/documents/{document_id}/preview`
- `POST /api/v1/documents/{document_id}/review`

**Error paths**
- Reviewer lacks approval authority: deny.
- Required extraction fields missing: block approval or require an explicit documented exception.
- Revision is stale: ask reviewer to refresh.
- Indexing failure: show publishing/indexing as incomplete, not successful.

### SCR-15 — Machine / Branch Administration

**Primary flow**
1. Admin opens machines or branches within their scope.
2. Create or edit machine metadata, QR identifiers, branch assignment, and escalation contacts.
3. Backend validates tenant relationships and unique identifiers.
4. Save changes and write audit events for security-sensitive modifications.

**Proposed API contracts**
- `GET /api/v1/branches`
- `POST /api/v1/branches` and `PATCH /api/v1/branches/{branch_id}`
- `GET /api/v1/machines`
- `POST /api/v1/machines` and `PATCH /api/v1/machines/{machine_id}`

**Error paths**
- Duplicate QR identifier: reject.
- Machine moved to another branch: revalidate access, document scope, and open escalations.
- Branch admin attempts factory-wide change: deny.
- Concurrent edit: return conflict and refresh.

### SCR-16 — Safety Audit Log

**Primary flow**
1. Safety Officer opens the audit screen.
2. Backend verifies the user's audit scope.
3. Load paginated events with timestamp, rule version, outcome, and linked ticket where authorized.
4. Allow filters by date, machine, outcome, and rule.
5. Open event details with restricted access to query text.

**Proposed API contracts**
- `GET /api/v1/safety-events?from={timestamp}&to={timestamp}&outcome={outcome}`
- `GET /api/v1/safety-events/{event_id}`

**Error paths**
- Unauthorized access: deny and log the denied access where appropriate.
- Audit store unavailable: show service error; do not fabricate an empty result.
- Query content is redacted by policy: explain that restricted fields are unavailable.
- Audit events are read-only in the UI and protected from normal application updates/deletes.

### SCR-17 — Analytics Dashboard

**Primary flow**
1. Admin opens analytics for an authorized factory/branch/time range.
2. Backend computes aggregates from persisted queries, feedback, escalations, and review records.
3. Display resolution time, answer/fallback/refusal rates, recurring machine/topic gaps, safety events, and review throughput.
4. Show sample size and time window with each metric.
5. Permit drill-down only into records the user is authorized to view.

**Proposed API contracts**
- `GET /api/v1/analytics/overview?from={timestamp}&to={timestamp}`
- `GET /api/v1/analytics/resolution`
- `GET /api/v1/analytics/safety`
- `GET /api/v1/analytics/knowledge-review`

**Error paths**
- Insufficient data: show “Not enough data” rather than zero performance.
- Invalid date range: return validation error.
- Stale aggregates: display last-updated time.
- Cross-tenant filter attempt: deny or safely constrain the result.

### SCR-18 — User / Role Management

**Primary flow**
1. Admin opens users and memberships in their authorized scope.
2. View membership, assigned roles, and branch/factory scope.
3. Invite, assign, revoke, or update a membership if permitted.
4. Re-check active sessions and permissions on subsequent API calls.
5. Record role and membership changes in audit logs.

**Proposed API contracts**
- `GET /api/v1/memberships`
- `POST /api/v1/memberships`
- `PATCH /api/v1/memberships/{membership_id}`
- `POST /api/v1/memberships/{membership_id}/revoke`

**Error paths**
- Attempt to grant a role above the admin's authority: deny.
- Last authorized factory admin removal: prevent accidental lockout according to policy.
- Revoked user with active session: reject future protected requests when revocation takes effect.
- Duplicate membership: return existing membership or a conflict response.

## 6. Shared API and State Conventions

### 6.1 Proposed API conventions

- Prefix routes with `/api/v1`.
- Use JSON for standard requests/responses and multipart or signed upload flows for files/audio.
- Use cursor pagination for growing lists.
- Use UTC timestamps in ISO 8601 format.
- Use a consistent error shape:
  ```json
  {
    "error": {
      "code": "RESOURCE_NOT_FOUND",
      "message": "The requested resource was not found.",
      "request_id": "correlation-id"
    }
  }
  ```
- Do not return internal stack traces, secrets, database details, or another tenant's resource existence.
- Use idempotency keys for retried writes that create queries, tickets, uploads, or promotion jobs.
- Use optimistic concurrency (for example, a version field or ETag) for expert edits and approvals.
- Define request size limits, rate limits, timeouts, and retry policy per endpoint.

### 6.2 Common error categories

| HTTP status | Meaning | UI behavior |
|---|---|---|
| `400` | Invalid request | Show field-level or general validation guidance |
| `401` | Missing/expired authentication | Re-authenticate |
| `403` | Authenticated but not allowed | Show permission message without exposing protected data |
| `404` | Resource absent or deliberately concealed | Show not found |
| `409` | Stale state or workflow conflict | Refresh and ask user to retry/review |
| `413` | File/audio too large | Explain configured size limit |
| `422` | Semantic validation failure | Highlight the field or workflow rule |
| `429` | Rate limit | Respect `Retry-After` if provided |
| `500` | Unexpected server failure | Show safe retry guidance and request ID |
| `502/503/504` | Upstream dependency failure/timeout | Preserve safe state, check operation status, and avoid duplicate writes |

### 6.3 Progress updates

- Progress events are informational; persisted API status is authoritative.
- Every query/job should have a stable ID and correlation ID.
- On reconnect, fetch the latest status rather than replaying an assumed client state.
- Do not expose private prompts, hidden chain-of-thought, secrets, or internal provider payloads in progress messages.
- Avoid indefinite spinners. Provide retry/cancel guidance where cancellation is safe.

## 7. Key State Transition Rules

### 7.1 Query state machine

```text
IDLE
  ├─ text submitted ───────────────> SUBMITTING
  └─ voice captured ───────────────> TRANSCRIBING
                                        |
                                        v
                         AWAITING_TRANSCRIPT_CONFIRMATION
                                        |
                              user confirms/edits
                                        v
                                    SUBMITTING
                                        |
                                        v
                                  SAFETY_CHECK
                          ┌─────────────┼─────────────┐
                          v             v             v
                       REFUSED      RETRIEVING      FAILED
                                        |
                                        v
                                    GENERATING
                                        |
                                        v
                                    VALIDATING
                                  ┌─────┴─────┐
                                  v           v
                               ANSWERED    ESCALATED
```

This is a logical display model. Backend implementation may use additional internal states. If the safety gate refuses, retrieval and generation must not run for that request.

### 7.2 Document publishing state machine

```text
Draft → Uploading → Ingesting → Pending_Review
                                  |
                       ┌──────────┴──────────┐
                       v                     v
                    Rejected              Approved
                                             |
                                         Publishing
                                       ┌─────┴─────┐
                                       v           v
                                   Published   Publish_Failed
```

Only a published, approved, effective revision is eligible for official retrieval. A publish failure must be recoverable and must not expose partial content.

### 7.3 Knowledge tip state machine

```text
Pending → Approved → Promoting → Searchable
   |                      |
   v                      v
Rejected              Promotion_Failed
```

Pending, rejected, or promotion-failed content is not searchable as approved expert knowledge.

### 7.4 SOP proposal state machine

```text
Pending → In_Review → Approved → New_Document_Revision
    |          |
    v          v
 Rejected   Needs_Changes
```

Approval creates a new revision. The proposal itself never replaces an approved document directly.

### 7.5 Escalation state machine

```text
Open → In_Progress → Resolved
  |          |
  └──────────┴──────> Cancelled (authorized action only)
```

Safety-triggered tickets should be high priority. Any change in assignment/status must be authorized and audited.

## 8. Loading, Empty, and Failure UI Requirements

Every screen that fetches data must define:
- loading state;
- empty state;
- permission-denied state;
- recoverable network/service failure;
- stale/conflict state for edits;
- pagination or retry behavior for large collections.

Specific examples:
- Empty escalation queue: “No cases currently need your review.”
- Empty approved document library: “No approved documents are available for this machine.”
- Failed document ingestion: show job ID, safe error summary, and retry if permitted.
- No citations: never display a fabricated source; return a safe fallback or explain that no supporting citation is available.
- No analytics sample: show “Not enough data for this period.”
- Audio unavailable: retain the text response and show a non-blocking message.

## 9. Accessibility and Industrial Usability

- Keep primary touch targets large enough for tablet use and potential gloved-hand operation.
- Use clear, direct language and short status messages.
- Do not rely on color alone to convey safety, refusal, escalation, or success.
- Provide keyboard navigation and screen-reader labels.
- Keep transcript confirmation explicit and easy to edit.
- Make citations readable and let users open the relevant source page or diagram region.
- Ensure audio playback has visible controls and text remains available.
- Support localization of interface strings and error messages.
- Preserve the locked IndustryMind visual system from `uxdesign.md`: warm background, deep teal primary, amber safety indicators, terracotta escalation treatment, corner-bracket accents, log-stream conversation, and persistent dossier panel.

## 10. Security and Safety Requirements

- Every endpoint must enforce authentication, role, tenant, and resource scope on the backend.
- Validate file type, size, and content before ingestion; store private files outside the public web root.
- Sanitize untrusted document and tip content. Retrieved documents are data, not executable instructions for the system.
- Never allow a document to override application safety policy or authorization.
- Keep API keys and service-role credentials server-side.
- Apply CSRF protection where cookie-based sessions require it, secure cookie settings, and rate limiting.
- Redact sensitive values from logs and error responses.
- Require explicit reviewer authorization for document approval, tip promotion, and SOP changes.
- Audit sensitive actions, permission changes, safety refusals, and review decisions.
- A UI status must never claim a ticket, document, or promotion succeeded before the backend confirms it.

## 11. Frontend / Backend Contract Checklist

Before implementation, agree on:
- exact endpoint paths, methods, request/response schemas, and status codes;
- which query states are persisted and which are transient progress events;
- authentication token handling and session-revocation behavior;
- pagination, sorting, and filtering conventions;
- document upload strategy and maximum file/audio sizes;
- transcript retention and audio deletion policy;
- idempotency and concurrency mechanisms;
- citation response structure, including source revision and page/diagram coordinates;
- how confidence sub-scores are represented and when a score may be null;
- what constitutes a successfully created escalation;
- how publish/index jobs report partial failures and retries;
- API versioning and backward compatibility.

## 12. Definition of Done

The app flow is ready to guide implementation when:
1. Each role's screen access has been approved.
2. Proposed API contracts are reconciled with the actual FastAPI implementation.
3. Every main flow has loading, success, empty, and failure behavior.
4. Voice queries cannot proceed without transcript confirmation.
5. Safety refusal, fallback, and escalation states are distinguishable.
6. Document, tip, and SOP approval transitions are enforced by the backend.
7. Tenant isolation is verified for all screen and API flows.
8. Retry-safe behavior is defined for queries, uploads, escalations, and publishing.
9. Accessibility and tablet usability have been tested.
10. End-to-end tests cover the critical user journeys and failure paths.

---

**Status:** Proposed application-flow specification, v2.1. API paths and payloads are illustrative contracts, not claims about already implemented routes. Align them with the actual backend before connecting the frontend.
