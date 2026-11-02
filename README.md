# IndustryMind

**Evidence-first multimodal assistant for industrial SOPs, manuals & expert knowledge.**

Built for Indux 5.0-2026 Hackathon — Problem Statement #2.

---

## What It Does

A technician selects a machine, asks a question by text or Hindi/English voice, and gets numbered steps taken **only from approved manuals**, with page-level citations. The system:

- **Refuses** unsafe requests (bypass/disable safety devices)
- **Abstains & escalates** when evidence is weak
- **Separates** reviewed expert tips from official SOPs
- **Labels** AI-drafted escalation briefs as drafts

## Architecture

```
Frontend (Next.js 16)  -->  Backend (FastAPI)  -->  Supabase (Postgres + pgvector)
                                |                         |
                            Gemini Flash              embeddings (768-dim)
                            faster-whisper            match_chunks RPC
```

## Quick Start

### 1. Database Setup (Supabase)

```bash
# Create project at https://supabase.com
# Run in SQL Editor:
psql < db/001_schema.sql
psql < db/002_hackathon_slice.sql
psql < db/003_seed.sql
# Create private bucket: "industrymind"
```

### 2. Backend

```bash
cd backend
cp ../.env.example .env      # Fill in Supabase + Gemini keys
pip install -r requirements.txt
python -m scripts.generate_demo_pdf   # Creates demo_data/CDU-7500X_Manual_Rev3.2.pdf
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # Opens at localhost:3000
```

### 4. Run Tests

```bash
cd backend
python -m pytest tests/ -v    # 55 tests, all pure logic (no DB needed)
```

### 5. Run Evaluation

```bash
cd indus
python -m eval.run            # Offline: safety gate + validator (29/29)
python -m eval.run --live     # Live: full pipeline (needs Supabase + Gemini)
```

## Project Structure

```
indus/
  db/
    001_schema.sql            # Base tables, indexes, FTS, RPCs
    002_hackathon_slice.sql   # Hackathon tables + safety baseline
    003_seed.sql              # Factory, branch, demo machine
  backend/
    app/
      core/                   # Config, database client
      models/                 # Pydantic schemas
      services/               # Safety gate, retrieval, embeddings,
                              # Gemini client, citation validator,
                              # ingestion, demo cache
      api/                    # Machines, documents, queries, voice,
                              # tips, escalations, sessions, analytics
    tests/                    # 55 unit tests
    scripts/                  # Demo PDF generator, seed events
    demo_data/                # Generated CDU-7500X manual
  frontend/
    src/
      app/                    # Next.js app (layout, page, globals.css)
      components/             # NavRail, MachinePicker, ChatView,
                              # VoiceButton, EvidenceModal, DashboardView,
                              # TipsView, EscalationsView, AdminView
      lib/                    # API client, context provider
  eval/
    questions.csv             # 30 eval questions
    run.py                    # Evaluation script
    results.json              # Latest results
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| ONE vector store (pgvector) | No ChromaDB. Single source of truth. |
| Deterministic safety gate | Regex pre-retrieval. No LLM in safety path. |
| 3-veto citation validator | Evidence ID, number grounding, source conflict. |
| Hybrid retrieval (RRF) | pgvector + FTS + error-code ILIKE merged. |
| Expert tips = separate channel | Pending Review -> Approved/Rejected by human. |
| AI drafts labelled as drafts | Escalation briefs are never auto-sent. |
| Demo cache | Pre-validated answers for scripted demo. |
| No "zero hallucination" claims | Honest red-team caveat in refusal message. |

## Eval Results (Offline)

| Metric | Score |
|--------|-------|
| Safety Gate Accuracy | 29/29 (100%) |
| Safe Noun Pass | 1/1 |
| Unit Tests | 55/55 |

## Design System

- **Palette**: Warm muted tones (no gradients, no glassmorphism)
- **Fonts**: Archivo (body) + JetBrains Mono (data)
- **Visual**: Corner-bracket accents, dot-grid background, log-stream layout
- **NOT used**: Inter, pure black, vibrant AI-product colors

## Honest Limitations

- Safety gate tested against curated set, not claimed to be unbeatable
- LLM grounding quality depends on retrieval quality and prompt
- Hindi STT accuracy varies with ambient noise and accent
- Threshold calibration requires larger eval set for production

## License

Hackathon submission. Not for production use without further safety validation.
