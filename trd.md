# IndustryMind — Technical Requirements Document (TRD) v2.0

## 1. Architecture Overview (Updated)

[Client: Web/Mobile]
       ↓↑
[API Layer: FastAPI]
       ↓↑
[Deterministic Safety Gate]  ← runs FIRST, before anything else
       ↓↑ (if passed)
[Orchestration Layer: Query Router, Confidence Gate, Escalation/Agentic Drafting]
       ↓↑
[Retrieval Layer: ChromaDB + pgvector — Hybrid Search]
       ↓↑
[Multimodal LLM: Google Gemini]
       ↓↑
[Citation Validator + Numeric/Unit Checker + Conflict Detector]
       ↓↑
[Document Processing Pipeline: PyMuPDF, pdfplumber, PaddleOCR + Bounding Box Pre-Annotation]
       ↓↑
[Speech Layer: Whisper/faster-whisper (STT) + Transcript Confirmation UI + gTTS/Bhashini (TTS)]
       ↓↑
[Database & Storage: PostgreSQL, Supabase, Supabase Storage]
       ↓↑
[Deployment: Vercel (Frontend), Railway/Render (Backend)]
       ↓↑
[Demo/Resilience Cache Layer] ← fallback on live-call failure

## 2. Tech Stack (Confirmed, unchanged from v1)

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, Tailwind CSS, shadcn/ui |
| Backend | Python, FastAPI |
| AI Model (LLM) | Google Gemini (multimodal) |
| Speech (STT) | Whisper / faster-whisper |
| Speech (TTS) | gTTS + Bhashini |
| Document Processing | PyMuPDF, pdfplumber, PaddleOCR |
| Retrieval (RAG) | ChromaDB + PostgreSQL/pgvector |
| Database & Storage | PostgreSQL, Supabase, Supabase Storage |
| Deployment | Vercel, Railway/Render |

## 3. Deterministic Safety Gate (NEW — Detailed Design)
- Implemented as a rules/pattern-matching module, NOT an LLM call
- Maintains a versioned, admin-editable blocklist of unsafe intent patterns
  (keywords + fuzzy/semantic intent matching for paraphrases, e.g., "turn off the
  safety sensor" should match same as "bypass interlock")
- Runs synchronously before any retrieval or generation step
- On match:
  - Immediately returns a fixed, pre-approved refusal message (from Safety Baseline Library)
  - Logs event: user, query, matched pattern, timestamp → immutable audit table
  - Auto-creates an escalation ticket to Safety Officer (high priority)
- This gate CANNOT be overridden by prompt engineering from the user side, since
  it executes outside the LLM entirely

## 4. Composite Confidence Scoring (NEW — Detailed Design)

Final confidence = weighted combination of:

| Signal | Method | Weight (example) |
|---|---|---|
| Retrieval Similarity | Vector cosine similarity of top-k chunks vs. query | 35% |
| Citation Validator | Span-overlap / lightweight entailment check: does generated sentence content appear in retrieved chunk text | 30% |
| Numeric/Unit Consistency | Regex-extract numbers/units from generated answer, verify exact match exists in cited source | 20% |
| Conflict Detection | Compare retrieved chunks pairwise for contradicting statements; penalize confidence if conflict found | 15% |

- Threshold (e.g., ≥80%) required to deliver a direct grounded answer
- Below threshold → Safety-First Fallback + Escalation Draft triggered
- All four sub-scores displayed in the UI/dossier panel (transparency, not a black-box number)

## 5. Safety Baseline Library (NEW)
- A separate, small, versioned, expert-curated table of universal safety statements
  (lockout-tagout, PPE, isolation) — independent of machine-specific SOP content
- Used exclusively as the fallback source when machine-specific confidence is
  insufficient — ensures the fallback message is still a "grounded citation" (from
  this library), resolving the grounding/safety-first contradiction

## 6. Voice Pipeline (Updated)
1. Audio captured → Whisper/faster-whisper transcribes
2. **Transcript Confirmation Step**: transcribed text shown to user with
   Confirm/Edit option — query does NOT proceed to retrieval until confirmed
3. On confirm → proceeds through safety gate → retrieval → generation pipeline
4. Response generated → gTTS/Bhashini produces audio output
5. Both text and audio delivered simultaneously

## 7. Agentic Drafting Module (NEW)
- **Escalation Brief Generator**: on fallback, LLM summarizes query context into a
  structured brief (symptom, machine ID, prior steps if any, confidence breakdown)
  → stored as a draft, routed to expert for approve/edit/send
- **SOP Change Proposal Generator**: triggered when `sop_gap_flags` for a given
  machine/topic exceed a configurable threshold (e.g., 3 occurrences) → LLM drafts
  a proposed addition/edit to the relevant document → stored in
  `sop_change_proposals`, requires expert approval before merging into live `documents`

## 8. Demo/Resilience Cache Layer (NEW)
- A lightweight key-value cache (can be as simple as a local JSON/Redis store)
  mapping known demo queries → pre-validated full responses (text+voice+citation+diagram)
- API layer includes a timeout/circuit-breaker wrapper around the live LLM call;
  on failure/timeout, falls back to this cache transparently
- Also usable in production as a general resilience pattern for frequently-asked,
  stable queries

## 9. Security Considerations (Retained + Added)
- RBAC at factory/branch/user level
- Encrypted storage (Supabase)
- Immutable audit logs for: document revisions, expert corrections, safety-gate
  refusals, escalation events
- API authentication via Supabase Auth (JWT)

## 10. Scalability Considerations (Retained from v1)
- Metadata-based multi-tenancy (factory_id, branch_id)
- Vector DB partitioning by factory
- Stateless API design for horizontal scaling