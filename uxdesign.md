# IndustryMind — UI/UX Design Brief v2.0 (FINAL, LOCKED)

## 1. Design Philosophy (Unchanged Principles)
- Light theme, warm and calm, never clinical
- Non-AI-generated look — explicitly avoiding generic SaaS/AI-tool visual cliches
- Usable by all literacy/tech-comfort levels
- Attractive, interactive, award-tier polish
- Industrial-authentic identity (not generic chat app skin)

## 2. LOCKED Color Palette (Final — supersedes v1 proposal)

| Role | Hex | Notes |
|---|---|---|
| Background (base) | #F6F3EE | Warm, textured with subtle dot-grid |
| Surface/Cards | #FFFFFF | |
| Ink (text/dark elements) | #1C2B29 | Used for nav rail, headers — NOT pure black |
| Primary (brand/CTA) | #26524D | Deep muted teal |
| Primary Hover | #1C3F3B | |
| Primary Light (tint) | #E5EDEB | |
| Graphite (accents/borders on brackets) | #CFC9BC | |
| Amber (Safety/Warning) | #B8762F | |
| Amber Light | #F6EBDA | |
| Sage (Success) | #6E8862 | |
| Terracotta (Alert/Escalation) | #A85A42 | |
| Terracotta Light | #F2E4DF | |
| Text Secondary | #5C6460 | |
| Text Muted | #9A9488 | |
| Border | #E2DCCE | |

**EXPLICITLY REMOVED:** Indigo/purple tones, pure black (#000), pure white
backgrounds without warmth — these read as generic "AI product" visual cliches.

## 3. LOCKED Typography

- **Technical/Data Elements** (timestamps, citations, codes, confidence scores,
  input field): **JetBrains Mono**
- **Body/UI Text**: A humanist sans-serif distinct from Inter — recommend
  **General Sans** or **Archivo** (final pick to be confirmed by visual test,
  but Inter is explicitly EXCLUDED as it is the default font of nearly every
  AI/SaaS competitor product)

## 4. Visual Signature Elements (Confirmed from accepted mockup)
- **Corner-bracket accents** on major panels (machine-card, diagrams, citations) —
  our distinct visual signature, evokes technical/industrial equipment labeling
- **Log-stream conversation** layout (not chat bubbles) — reinforces "technical
  system" identity over "chatbot" identity
- **Persistent right-side Dossier panel** — machine context, diagram viewer,
  citation, escalation contact always visible
- **Icon-only nav rail** (dark ink background) instead of heavy labeled sidebar
- **Confidence gauge** — circular conic-gradient visualization, now must display
  the 4-signal composite breakdown (retrieval/citation/numeric/conflict) on hover
  or expand, not just a single %

## 5. New Screen-Specific Design Notes
- **Safety Refusal Screen**: Should NOT use red/alarm styling (avoid cliché
  "error" visual language) — use the Terracotta tone, firm but not alarming,
  paired with clear, calm typographic authority ("This action cannot be
  performed") rather than aggressive warning iconography
- **Transcript Confirmation**: lightweight modal/inline card, large readable
  text, big Confirm/Edit buttons (gloved-hand friendly touch targets)
- **Resolution Prompt**: minimal, single-line, appears inline after answer —
  should not feel like an interruption or survey
- **Escalation Brief (Expert view)**: styled like a structured incident report
  card — using monospace for structured fields, clear visual hierarchy between
  AI-drafted content and human-editable fields

## 6. Accessibility (Retained from v1)
- WCAG AA contrast minimum maintained despite muted palette
- Large tap targets (gloved-hand factory use)
- Voice-first fallback for low-literacy users
- Multi-language UI labels

## 7. Status
This palette and typography system is now LOCKED for production use across all
screens. Any further screens (Expert Dashboard, Admin Panel, Safety Refusal
screen, etc.) must adhere strictly to this system.