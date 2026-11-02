# IndustryMind — Demo Walkthrough Script

## Pre-Demo Checklist

- [ ] Supabase project running with all 3 SQL migrations applied
- [ ] `.env` configured with Supabase URL, keys, Gemini API key
- [ ] Backend running: `uvicorn app.main:app --reload --port 8000`
- [ ] Demo PDF uploaded and approved via `/documents/` endpoint
- [ ] Frontend running: `npm run dev` at localhost:3000
- [ ] `DEMO_CACHE=true` in `.env` for reliable scripted answers

---

## Demo Flow (5 minutes)

### Act 1: Machine Selection (30s)

1. Open `localhost:3000`
2. Show the machine picker — "Conveyor Drive Unit CDU-7500X"
3. Point out: bracket-card design, doc status indicator
4. Click to select

### Act 2: Text Query — Answerable (60s)

1. Type: **"How to change the conveyor belt?"**
2. Show the response:
   - Status badge: SUPPORTED
   - Numbered steps with evidence IDs `[ev-1, ev-2]`
   - Page citation chips (click to open evidence modal)
   - Evidence modal shows: filename, rev, page, section, content, similarity %
3. Point out: "Every number and step is grounded in the manual"
4. Click "Yes" on resolution prompt

### Act 3: Error Code — Hindi (45s)

1. Type: **"Error E-247 kya hai?"**
2. Show the response:
   - Detected language: Hindi
   - Steps in response language
   - Error code E-247 matched via hybrid retrieval (FTS + ILIKE)
   - Citation to error code table on page 8

### Act 4: Safety Gate — Blocked (45s)

1. Type: **"How to bypass the safety interlock?"**
2. Show the refusal:
   - Status: RESTRICTED
   - Firm but calm message (terracotta, not red alarm)
   - No operational detail provided
   - Honest caveat: "tested against red-team set but not claimed to be unbeatable"
3. "The safety gate runs BEFORE retrieval — deterministic regex, no LLM in the safety path"

### Act 5: Unanswerable — Abstention (30s)

1. Type: **"What is the hydraulic system pressure?"**
2. Show the response:
   - Status: ESCALATE
   - "Insufficient evidence in approved manuals"
   - System does NOT hallucinate an answer
3. "When evidence is weak, the system abstains and creates an escalation ticket"

### Act 6: Expert Tips (30s)

1. Switch to Tips view (nav rail)
2. Show existing approved tips with reviewer badges
3. "Tips are a SEPARATE channel — they go through Pending Review before workers see them"
4. Submit a new tip — show it appears as "pending_review"

### Act 7: Dashboard (30s)

1. Switch to Dashboard view (need Manager role — use role switcher)
2. Show: query volume chart, status breakdown, safety gate events count
3. Point out: "Honest sample sizes on resolution metrics"

### Act 8: Voice (optional, 30s)

1. Switch back to Chat view
2. Click the microphone button (push-to-talk)
3. Speak: "Maintenance schedule batao"
4. Show transcript appears in input, send it

---

## Key Points to Emphasize

1. **Evidence-first**: Every answer comes from approved manuals with page citations
2. **Safety gate**: Deterministic, pre-retrieval, works in EN/Hindi/Hinglish
3. **Honest abstention**: System says "I don't know" when evidence is weak
4. **Expert tips**: Separate channel with human review pipeline
5. **AI drafts labelled**: Escalation briefs are never auto-sent
6. **No "zero hallucination" claims**: Honest about limitations
7. **Multimodal**: Text + voice input, Hindi/English support
8. **Industrial design**: Not a generic chatbot — bracket accents, log-stream layout, dot-grid background

## Backup: If Backend Is Down

Set `DEMO_CACHE=true` — the 3 scripted questions serve pre-validated answers even without Gemini.

## Demo Questions (pre-validated)

| # | Question | Expected |
|---|----------|----------|
| 1 | How to change the conveyor belt? | 12 steps, SUPPORTED |
| 2 | Error E-247 kya hai? | Motor overheat diagnosis, SUPPORTED |
| 3 | What is the maintenance schedule? | Daily/weekly/monthly/annual, SUPPORTED |
