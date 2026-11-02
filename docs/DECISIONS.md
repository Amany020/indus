# IndustryMind — Architecture Decision Records

## ADR-001: Evidence-First RAG (P1, Hackathon)

**Status:** Accepted  
**Date:** 2026-10  
**Context:** Workers need machine-specific answers grounded in approved manuals.  
**Decision:** RAG pipeline with pgvector embeddings, citation validation, and number/unit checking. Every answer must cite approved evidence or be escalated.  
**Consequences:** Latency ~2-5s per query; requires embedding model that supports the document languages.

---

## ADR-002: Deterministic Safety Gate (P2, Hackathon)

**Status:** Accepted  
**Date:** 2026-10  
**Context:** Workers may ask questions about bypassing safety interlocks.  
**Decision:** Pattern-matching blocklist evaluated before any LLM call. Blocked queries never reach Gemini. Versioned rule file.  
**Consequences:** Must maintain pattern list manually; false positives require rule tuning, not threshold changes.

---

## ADR-003: Demo Cache Layer (P3, Hackathon)

**Status:** Accepted  
**Date:** 2026-10  
**Context:** Demo environments need guaranteed fast, correct responses.  
**Decision:** Seeded question→answer pairs served from in-memory cache when `DEMO_CACHE=true`. Clearly labelled in UI and logs. Non-seeded queries still go through full pipeline.  
**Consequences:** Demo and real paths diverge; cache must be kept in sync with pipeline output.

---

## ADR-004: Single-Factory Hackathon Scope (P4, Hackathon)

**Status:** Accepted (to be superseded by R3)  
**Date:** 2026-10  
**Context:** Hackathon scope is one factory with one machine.  
**Decision:** `DEFAULT_FACTORY_ID` hardcoded in config. All queries scoped to this factory.  
**Consequences:** Multi-tenancy requires additive migration (R3).

---

## ADR-005: Gemini Model Auto-Detection (P5, Hackathon)

**Status:** Accepted  
**Date:** 2026-10  
**Context:** Gemini model names change frequently (2.0-flash → 2.5-flash → 3.8-flash).  
**Decision:** Auto-detect best Flash-class model at startup if `GEMINI_MODEL` env var is empty. Override with explicit model name.  
**Consequences:** Must handle 404 errors gracefully; `.env` override is the production-safe path.

---

## ADR-006: Feature Flags for All New Capabilities (R0+)

**Status:** Accepted  
**Date:** 2026-10  
**Context:** New features must not break the existing demo or eval baseline.  
**Decision:** Every new capability has a feature flag in `.env`, DEFAULT OFF. System with all flags off behaves exactly like the hackathon demo.  
**Consequences:** Slightly more config; guarantees backward compatibility.

---

## ADR-007: Additive-Only Migrations (R0+)

**Status:** Accepted  
**Date:** 2026-10  
**Context:** Existing tables have production data from demos and eval runs.  
**Decision:** Never drop or rename existing columns/tables. New columns are nullable, backfilled, then constrained. Every migration file includes a commented `-- ROLLBACK:` block.  
**Consequences:** Schema grows; old columns may become unused but are never removed in this phase.

---

## ADR-008: Embedding Model Selection

**Status:** Accepted  
**Date:** 2026-10  
**Context:** `text-multilingual-embedding-002` was deprecated. Need 768-dim embeddings for pgvector index.  
**Decision:** Use `gemini-embedding-2-preview` with `output_dimensionality=768`. Configurable via `EMBED_MODEL` and `EMBED_DIM`.  
**Consequences:** Re-embedding required when model changes; dimension must match existing pgvector index.

---

## D-M1: Membership roles and label mapping (M1)

- The `memberships.role` enum is the one defined in 004_auth.sql: `worker | supervisor | admin | viewer`. We do NOT rename it.
- UI/application labels map onto it as follows, and this mapping lives only in application code and copy, never in the schema:
  - `worker`     → displayed as **Worker**
  - `supervisor` → displayed as **Reviewer**
  - `admin`      → displayed as **Admin**
  - `viewer`     → displayed as **Manager** (read-only: documents, reports, may query RAG)
- `memberships.branch_id` (013) is nullable. NULL = factory-wide scope (typical for `admin`). `worker` and `supervisor` memberships should carry a branch_id.
- `queries.user_id` is nullable until M2 (real auth) exists; existing demo rows have no owner. A later migration will make it NOT NULL after those rows are backfilled or archived.
- `queries.reviewer_visible` is FALSE by default. It is set TRUE only by explicit events (feedback No / Still working, safety refusal, escalation created, high-risk evidence used). Time-based auto-flagging of unanswered "Did this fix it?" prompts is roadmap, not implemented.
- Migrations 005–011 remain intentionally unapplied (roadmap). 006 (RLS) stays dormant.
- Migrations are applied by hand in the Supabase SQL Editor and then recorded with `python -m db.migrate --mark-applied <version>`; migrate.py cannot execute DDL.

---
## D-M2: Real Authentication via Supabase Auth (M2)
- Supabase Auth (email+password, no magic link) is the source of truth for credentials. Role, factory_id, and branch_id are NEVER trusted from the JWT or from `user_metadata` — they are always looked up fresh from the `memberships` table on every request, in both `header` and `supabase` AUTH_MODE.
- Registration has exactly two paths, with no self-selectable role field in either request body:
  - `POST /auth/register-factory` — creates a new factory; the registering user is always granted `role="admin"`, `branch_id=NULL` (factory-wide scope).
  - `POST /auth/join-factory` — joins an existing factory/branch; the joining user is always granted `role="worker"`. `factory_id`/`branch_id` are validated to exist (and the branch validated to belong to the factory) BEFORE any Supabase Auth user is created.
  - There is no public endpoint that allows a caller to request `role="supervisor"` or `role="admin"` directly. Promotion to `supervisor` (Reviewer) must happen via a future admin-only endpoint (not yet built).
  - Both registration paths perform full rollback (delete any created `profiles`/`factories` row, delete the Supabase Auth user) if any later step in the same request fails, so a request never leaves a half-created user/membership/profile behind.
- A new `profiles` table (migration 015) stores identity data (`user_id`, `full_name`, `created_at`) that does not belong in `memberships` (which is purely role/tenancy) or in Supabase Auth's own `user_metadata` (which is untrusted and never read for authorization).
- `profiles` has RLS **enabled**, with one `SELECT`-own-row policy (`profiles_select_own`) and no INSERT/UPDATE/DELETE policies. This RLS has zero effect on current application behavior, because `get_db()` (`backend/app/core/database.py`) always connects using the Supabase **service-role** key, which bypasses RLS entirely. The policy exists only as a safety net in case a future client-side (anon-key) path is ever added.
- `GET /auth/users` requires `role="admin"` and is scoped to the caller's own `factory_id`; it reads from `memberships` joined with `profiles`, and does not return email addresses.
- `core/auth.py`'s `supabase` mode: if a valid Supabase JWT has no matching `memberships` row, the request is rejected with `403 Forbidden`.
  It does NOT silently fall back to `role="viewer"` (this was a behavior change from the original draft).
- Email confirmation is skipped at signup (`email_confirm=True`) to support low-friction shared-tablet use on a factory floor; this is a deliberate reduction of friction, not an oversight.
- `/factories/` and `/branches/` list endpoints remain public (no auth) for now, under the single-company-internal-tool framing used during the hackathon/early build. Invite-codes or similar hardening to close this is explicitly deferred to roadmap, not forgotten.
- Flipping `AUTH_MODE` from `header` to `supabase` in a live `.env` for real end-to-end login testing is a separate decision, not bundled into M2's definition of done, and requires its own explicit approval when scheduled.
- Live end-to-end testing (register → login → GET /me, using a disposable test factory/account) under AUTH_MODE=supabase surfaced two real integration bugs not caught by unit tests, both fixed in `_verify_supabase_jwt` (backend/app/core/auth.py):
  - The JWT algorithm allow-list was hardcoded to `["RS256"]`, but this Supabase project signs tokens with `ES256`. Fixed by widening the allow-list to `["RS256", "ES256"]`. Signature verification, audience checking, and expiry checking are unaffected and remain strictly enforced.
  - A measured ~53.5 second clock skew between the local dev machine and Supabase's auth server caused `iat` timestamp validation to fail (`ImmatureSignatureError`). Fixed by adding `leeway=60` to `pyjwt.decode(...)`, which only relaxes tolerance on timestamp claims (`iat`/`nbf`/`exp`) and does not weaken signature, algorithm, or audience validation.
  - Both fixes were reviewed as single-line, additive changes, confirmed via full pasted diffs, and followed by a full test suite re-run (77/77 passing, zero regressions) before being accepted.
  - End-to-end confirmation: a real registered admin user was able to log in and successfully call the protected GET /me endpoint, receiving role/factory_id/branch_id from a fresh `memberships` lookup and full_name from a fresh `profiles` lookup — not from the JWT's own claims — matching the design intent.


